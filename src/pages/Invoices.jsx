import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { useEffect, useState } from 'react'
import { addDocument, getDocuments, updateDocument, deleteDocument } from '../firebase'

const fmt = n => '₹' + Number(n || 0).toLocaleString('en-IN')
const today = () => new Date().toISOString().split('T')[0]
const genNo = (type) => (type === 'sale' ? 'INV-' : 'PUR-') + Date.now().toString().slice(-6)
const EMPTY_INV = { invoice_no: '', type: 'sale', party_id: '', party_name: '', date: today(), notes: '', paid: 0, status: 'unpaid' }
const EMPTY_LINE = { item_id: '', item_name: '', qty: 1, rate: 0, gst_rate: 0, amount: 0, gst_amount: 0 }

export default function Invoices() {
  const [invoices, setInvoices] = useState([])
  const [parties, setParties] = useState([])
  const [items, setItems] = useState([])
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState(EMPTY_INV)
  const [lines, setLines] = useState([{ ...EMPTY_LINE }])
  const [saving, setSaving] = useState(false)

  const load = async () => {
    const snap = await getDocuments('invoices')
    setInvoices(snap.docs.map(d => ({ id: d.id, ...d.data() })))
  }

  useEffect(() => {
    load()
    getDocuments('parties').then(s => setParties(s.docs.map(d => ({ id: d.id, ...d.data() }))))
    getDocuments('items').then(s => setItems(s.docs.map(d => ({ id: d.id, ...d.data() }))))
  }, [])

  const filtered = invoices.filter(inv => {
    const matchType = filter === 'all' || inv.type === filter
    const matchSearch = inv.party_name?.toLowerCase().includes(search.toLowerCase()) || inv.invoice_no?.includes(search)
    return matchType && matchSearch
  })

  const openNew = () => {
    setForm({ ...EMPTY_INV, invoice_no: genNo('sale'), date: today() })
    setLines([{ ...EMPTY_LINE }])
    setModal(true)
  }

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

  const setF = (k, v) => setForm(f => {
    const updated = { ...f, [k]: v }
    if (k === 'type') updated.invoice_no = genNo(v)
    if (k === 'party_id') {
      const p = parties.find(p => p.id === v)
      updated.party_name = p?.name || ''
    }
    return updated
  })

  const save = async () => {
    if (!form.party_name.trim()) return alert('Select a party')
    if (lines.every(l => !l.item_name)) return alert('Add at least one item')
    setSaving(true)
    const data = { ...form, total: totals.sub, tax: totals.tax, grand_total: grandTotal, items: lines.filter(l => l.item_name) }
    if (form.id) {
      const { id, ...rest } = data
      await updateDocument('invoices', id, rest)
    } else {
      await addDocument('invoices', data)
    }
    setSaving(false)
    setModal(false)
    load()
  }

  const del = async (id) => {
    if (!confirm('Delete this invoice?')) return
    await deleteDocument('invoices', id)
    load()
  }

  const generatePDF = (inv) => {
    const doc = new jsPDF()
    doc.setFontSize(22)
    doc.setTextColor(79, 70, 229)
    doc.text('FYNLO', 105, 18, { align: 'center' })
    doc.setFontSize(11)
    doc.setTextColor(100, 100, 100)
    doc.text('Smart Business Software', 105, 25, { align: 'center' })
    doc.setDrawColor(79, 70, 229)
    doc.setLineWidth(0.5)
    doc.line(14, 30, 196, 30)
    doc.setFontSize(18)
    doc.setTextColor(30, 30, 30)
    doc.text('INVOICE', 14, 42)
    doc.setFontSize(11)
    doc.setTextColor(80, 80, 80)
    doc.text('Invoice No: ' + inv.invoice_no, 14, 52)
    doc.text('Date: ' + inv.date, 14, 60)
    doc.text('Party: ' + inv.party_name, 14, 68)
    doc.text('Type: ' + inv.type.toUpperCase(), 14, 76)
    const statusColor = inv.status === 'paid' ? [5, 150, 105] : [217, 119, 6]
    doc.setTextColor(...statusColor)
    doc.text('Status: ' + inv.status.toUpperCase(), 140, 52)
    doc.setTextColor(30, 30, 30)
    autoTable(doc, {
      startY: 85,
      head: [['Item', 'Qty', 'Rate (Rs)', 'GST%', 'GST Amt', 'Total']],
      body: (inv.items || []).map(item => [
        item.item_name,
        item.qty,
        Number(item.rate).toFixed(2),
        item.gst_rate + '%',
        Number(item.gst_amount).toFixed(2),
        Number(item.amount + item.gst_amount).toFixed(2)
      ]),
      foot: [
        ['', '', '', '', 'Subtotal', Number(inv.total).toFixed(2)],
        ['', '', '', '', 'GST', Number(inv.tax).toFixed(2)],
        ['', '', '', '', 'Grand Total', 'Rs ' + Number(inv.grand_total).toFixed(2)]
      ],
      headStyles: { fillColor: [79, 70, 229], textColor: 255, fontStyle: 'bold' },
      footStyles: { fillColor: [238, 242, 255], textColor: [30, 30, 30], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [249, 250, 251] },
    })
    if (inv.notes) {
      const finalY = doc.lastAutoTable.finalY + 10
      doc.setFontSize(10)
      doc.setTextColor(100, 100, 100)
      doc.text('Notes: ' + inv.notes, 14, finalY)
    }
    doc.setFontSize(9)
    doc.setTextColor(150, 150, 150)
    doc.text('Generated by Fynlo - Smart Business Software', 105, 285, { align: 'center' })
    doc.save('Invoice-' + inv.invoice_no + '.pdf')
  }

  return (
    <div>
      <div className="page-header">
        <div><h1 className="page-title">Billing</h1><p className="page-sub">Sales invoices and purchase bills</p></div>
        <button className="btn btn-primary" onClick={openNew}>+ New Invoice</button>
      </div>

      <div className="search-bar">
        <div className="flex gap-2">
          {['all', 'sale', 'purchase'].map(t => (
            <button key={t} className={`btn btn-sm ${filter === t ? 'btn-primary' : ''}`} onClick={() => setFilter(t)}>
              {t === 'all' ? 'All' : t === 'sale' ? 'Sales' : 'Purchases'}
            </button>
          ))}
        </div>
        <input className="search-input" placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <div className="table-wrap">
        <table>
          <thead><tr><th>Invoice No</th><th>Type</th><th>Party</th><th>Date</th><th>Amount</th><th>Tax</th><th>Total</th><th>Status</th><th>Action</th></tr></thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={9}><div className="empty-state"><div className="empty-icon">📄</div><div>No invoices yet</div></div></td></tr>
            ) : filtered.map(inv => (
              <tr key={inv.id}>
                <td className="fw-bold">{inv.invoice_no}</td>
                <td><span className={`badge ${inv.type === 'sale' ? 'badge-green' : 'badge-blue'}`}>{inv.type}</span></td>
                <td>{inv.party_name}</td>
                <td>{inv.date}</td>
                <td>{fmt(inv.total)}</td>
                <td>{fmt(inv.tax)}</td>
                <td className="fw-bold">{fmt(inv.grand_total)}</td>
                <td><span className={`badge ${inv.status === 'paid' ? 'badge-green' : 'badge-yellow'}`}>{inv.status}</span></td>
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

      {modal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModal(false)}>
          <div className="modal modal-lg">
            <div className="modal-header">
              <span className="modal-title">New Invoice</span>
              <button className="close-btn" onClick={() => setModal(false)}>×</button>
            </div>
            <div className="form-row-3 mb-4">
              <div className="form-group">
                <label>Type</label>
                <select value={form.type} onChange={e => setF('type', e.target.value)}>
                  <option value="sale">Sale Invoice</option>
                  <option value="purchase">Purchase Bill</option>
                </select>
              </div>
              <div className="form-group">
                <label>Invoice No</label>
                <input value={form.invoice_no} onChange={e => setF('invoice_no', e.target.value)} />
              </div>
              <div className="form-group">
                <label>Date</label>
                <input type="date" value={form.date} onChange={e => setF('date', e.target.value)} />
              </div>
            </div>
            <div className="form-row mb-4">
              <div className="form-group">
                <label>Party *</label>
                <select value={form.party_id} onChange={e => setF('party_id', e.target.value)}>
                  <option value="">-- Select Party --</option>
                  {parties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Payment Status</label>
                <select value={form.status} onChange={e => setF('status', e.target.value)}>
                  <option value="unpaid">Unpaid</option>
                  <option value="paid">Paid</option>
                  <option value="partial">Partial</option>
                </select>
              </div>
            </div>
            <div className="section-title">Items</div>
            <div className="table-wrap mb-4">
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
                    <td colSpan={4} className="fw-bold">Total</td>
                    <td className="fw-bold">{fmt(totals.sub)}</td>
                    <td className="fw-bold">{fmt(totals.tax)}</td>
                    <td className="fw-bold">{fmt(grandTotal)}</td>
                    <td></td>
                  </tr>
                </tbody>
              </table>
            </div>
            <button className="btn btn-sm mb-4" onClick={() => setLines(ls => [...ls, { ...EMPTY_LINE }])}>+ Add Item</button>
            <div className="form-group">
              <label>Notes</label>
              <textarea value={form.notes} onChange={e => setF('notes', e.target.value)} placeholder="Optional notes..." style={{ minHeight: 60 }} />
            </div>
            <div className="modal-footer">
              <button className="btn" onClick={() => setModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving...' : 'Save Invoice'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
