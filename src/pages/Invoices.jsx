import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { useAuth } from '../AuthContext'
import { useEffect, useRef, useState } from 'react'
import { addDocument, getDocuments, updateDocument, deleteDocument, db } from '../firebase'
import { collection, getDocs, query, where } from 'firebase/firestore'
import { Html5Qrcode } from 'html5-qrcode'

const fmt = n => '₹' + Number(n || 0).toLocaleString('en-IN')
const today = () => new Date().toISOString().split('T')[0]
const genNo = () => 'INV-' + Date.now().toString().slice(-6)

const EMPTY_INV = {
  invoice_no: '',
  type: 'sale',
  party_id: '',
  party_name: '',
  party_phone: '',
  date: today(),
  notes: '',
  status: 'unpaid',
  payment_method: 'cash',
  // Split payment fields
  cash_amount: 0,
  upi_amount: 0,
  card_amount: 0,
  upi_ref: '',
  card_last4: '',
}
const EMPTY_LINE = { item_id: '', item_name: '', qty: 1, rate: 0, gst_rate: 0, amount: 0, gst_amount: 0 }
const WALKIN = { id: 'walkin', name: 'Walk-in Customer', phone: '' }

const PAYMENT_METHODS = [
  { value: 'cash', label: '💵 Cash' },
  { value: 'upi', label: '📱 UPI' },
  { value: 'card', label: '💳 Card' },
  { value: 'credit', label: '📒 Credit (Udhaar)' },
  { value: 'split', label: '🔀 Split Payment' },
]

export default function Invoices() {
  const user = useAuth()
  const uid = user?.uid
  const [invoices, setInvoices] = useState([])
  const [customers, setCustomers] = useState([])
  const [items, setItems] = useState([])
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState(EMPTY_INV)
  const [lines, setLines] = useState([{ ...EMPTY_LINE }])
  const [saving, setSaving] = useState(false)

  // Customer search/autocomplete
  const [custSearch, setCustSearch] = useState('')
  const [custDropdown, setCustDropdown] = useState(false)

  // Scanner state
  const [scannerActive, setScannerActive] = useState(false)
  const [scannerMsg, setScannerMsg] = useState('')
  const [assocModal, setAssocModal] = useState(null)
  const [assocItemId, setAssocItemId] = useState('')
  const [assocSaving, setAssocSaving] = useState(false)

  const html5QrRef = useRef(null)
  const scannerDivId = 'fynlo-qr-reader'

  const load = async () => {
    const snap = await getDocuments(uid, 'invoices')
    setInvoices(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(i => i.type === 'sale'))
  }

  useEffect(() => {
    load()
    getDocuments(uid, 'parties').then(s => {
      const all = s.docs.map(d => ({ id: d.id, ...d.data() }))
      setCustomers(all.filter(p => p.type === 'customer' || p.type === 'both'))
    })
    getDocuments(uid, 'items').then(s => setItems(s.docs.map(d => ({ id: d.id, ...d.data() }))))
  }, [])

  useEffect(() => { return () => { stopScanner() } }, [])

  // Customer search filter
  const filteredCustomers = custSearch.trim()
    ? [WALKIN, ...customers].filter(c =>
        c.name.toLowerCase().includes(custSearch.toLowerCase()) ||
        (c.phone || '').includes(custSearch)
      )
    : [WALKIN, ...customers]

  const filtered = invoices.filter(inv =>
    inv.party_name?.toLowerCase().includes(search.toLowerCase()) ||
    inv.invoice_no?.includes(search)
  )

  const openNew = () => {
    setForm({ ...EMPTY_INV, invoice_no: genNo(), date: today() })
    setLines([{ ...EMPTY_LINE }])
    setCustSearch('')
    setModal(true)
  }

  // Select customer from dropdown
  const selectCustomer = (c) => {
    setF('party_id', c.id === 'walkin' ? '' : c.id)
    setF('party_name', c.id === 'walkin' ? 'Walk-in Customer' : c.name)
    setF('party_phone', c.phone || '')
    setCustSearch(c.id === 'walkin' ? 'Walk-in Customer' : c.name)
    setCustDropdown(false)
  }

  // If user types new name (not from list), keep as-is for auto-add
  const handleCustInput = (val) => {
    setCustSearch(val)
    setF('party_name', val)
    setF('party_id', '')
    setF('party_phone', '')
    setCustDropdown(true)
  }

  // ---------- SCANNER ----------
  const startScanner = async () => {
    setScannerMsg('Camera shuru ho rahi hai...')
    setScannerActive(true)
    await new Promise(r => setTimeout(r, 200))
    try {
      const qr = new Html5Qrcode(scannerDivId)
      html5QrRef.current = qr
      await qr.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 150 } },
        (decodedText) => { handleScan(decodedText) },
        () => {}
      )
      setScannerMsg('Camera scan karo...')
    } catch (err) {
      setScannerMsg('Camera access nahi mila: ' + err)
    }
  }

  const stopScanner = async () => {
    if (html5QrRef.current) {
      try { await html5QrRef.current.stop() } catch (e) {}
      html5QrRef.current = null
    }
    setScannerActive(false)
    setScannerMsg('')
  }

  const handleScan = async (code) => {
    await stopScanner()
    setScannerMsg('🔍 Barcode mila: ' + code)
    const directMatch = items.find(i => i.barcode === code || i.id === code)
    if (directMatch) { addLineFromItem(directMatch); setScannerMsg('✅ ' + directMatch.name + ' add ho gaya!'); setTimeout(() => setScannerMsg(''), 2500); return }
    const mapSnap = await getDocs(query(collection(db, 'barcode_map'), where('barcode', '==', code)))
    if (!mapSnap.empty) {
      const mapped = mapSnap.docs[0].data()
      const foundItem = items.find(i => i.id === mapped.item_id)
      if (foundItem) { addLineFromItem(foundItem); setScannerMsg('✅ ' + foundItem.name + ' add ho gaya!'); setTimeout(() => setScannerMsg(''), 2500); return }
    }
    setAssocModal({ scannedCode: code }); setAssocItemId('')
  }

  const addLineFromItem = (item) => {
    const newLine = { item_id: item.id, item_name: item.name, qty: 1, rate: item.sale_price, gst_rate: item.gst_rate, amount: item.sale_price, gst_amount: item.sale_price * item.gst_rate / 100 }
    setLines(ls => ls.length === 1 && !ls[0].item_name ? [newLine] : [...ls, newLine])
  }

  const saveAssociation = async () => {
    if (!assocItemId) return alert('Item select karo')
    setAssocSaving(true)
    await addDocument(uid, 'barcode_map', { barcode: assocModal.scannedCode, item_id: assocItemId })
    const foundItem = items.find(i => i.id === assocItemId)
    if (foundItem) addLineFromItem(foundItem)
    setAssocSaving(false); setAssocModal(null)
    setScannerMsg('✅ ' + (foundItem?.name || '') + ' associated & add ho gaya!'); setTimeout(() => setScannerMsg(''), 2500)
  }
  // ---------- END SCANNER ----------

  const calcLine = (line) => {
    const amount = (line.qty || 0) * (line.rate || 0)
    const gst_amount = amount * (line.gst_rate || 0) / 100
    return { ...line, amount, gst_amount }
  }

  const setLine = (i, k, v) => {
    setLines(ls => {
      const updated = [...ls]
      let line = { ...updated[i], [k]: v }
      if (k === 'item_id') {
        const item = items.find(it => it.id === v)
        if (item) { line.item_name = item.name; line.rate = item.sale_price; line.gst_rate = item.gst_rate }
      }
      updated[i] = calcLine(line)
      return updated
    })
  }

  const totals = lines.reduce((acc, l) => ({ sub: acc.sub + (l.amount || 0), tax: acc.tax + (l.gst_amount || 0) }), { sub: 0, tax: 0 })
  const grandTotal = totals.sub + totals.tax

  // Split payment validation
  const splitTotal = (Number(form.cash_amount) || 0) + (Number(form.upi_amount) || 0) + (Number(form.card_amount) || 0)
  const splitValid = form.payment_method !== 'split' || Math.abs(splitTotal - grandTotal) < 1

  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }))

  // Auto-determine status from payment method
  const getStatusFromPayment = (method) => {
    if (method === 'credit') return 'unpaid'
    if (method === 'split') return 'partial'
    return 'paid'
  }

  const handlePaymentChange = (method) => {
    setForm(f => ({
      ...f,
      payment_method: method,
      status: getStatusFromPayment(method),
      cash_amount: method === 'split' ? 0 : f.cash_amount,
      upi_amount: method === 'split' ? 0 : f.upi_amount,
      card_amount: method === 'split' ? 0 : f.card_amount,
    }))
  }

  const save = async () => {
    if (!form.party_name?.trim()) return alert('Customer name ya Walk-in select karo')
    if (lines.every(l => !l.item_name)) return alert('At least ek item add karo')
    if (form.payment_method === 'split' && !splitValid) return alert(`Split total (${fmt(splitTotal)}) must match Grand Total (${fmt(grandTotal)})`)

    setSaving(true)

    // Auto-add new customer if name+phone entered and not from existing list
    let finalPartyId = form.party_id
    let finalPartyName = form.party_name

    if (!form.party_id && form.party_name && form.party_name !== 'Walk-in Customer') {
      // Check if customer with same phone already exists
      const existing = form.party_phone
        ? customers.find(c => c.phone === form.party_phone)
        : customers.find(c => c.name.toLowerCase() === form.party_name.toLowerCase())

      if (existing) {
        finalPartyId = existing.id
        finalPartyName = existing.name
      } else {
        // Add new customer automatically
        const newCust = await addDocument(uid, 'parties', {
          name: form.party_name,
          phone: form.party_phone || '',
          email: '',
          address: '',
          gstin: '',
          type: 'customer',
          balance: 0,
        })
        finalPartyId = newCust.id
        finalPartyName = form.party_name
        // Refresh customer list
        getDocuments(uid, 'parties').then(s => {
          const all = s.docs.map(d => ({ id: d.id, ...d.data() }))
          setCustomers(all.filter(p => p.type === 'customer' || p.type === 'both'))
        })
      }
    }

    const data = {
      ...form,
      type: 'sale',
      party_id: finalPartyId,
      party_name: finalPartyName,
      total: totals.sub,
      tax: totals.tax,
      grand_total: grandTotal,
      items: lines.filter(l => l.item_name),
    }

    if (form.id) {
      const { id, ...rest } = data
      await updateDocument(uid, 'invoices', id, rest)
    } else {
      await addDocument(uid, 'invoices', data)
    }

    setSaving(false)
    setModal(false)
    load()
  }

  const del = async (id) => {
    if (!confirm('Delete this invoice?')) return
    await deleteDocument(uid, 'invoices', id)
    load()
  }

  const generatePDF = (inv) => {
    const doc = new jsPDF()
    doc.setFontSize(22); doc.setTextColor(79, 70, 229)
    doc.text('FYNLO', 105, 18, { align: 'center' })
    doc.setFontSize(11); doc.setTextColor(100, 100, 100)
    doc.text('Smart Business Software', 105, 25, { align: 'center' })
    doc.setDrawColor(79, 70, 229); doc.setLineWidth(0.5); doc.line(14, 30, 196, 30)
    doc.setFontSize(18); doc.setTextColor(30, 30, 30); doc.text('INVOICE', 14, 42)
    doc.setFontSize(11); doc.setTextColor(80, 80, 80)
    doc.text('Invoice No: ' + inv.invoice_no, 14, 52)
    doc.text('Date: ' + inv.date, 14, 60)
    doc.text('Customer: ' + inv.party_name, 14, 68)
    if (inv.party_phone) doc.text('Phone: ' + inv.party_phone, 14, 76)
    doc.text('Payment: ' + (PAYMENT_METHODS.find(p => p.value === inv.payment_method)?.label || inv.payment_method || '—'), 14, inv.party_phone ? 84 : 76)
    const statusColor = inv.status === 'paid' ? [5, 150, 105] : inv.status === 'partial' ? [217, 119, 6] : [220, 38, 38]
    doc.setTextColor(...statusColor)
    doc.text('Status: ' + inv.status.toUpperCase(), 140, 52)
    doc.setTextColor(30, 30, 30)
    autoTable(doc, {
      startY: 92,
      head: [['Item', 'Qty', 'Rate (₹)', 'GST%', 'GST Amt', 'Total']],
      body: (inv.items || []).map(item => [item.item_name, item.qty, Number(item.rate).toFixed(2), item.gst_rate + '%', Number(item.gst_amount).toFixed(2), Number(item.amount + item.gst_amount).toFixed(2)]),
      foot: [
        ['', '', '', '', 'Price (Before Tax)', Number(inv.total).toFixed(2)],
        ['', '', '', '', '+ GST', Number(inv.tax).toFixed(2)],
        ['', '', '', '', '= Final Price', '₹' + Number(inv.grand_total).toFixed(2)],
      ],
      headStyles: { fillColor: [79, 70, 229], textColor: 255, fontStyle: 'bold' },
      footStyles: { fillColor: [238, 242, 255], textColor: [30, 30, 30], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [249, 250, 251] },
    })
    if (inv.payment_method === 'split') {
      const y = doc.lastAutoTable.finalY + 10
      doc.setFontSize(10); doc.setTextColor(80, 80, 80)
      doc.text('Payment Breakup:', 14, y)
      if (inv.cash_amount > 0) doc.text('Cash: ₹' + inv.cash_amount, 14, y + 6)
      if (inv.upi_amount > 0) doc.text('UPI: ₹' + inv.upi_amount + (inv.upi_ref ? ' (Ref: ' + inv.upi_ref + ')' : ''), 14, y + 12)
      if (inv.card_amount > 0) doc.text('Card: ₹' + inv.card_amount + (inv.card_last4 ? ' (Last 4: ' + inv.card_last4 + ')' : ''), 14, y + 18)
    }
    if (inv.notes) {
      const finalY = doc.lastAutoTable.finalY + (inv.payment_method === 'split' ? 30 : 10)
      doc.setFontSize(10); doc.setTextColor(100, 100, 100)
      doc.text('Notes: ' + inv.notes, 14, finalY)
    }
    doc.setFontSize(9); doc.setTextColor(150, 150, 150)
    doc.text('Generated by Fynlo - Smart Business Software', 105, 285, { align: 'center' })
    doc.save('Invoice-' + inv.invoice_no + '.pdf')
  }

  const pmColor = { paid: 'badge-green', unpaid: 'badge-red', partial: 'badge-yellow' }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Billing</h1>
          <p className="page-sub">Customer sales invoices</p>
        </div>
        <button className="btn btn-primary" onClick={openNew}>+ New Invoice</button>
      </div>

      <div className="search-bar">
        <input className="search-input" placeholder="Search by customer or invoice no..." value={search} onChange={e => setSearch(e.target.value)} />
        <span className="text-muted">{invoices.length} invoices</span>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Invoice No</th><th>Customer</th><th>Date</th><th>Amount</th><th>Tax</th><th>Total</th><th>Payment</th><th>Status</th><th>Action</th></tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={9}><div className="empty-state"><div className="empty-icon">🧾</div><div>No invoices yet</div></div></td></tr>
            ) : filtered.map(inv => (
              <tr key={inv.id}>
                <td className="fw-bold">{inv.invoice_no}</td>
                <td>
                  <div className="fw-bold">{inv.party_name}</div>
                  {inv.party_phone && <div style={{ fontSize: 11, color: 'var(--text3)' }}>{inv.party_phone}</div>}
                </td>
                <td>{inv.date}</td>
                <td>{fmt(inv.total)}</td>
                <td>{fmt(inv.tax)}</td>
                <td className="fw-bold">{fmt(inv.grand_total)}</td>
                <td style={{ fontSize: 12 }}>{PAYMENT_METHODS.find(p => p.value === inv.payment_method)?.label || '—'}</td>
                <td><span className={`badge ${pmColor[inv.status] || 'badge-yellow'}`}>{inv.status}</span></td>
                <td>
                  <div className="flex gap-2">
                    <button className="btn btn-sm" onClick={() => generatePDF(inv)}>PDF</button>
                    <button className="btn btn-sm btn-danger" onClick={() => del(inv.id)}>Delete</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* New Invoice Modal */}
      {modal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModal(false)}>
          <div className="modal modal-lg">
            <div className="modal-header">
              <span className="modal-title">🧾 New Sale Invoice</span>
              <button className="close-btn" onClick={() => setModal(false)}>×</button>
            </div>

            {/* Invoice No + Date */}
            <div className="form-row mb-4">
              <div className="form-group">
                <label>Invoice No</label>
                <input value={form.invoice_no} onChange={e => setF('invoice_no', e.target.value)} />
              </div>
              <div className="form-group">
                <label>Date</label>
                <input type="date" value={form.date} onChange={e => setF('date', e.target.value)} />
              </div>
            </div>

            {/* Customer Section */}
            <div style={{ background: 'var(--primary-light)', borderRadius: 10, padding: '14px 16px', marginBottom: 16 }}>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10 }}>👤 Customer Details</div>
              <div className="form-row">
                <div className="form-group" style={{ position: 'relative' }}>
                  <label>Customer Name / Phone *</label>
                  <input
                    value={custSearch}
                    onChange={e => handleCustInput(e.target.value)}
                    onFocus={() => setCustDropdown(true)}
                    placeholder="Type name, phone, or Walk-in..."
                    autoComplete="off"
                  />
                  {custDropdown && filteredCustomers.length > 0 && (
                    <div style={{
                      position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
                      background: 'var(--card-bg)', border: '1px solid var(--border)',
                      borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.15)', maxHeight: 200, overflowY: 'auto'
                    }}>
                      {filteredCustomers.map(c => (
                        <div
                          key={c.id}
                          onClick={() => selectCustomer(c)}
                          style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid var(--border)', fontSize: 13 }}
                          onMouseEnter={e => e.currentTarget.style.background = 'var(--primary-light)'}
                          onMouseLeave={e => e.currentTarget.style.background = ''}
                        >
                          <div style={{ fontWeight: 600 }}>{c.name}</div>
                          {c.phone && <div style={{ fontSize: 11, color: 'var(--text3)' }}>{c.phone}</div>}
                          {c.id === 'walkin' && <div style={{ fontSize: 11, color: 'var(--text3)' }}>Default — no customer details</div>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="form-group">
                  <label>Phone (optional)</label>
                  <input
                    value={form.party_phone}
                    onChange={e => setF('party_phone', e.target.value)}
                    placeholder="9876543210"
                    disabled={form.party_name === 'Walk-in Customer'}
                  />
                </div>
              </div>
              {form.party_name && form.party_name !== 'Walk-in Customer' && !form.party_id && (
                <div style={{ fontSize: 12, color: 'var(--success)', marginTop: 4 }}>
                  ✨ New customer — will be auto-added to customer list on save
                </div>
              )}
              {form.party_id && form.party_name !== 'Walk-in Customer' && (
                <div style={{ fontSize: 12, color: 'var(--primary)', marginTop: 4 }}>
                  ✅ Existing customer linked
                </div>
              )}
            </div>

            {/* Barcode Scanner */}
            <div style={{ background: 'var(--primary-light)', borderRadius: 8, padding: '12px 16px', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontWeight: 600, fontSize: 13 }}>📷 Barcode Scanner</span>
                {!scannerActive
                  ? <button className="btn btn-sm btn-primary" onClick={startScanner}>📷 Camera Scan</button>
                  : <button className="btn btn-sm btn-danger" onClick={stopScanner}>⏹ Stop</button>
                }
              </div>
              {scannerMsg && <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 8 }}>{scannerMsg}</div>}
              {scannerActive && <div id={scannerDivId} style={{ width: '100%', borderRadius: 8, overflow: 'hidden' }} />}
            </div>

            {/* Items Table */}
            <div className="section-title">Items</div>
            <div className="table-wrap mb-2">
              <table>
                <thead><tr><th>Item</th><th>Qty</th><th>Rate</th><th>GST%</th><th>Amount</th><th>GST</th><th>Total</th><th></th></tr></thead>
                <tbody>
                  {lines.map((line, i) => (
                    <tr key={i}>
                      <td>
                        <select value={line.item_id} onChange={e => setLine(i, 'item_id', e.target.value)} style={{ minWidth: 140 }}>
                          <option value="">-- Select --</option>
                          {items.map(it => <option key={it.id} value={it.id}>{it.name}</option>)}
                        </select>
                      </td>
                      <td><input type="number" value={line.qty} onChange={e => setLine(i, 'qty', +e.target.value)} style={{ width: 70 }} /></td>
                      <td><input type="number" value={line.rate} onChange={e => setLine(i, 'rate', +e.target.value)} style={{ width: 90 }} /></td>
                      <td>
                        <select value={line.gst_rate} onChange={e => setLine(i, 'gst_rate', +e.target.value)} style={{ width: 70 }}>
                          {[0, 5, 12, 18, 28].map(r => <option key={r} value={r}>{r}%</option>)}
                        </select>
                      </td>
                      <td>{fmt(line.amount)}</td>
                      <td>{fmt(line.gst_amount)}</td>
                      <td className="fw-bold">{fmt(line.amount + line.gst_amount)}</td>
                      <td><button className="btn btn-sm btn-danger" onClick={() => setLines(ls => ls.filter((_, j) => j !== i))}>✕</button></td>
                    </tr>
                  ))}
                  <tr style={{ background: 'var(--primary-light)' }}>
                    <td colSpan={4} className="fw-bold">Price (Before Tax)</td>
                    <td className="fw-bold">{fmt(totals.sub)}</td>
                    <td className="fw-bold">+ {fmt(totals.tax)} GST</td>
                    <td className="fw-bold" style={{ color: 'var(--primary)' }}>{fmt(grandTotal)} Final</td>
                    <td></td>
                  </tr>
                </tbody>
              </table>
            </div>
            <button className="btn btn-sm mb-4" onClick={() => setLines(ls => [...ls, { ...EMPTY_LINE }])}>+ Add Item</button>

            {/* Payment Section */}
            <div style={{ background: 'var(--primary-light)', borderRadius: 10, padding: '14px 16px', marginBottom: 16 }}>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12 }}>💰 Payment Details</div>

              {/* Payment Method Buttons */}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
                {PAYMENT_METHODS.map(pm => (
                  <button
                    key={pm.value}
                    onClick={() => handlePaymentChange(pm.value)}
                    style={{
                      padding: '7px 14px',
                      borderRadius: 20,
                      border: form.payment_method === pm.value ? '2px solid var(--primary)' : '2px solid var(--border)',
                      background: form.payment_method === pm.value ? 'var(--primary)' : 'var(--card-bg)',
                      color: form.payment_method === pm.value ? '#fff' : 'var(--text1)',
                      fontWeight: 600,
                      fontSize: 12,
                      cursor: 'pointer',
                    }}
                  >
                    {pm.label}
                  </button>
                ))}
              </div>

              {/* UPI ref */}
              {form.payment_method === 'upi' && (
                <div className="form-group">
                  <label>UPI Reference / Transaction ID</label>
                  <input value={form.upi_ref} onChange={e => setF('upi_ref', e.target.value)} placeholder="e.g. 4356789012" />
                </div>
              )}

              {/* Card last 4 */}
              {form.payment_method === 'card' && (
                <div className="form-group">
                  <label>Card Last 4 Digits</label>
                  <input value={form.card_last4} onChange={e => setF('card_last4', e.target.value)} placeholder="e.g. 4242" maxLength={4} style={{ width: 120 }} />
                </div>
              )}

              {/* Credit / Udhaar */}
              {form.payment_method === 'credit' && (
                <div style={{ fontSize: 13, color: 'var(--danger)', fontWeight: 600 }}>
                  📒 Yeh amount customer ke udhaar mein add ho jaayega
                </div>
              )}

              {/* Split Payment */}
              {form.payment_method === 'split' && (
                <div>
                  <div className="form-row">
                    <div className="form-group">
                      <label>💵 Cash Amount</label>
                      <input type="number" value={form.cash_amount} onChange={e => setF('cash_amount', +e.target.value)} placeholder="0" />
                    </div>
                    <div className="form-group">
                      <label>📱 UPI Amount</label>
                      <input type="number" value={form.upi_amount} onChange={e => setF('upi_amount', +e.target.value)} placeholder="0" />
                    </div>
                    <div className="form-group">
                      <label>💳 Card Amount</label>
                      <input type="number" value={form.card_amount} onChange={e => setF('card_amount', +e.target.value)} placeholder="0" />
                    </div>
                  </div>
                  {form.upi_amount > 0 && (
                    <div className="form-group">
                      <label>UPI Reference</label>
                      <input value={form.upi_ref} onChange={e => setF('upi_ref', e.target.value)} placeholder="Transaction ID" />
                    </div>
                  )}
                  <div style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    background: splitValid ? 'rgba(5,150,105,0.1)' : 'rgba(220,38,38,0.1)',
                    borderRadius: 8, padding: '8px 12px', fontSize: 13, fontWeight: 600,
                    color: splitValid ? 'var(--success)' : 'var(--danger)'
                  }}>
                    <span>Split Total: {fmt(splitTotal)}</span>
                    <span>Grand Total: {fmt(grandTotal)}</span>
                    <span>{splitValid ? '✅ Match' : '❌ Mismatch'}</span>
                  </div>
                </div>
              )}

              {/* Status badge */}
              <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text2)' }}>
                Status: <span className={`badge ${pmColor[form.status] || 'badge-yellow'}`}>{form.status}</span>
              </div>
            </div>

            {/* Notes */}
            <div className="form-group">
              <label>Notes</label>
              <textarea value={form.notes} onChange={e => setF('notes', e.target.value)} placeholder="Optional notes..." style={{ minHeight: 60 }} />
            </div>

            <div className="modal-footer">
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--primary)' }}>Grand Total: {fmt(grandTotal)}</div>
              <div className="flex gap-2">
                <button className="btn" onClick={() => setModal(false)}>Cancel</button>
                <button className="btn btn-primary" onClick={save} disabled={saving || (form.payment_method === 'split' && !splitValid)}>
                  {saving ? 'Saving...' : '✅ Save Invoice'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Association Modal */}
      {assocModal && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 420 }}>
            <div className="modal-header">
              <span className="modal-title">🔗 Barcode Associate Karo</span>
            </div>
            <div style={{ padding: '16px 0' }}>
              <div style={{ background: 'var(--primary-light)', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontFamily: 'monospace', fontSize: 13 }}>
                Scanned: <strong>{assocModal.scannedCode}</strong>
              </div>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
                Yeh barcode kisi item se linked nahi hai. Ek baar associate karo, aage se automatically add ho jaayega.
              </p>
              <div className="form-group">
                <label>Inventory se Item Select Karo *</label>
                <select value={assocItemId} onChange={e => setAssocItemId(e.target.value)}>
                  <option value="">-- Item Select Karo --</option>
                  {items.map(i => <option key={i.id} value={i.id}>{i.name} — {fmt(i.sale_price)}</option>)}
                </select>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn" onClick={() => setAssocModal(null)}>Skip</button>
              <button className="btn btn-primary" onClick={saveAssociation} disabled={assocSaving}>
                {assocSaving ? 'Saving...' : '🔗 Associate & Add'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
