import { useEffect, useState } from 'react'
import { addDocument, getDocuments, updateDocument, deleteDocument } from '../firebase'

const fmt = n => '₹' + Number(n || 0).toLocaleString('en-IN')
const today = () => new Date().toISOString().split('T')[0]
const EMPTY_VENDOR = { name: '', phone: '', email: '', address: '', gstin: '', bank_name: '', account_no: '', ifsc: '', upi_id: '', type: 'vendor' }
const EMPTY_BILL = { party_id: '', party_name: '', invoice_no: '', invoice_date: today(), due_date: '', amount: '', description: '' }
const EMPTY_PAYMENT = { bill_id: '', party_id: '', party_name: '', amount: '', mode: 'cash', date: today(), note: '' }

export default function Vendors() {
  const [tab, setTab] = useState('vendors')
  const [vendors, setVendors] = useState([])
  const [bills, setBills] = useState([])
  const [billPayments, setBillPayments] = useState([])
  const [search, setSearch] = useState('')
  const [selectedVendor, setSelectedVendor] = useState(null)
  const [vendorModal, setVendorModal] = useState(false)
  const [billModal, setBillModal] = useState(false)
  const [payModal, setPayModal] = useState(false)
  const [vendorForm, setVendorForm] = useState(EMPTY_VENDOR)
  const [billForm, setBillForm] = useState(EMPTY_BILL)
  const [payForm, setPayForm] = useState(EMPTY_PAYMENT)
  const [selectedBill, setSelectedBill] = useState(null)
  const [saving, setSaving] = useState(false)

  const load = async () => {
    const [partySnap, billSnap, paySnap] = await Promise.all([
      getDocuments('parties'),
      getDocuments('vendor_bills'),
      getDocuments('bill_payments')
    ])
    setVendors(partySnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(p => p.type === 'vendor' || p.type === 'both'))
    setBills(billSnap.docs.map(d => ({ id: d.id, ...d.data() })))
    setBillPayments(paySnap.docs.map(d => ({ id: d.id, ...d.data() })))
  }

  useEffect(() => { load() }, [])

  const getBillPaid = (billId) => billPayments.filter(p => p.bill_id === billId).reduce((s, p) => s + (+p.amount || 0), 0)
  const getBillBalance = (bill) => (+bill.amount || 0) - getBillPaid(bill.id)
  const getBillStatus = (bill) => {
    const bal = getBillBalance(bill)
    if (bal <= 0) return 'paid'
    if (getBillPaid(bill.id) > 0) return 'partial'
    return 'unpaid'
  }

  const getVendorStats = (vendorId) => {
    const vBills = bills.filter(b => b.party_id === vendorId)
    const totalBilled = vBills.reduce((s, b) => s + (+b.amount || 0), 0)
    const totalPaid = vBills.reduce((s, b) => s + getBillPaid(b.id), 0)
    const outstanding = totalBilled - totalPaid
    const overdue = vBills.filter(b => getBillBalance(b) > 0 && b.due_date && new Date(b.due_date) < new Date()).reduce((s, b) => s + getBillBalance(b), 0)
    return { totalBilled, totalPaid, outstanding, overdue }
  }

  const saveVendor = async () => {
    if (!vendorForm.name.trim()) return alert('Vendor name required')
    setSaving(true)
    const data = { ...vendorForm, type: 'vendor' }
    if (vendorForm.id) {
      const { id, ...rest } = data
      await updateDocument('parties', id, rest)
    } else {
      await addDocument('parties', data)
    }
    setSaving(false)
    setVendorModal(false)
    load()
  }

  const delVendor = async (id) => {
    if (!confirm('Delete this vendor?')) return
    await deleteDocument('parties', id)
    load()
  }

  const saveBill = async () => {
    if (!billForm.party_id) return alert('Vendor select karo')
    if (!billForm.amount || +billForm.amount <= 0) return alert('Amount daalo')
    if (!billForm.invoice_no) return alert('Invoice number daalo')
    setSaving(true)
    await addDocument('vendor_bills', { ...billForm, amount: +billForm.amount })
    setSaving(false)
    setBillModal(false)
    setBillForm(EMPTY_BILL)
    load()
  }

  const savePayment = async () => {
    if (!payForm.amount || +payForm.amount <= 0) return alert('Amount daalo')
    const bill = bills.find(b => b.id === payForm.bill_id)
    if (!bill) return
    const remaining = getBillBalance(bill)
    if (+payForm.amount > remaining) return alert(`Maximum: ${fmt(remaining)}`)
    setSaving(true)
    await addDocument('bill_payments', { ...payForm, amount: +payForm.amount })
    setSaving(false)
    setPayModal(false)
    setPayForm(EMPTY_PAYMENT)
    load()
  }

  const openPayment = (bill) => {
    setSelectedBill(bill)
    setPayForm({ ...EMPTY_PAYMENT, bill_id: bill.id, party_id: bill.party_id, party_name: bill.party_name, amount: getBillBalance(bill).toString() })
    setPayModal(true)
  }

  const filteredVendors = vendors.filter(v => v.name.toLowerCase().includes(search.toLowerCase()))
  const vendorBills = selectedVendor ? bills.filter(b => b.party_id === selectedVendor.id) : []

  return (
    <div>
      <div className="page-header">
        <div><h1 className="page-title">Vendors</h1><p className="page-sub">Manage vendors, bills and payments</p></div>
        <div className="flex gap-2">
          {tab === 'vendors' && !selectedVendor && <button className="btn btn-primary" onClick={() => { setVendorForm(EMPTY_VENDOR); setVendorModal(true) }}>+ Add Vendor</button>}
          {selectedVendor && <button className="btn btn-primary" onClick={() => { setBillForm({ ...EMPTY_BILL, party_id: selectedVendor.id, party_name: selectedVendor.name }); setBillModal(true) }}>+ Add Bill</button>}
        </div>
      </div>

      <div className="flex gap-2 mb-4">
        <button className={`btn btn-sm ${tab === 'vendors' ? 'btn-primary' : ''}`} onClick={() => { setTab('vendors'); setSelectedVendor(null) }}>Vendors</button>
        <button className={`btn btn-sm ${tab === 'bills' ? 'btn-primary' : ''}`} onClick={() => { setTab('bills'); setSelectedVendor(null) }}>All Bills</button>
      </div>

      {/* VENDORS LIST */}
      {tab === 'vendors' && !selectedVendor && (
        <div>
          <div className="search-bar">
            <input className="search-input" placeholder="Search vendor..." value={search} onChange={e => setSearch(e.target.value)} />
            <span className="text-muted">{filteredVendors.length} vendors</span>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Vendor</th><th>Phone</th><th>Total Billed</th><th>Total Paid</th><th>Outstanding</th><th>Overdue</th><th>Actions</th></tr></thead>
              <tbody>
                {filteredVendors.length === 0 ? (
                  <tr><td colSpan={7}><div className="empty-state"><div className="empty-icon">🏭</div><div>No vendors yet</div></div></td></tr>
                ) : filteredVendors.map(v => {
                  const stats = getVendorStats(v.id)
                  return (
                    <tr key={v.id} style={{ cursor: 'pointer' }} onClick={() => setSelectedVendor(v)}>
                      <td className="fw-bold" style={{ color: 'var(--primary)' }}>{v.name}</td>
                      <td>{v.phone || '—'}</td>
                      <td>{fmt(stats.totalBilled)}</td>
                      <td className="text-green">{fmt(stats.totalPaid)}</td>
                      <td className={`fw-bold ${stats.outstanding > 0 ? 'text-red' : 'text-green'}`}>{fmt(stats.outstanding)}</td>
                      <td>{stats.overdue > 0 ? <span className="badge badge-red">{fmt(stats.overdue)}</span> : '—'}</td>
                      <td onClick={e => e.stopPropagation()}>
                        <div className="flex gap-2">
                          <button className="btn btn-sm" onClick={() => { setVendorForm({ ...v }); setVendorModal(true) }}>Edit</button>
                          <button className="btn btn-sm btn-danger" onClick={() => delVendor(v.id)}>Delete</button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* VENDOR DETAIL */}
      {tab === 'vendors' && selectedVendor && (
        <div>
          <button className="btn btn-sm mb-4" onClick={() => setSelectedVendor(null)}>← Back to vendors</button>
          <div className="page-header" style={{ marginBottom: 16 }}>
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 600 }}>{selectedVendor.name}</h2>
              <p style={{ fontSize: 12, color: 'var(--text2)' }}>{selectedVendor.phone} {selectedVendor.gstin && `• ${selectedVendor.gstin}`}</p>
            </div>
          </div>

          {(() => {
            const stats = getVendorStats(selectedVendor.id)
            return (
              <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(4,1fr)', marginBottom: 20 }}>
                <div className="stat-card"><div className="stat-label">Total Billed</div><div className="stat-value" style={{ fontSize: 18 }}>{fmt(stats.totalBilled)}</div></div>
                <div className="stat-card"><div className="stat-label">Total Paid</div><div className="stat-value" style={{ fontSize: 18, color: 'var(--success)' }}>{fmt(stats.totalPaid)}</div></div>
                <div className="stat-card"><div className="stat-label">Outstanding</div><div className="stat-value" style={{ fontSize: 18, color: stats.outstanding > 0 ? 'var(--danger)' : 'var(--success)' }}>{fmt(stats.outstanding)}</div></div>
                <div className="stat-card"><div className="stat-label">Overdue</div><div className="stat-value" style={{ fontSize: 18, color: stats.overdue > 0 ? 'var(--danger)' : 'inherit' }}>{fmt(stats.overdue)}</div></div>
              </div>
            )
          })()}

          <div className="grid-2 mb-4">
            <div className="card">
              <div className="section-title">Contact Info</div>
              <table style={{ width: '100%' }}>
                <tbody>
                  <tr><td style={{ color: 'var(--text2)', fontSize: 12, width: 120 }}>Phone</td><td>{selectedVendor.phone || '—'}</td></tr>
                  <tr><td style={{ color: 'var(--text2)', fontSize: 12 }}>Email</td><td>{selectedVendor.email || '—'}</td></tr>
                  <tr><td style={{ color: 'var(--text2)', fontSize: 12 }}>GSTIN</td><td>{selectedVendor.gstin || '—'}</td></tr>
                  <tr><td style={{ color: 'var(--text2)', fontSize: 12 }}>Address</td><td>{selectedVendor.address || '—'}</td></tr>
                </tbody>
              </table>
            </div>
            <div className="card">
              <div className="section-title">Banking Details</div>
              <table style={{ width: '100%' }}>
                <tbody>
                  <tr><td style={{ color: 'var(--text2)', fontSize: 12, width: 120 }}>Bank</td><td>{selectedVendor.bank_name || '—'}</td></tr>
                  <tr><td style={{ color: 'var(--text2)', fontSize: 12 }}>Account No</td><td>{selectedVendor.account_no || '—'}</td></tr>
                  <tr><td style={{ color: 'var(--text2)', fontSize: 12 }}>IFSC</td><td>{selectedVendor.ifsc || '—'}</td></tr>
                  <tr><td style={{ color: 'var(--text2)', fontSize: 12 }}>UPI ID</td><td>{selectedVendor.upi_id || '—'}</td></tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="section-title">Bills & Invoices</div>
          <div className="table-wrap mb-4">
            <table>
              <thead><tr><th>Invoice No</th><th>Description</th><th>Invoice Date</th><th>Due Date</th><th>Amount</th><th>Paid</th><th>Balance</th><th>Status</th><th>Action</th></tr></thead>
              <tbody>
                {vendorBills.length === 0 ? (
                  <tr><td colSpan={9}><div className="empty-state" style={{ padding: 20 }}>No bills yet</div></td></tr>
                ) : vendorBills.map(bill => {
                  const paid = getBillPaid(bill.id)
                  const balance = getBillBalance(bill)
                  const status = getBillStatus(bill)
                  const isOverdue = balance > 0 && bill.due_date && new Date(bill.due_date) < new Date()
                  return (
                    <tr key={bill.id} style={{ background: isOverdue ? '#fff5f5' : 'inherit' }}>
                      <td className="fw-bold">{bill.invoice_no}</td>
                      <td className="text-muted">{bill.description || '—'}</td>
                      <td>{bill.invoice_date}</td>
                      <td style={{ color: isOverdue ? 'var(--danger)' : 'inherit', fontWeight: isOverdue ? 600 : 400 }}>{bill.due_date || '—'} {isOverdue && '⚠️'}</td>
                      <td className="fw-bold">{fmt(bill.amount)}</td>
                      <td className="text-green">{fmt(paid)}</td>
                      <td className={`fw-bold ${balance > 0 ? 'text-red' : 'text-green'}`}>{fmt(balance)}</td>
                      <td><span className={`badge ${status === 'paid' ? 'badge-green' : status === 'partial' ? 'badge-yellow' : 'badge-red'}`}>{status}</span></td>
                      <td>{balance > 0 && <button className="btn btn-sm btn-primary" onClick={() => openPayment(bill)}>Pay</button>}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="section-title">Payment History</div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Date</th><th>Against Bill</th><th>Mode</th><th>Amount</th><th>Note</th></tr></thead>
              <tbody>
                {billPayments.filter(p => p.party_id === selectedVendor.id).length === 0 ? (
                  <tr><td colSpan={5}><div className="empty-state" style={{ padding: 20 }}>No payments yet</div></td></tr>
                ) : billPayments.filter(p => p.party_id === selectedVendor.id).map(p => (
                  <tr key={p.id}>
                    <td>{p.date}</td>
                    <td className="text-muted">{bills.find(b => b.id === p.bill_id)?.invoice_no || '—'}</td>
                    <td><span className="badge badge-gray">{p.mode}</span></td>
                    <td className="text-green fw-bold">{fmt(p.amount)}</td>
                    <td className="text-muted">{p.note || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ALL BILLS TAB */}
      {tab === 'bills' && (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Vendor</th><th>Invoice No</th><th>Date</th><th>Due Date</th><th>Amount</th><th>Balance</th><th>Status</th><th>Action</th></tr></thead>
            <tbody>
              {bills.length === 0 ? (
                <tr><td colSpan={8}><div className="empty-state"><div className="empty-icon">📋</div><div>No bills yet</div></div></td></tr>
              ) : bills.map(bill => {
                const balance = getBillBalance(bill)
                const status = getBillStatus(bill)
                const isOverdue = balance > 0 && bill.due_date && new Date(bill.due_date) < new Date()
                return (
                  <tr key={bill.id} style={{ background: isOverdue ? '#fff5f5' : 'inherit' }}>
                    <td className="fw-bold">{bill.party_name}</td>
                    <td>{bill.invoice_no}</td>
                    <td>{bill.invoice_date}</td>
                    <td style={{ color: isOverdue ? 'var(--danger)' : 'inherit' }}>{bill.due_date || '—'} {isOverdue && '⚠️'}</td>
                    <td className="fw-bold">{fmt(bill.amount)}</td>
                    <td className={`fw-bold ${balance > 0 ? 'text-red' : 'text-green'}`}>{fmt(balance)}</td>
                    <td><span className={`badge ${status === 'paid' ? 'badge-green' : status === 'partial' ? 'badge-yellow' : 'badge-red'}`}>{status}</span></td>
                    <td>{balance > 0 && <button className="btn btn-sm btn-primary" onClick={() => openPayment(bill)}>Pay</button>}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Add Vendor Modal */}
      {vendorModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setVendorModal(false)}>
          <div className="modal modal-lg">
            <div className="modal-header">
              <span className="modal-title">{vendorForm.id ? 'Edit Vendor' : 'Add Vendor'}</span>
              <button className="close-btn" onClick={() => setVendorModal(false)}>×</button>
            </div>
            <div style={{ marginBottom: 12, fontWeight: 600, color: 'var(--primary)', fontSize: 13 }}>Basic Info</div>
            <div className="form-group">
              <label>Vendor Name *</label>
              <input value={vendorForm.name} onChange={e => setVendorForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. ABC Suppliers" autoFocus />
            </div>
            <div className="form-row">
              <div className="form-group"><label>Phone</label><input value={vendorForm.phone} onChange={e => setVendorForm(f => ({ ...f, phone: e.target.value }))} placeholder="9876543210" /></div>
              <div className="form-group"><label>Email</label><input value={vendorForm.email} onChange={e => setVendorForm(f => ({ ...f, email: e.target.value }))} placeholder="email@example.com" /></div>
            </div>
            <div className="form-group"><label>GSTIN</label><input value={vendorForm.gstin} onChange={e => setVendorForm(f => ({ ...f, gstin: e.target.value }))} placeholder="22AAAAA0000A1Z5" /></div>
            <div className="form-group"><label>Address</label><textarea value={vendorForm.address} onChange={e => setVendorForm(f => ({ ...f, address: e.target.value }))} style={{ minHeight: 60 }} /></div>
            <div style={{ margin: '16px 0 12px', fontWeight: 600, color: 'var(--primary)', fontSize: 13, borderTop: '1px solid var(--border)', paddingTop: 16 }}>Banking Details</div>
            <div className="form-row">
              <div className="form-group"><label>Bank Name</label><input value={vendorForm.bank_name} onChange={e => setVendorForm(f => ({ ...f, bank_name: e.target.value }))} placeholder="e.g. SBI, HDFC" /></div>
              <div className="form-group"><label>Account Number</label><input value={vendorForm.account_no} onChange={e => setVendorForm(f => ({ ...f, account_no: e.target.value }))} /></div>
            </div>
            <div className="form-row">
              <div className="form-group"><label>IFSC Code</label><input value={vendorForm.ifsc} onChange={e => setVendorForm(f => ({ ...f, ifsc: e.target.value }))} placeholder="SBIN0001234" /></div>
              <div className="form-group"><label>UPI ID</label><input value={vendorForm.upi_id} onChange={e => setVendorForm(f => ({ ...f, upi_id: e.target.value }))} placeholder="name@upi" /></div>
            </div>
            <div className="modal-footer">
              <button className="btn" onClick={() => setVendorModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={saveVendor} disabled={saving}>{saving ? 'Saving...' : 'Save Vendor'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Add Bill Modal */}
      {billModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setBillModal(false)}>
          <div className="modal">
            <div className="modal-header">
              <span className="modal-title">Add Bill</span>
              <button className="close-btn" onClick={() => setBillModal(false)}>×</button>
            </div>
            <div className="form-group">
              <label>Vendor *</label>
              <select value={billForm.party_id} onChange={e => {
                const v = vendors.find(v => v.id === e.target.value)
                setBillForm(f => ({ ...f, party_id: e.target.value, party_name: v?.name || '' }))
              }}>
                <option value="">-- Select Vendor --</option>
                {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </div>
            <div className="form-row">
              <div className="form-group"><label>Invoice No *</label><input value={billForm.invoice_no} onChange={e => setBillForm(f => ({ ...f, invoice_no: e.target.value }))} placeholder="e.g. VND-001" /></div>
              <div className="form-group"><label>Amount (₹) *</label><input type="number" value={billForm.amount} onChange={e => setBillForm(f => ({ ...f, amount: e.target.value }))} /></div>
            </div>
            <div className="form-row">
              <div className="form-group"><label>Invoice Date</label><input type="date" value={billForm.invoice_date} onChange={e => setBillForm(f => ({ ...f, invoice_date: e.target.value }))} /></div>
              <div className="form-group"><label>Due Date</label><input type="date" value={billForm.due_date} onChange={e => setBillForm(f => ({ ...f, due_date: e.target.value }))} /></div>
            </div>
            <div className="form-group"><label>Description</label><input value={billForm.description} onChange={e => setBillForm(f => ({ ...f, description: e.target.value }))} placeholder="e.g. Fabric purchase..." /></div>
            <div className="modal-footer">
              <button className="btn" onClick={() => setBillModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={saveBill} disabled={saving}>{saving ? 'Saving...' : 'Save Bill'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Payment Modal */}
      {payModal && selectedBill && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setPayModal(false)}>
          <div className="modal">
            <div className="modal-header">
              <span className="modal-title">Pay Against Bill</span>
              <button className="close-btn" onClick={() => setPayModal(false)}>×</button>
            </div>
            <div className="alert alert-warning" style={{ marginBottom: 16 }}>
              <strong>{selectedBill.invoice_no}</strong> — {selectedBill.party_name}<br />
              Total: {fmt(selectedBill.amount)} | Balance: <strong>{fmt(getBillBalance(selectedBill))}</strong>
            </div>
            <div className="form-row">
              <div className="form-group"><label>Amount (₹) *</label><input type="number" value={payForm.amount} onChange={e => setPayForm(f => ({ ...f, amount: e.target.value }))} /></div>
              <div className="form-group"><label>Date</label><input type="date" value={payForm.date} onChange={e => setPayForm(f => ({ ...f, date: e.target.value }))} /></div>
            </div>
            <div className="flex gap-2 mb-4">
              {['cash', 'bank transfer', 'upi', 'cheque'].map(m => (
                <button key={m} className={`btn btn-sm ${payForm.mode === m ? 'btn-primary' : ''}`} onClick={() => setPayForm(f => ({ ...f, mode: m }))}>
                  {m === 'cash' ? '💵' : m === 'bank transfer' ? '🏦' : m === 'upi' ? '📱' : '📝'} {m}
                </button>
              ))}
            </div>
            <div className="flex gap-2 mb-4">
              <button className="btn btn-sm" onClick={() => setPayForm(f => ({ ...f, amount: getBillBalance(selectedBill).toString() }))}>Full Amount ({fmt(getBillBalance(selectedBill))})</button>
              <button className="btn btn-sm" onClick={() => setPayForm(f => ({ ...f, amount: (getBillBalance(selectedBill) / 2).toFixed(0) }))}>Half Amount</button>
            </div>
            <div className="form-group"><label>Note</label><input value={payForm.note} onChange={e => setPayForm(f => ({ ...f, note: e.target.value }))} placeholder="Optional..." /></div>
            <div className="modal-footer">
              <button className="btn" onClick={() => setPayModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={savePayment} disabled={saving}>{saving ? 'Saving...' : 'Save Payment'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
