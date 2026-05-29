import { useEffect, useState } from 'react'
import { addDocument, getDocuments, updateDocument, deleteDocument } from '../firebase'

const EMPTY = { name: '', type: 'both', phone: '', email: '', address: '', gstin: '', bank_name: '', account_no: '', ifsc: '', upi_id: '' }
const fmt = n => '₹' + Number(n || 0).toLocaleString('en-IN')

export default function Parties() {
  const [parties, setParties] = useState([])
  const [invoices, setInvoices] = useState([])
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState(false)
  const [detailModal, setDetailModal] = useState(false)
  const [selectedParty, setSelectedParty] = useState(null)
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)

  const load = async () => {
    const snap = await getDocuments('parties')
    setParties(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    const invSnap = await getDocuments('invoices')
    setInvoices(invSnap.docs.map(d => ({ id: d.id, ...d.data() })))
  }

  useEffect(() => { load() }, [])

  const filtered = parties.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.phone || '').includes(search)
  )

  const openNew = () => { setForm(EMPTY); setModal(true) }
  const openEdit = (p) => { setForm({ ...p }); setModal(true) }
  const openDetail = (p) => { setSelectedParty(p); setDetailModal(true) }

  const save = async () => {
    if (!form.name.trim()) return alert('Party name required')
    setSaving(true)
    if (form.id) {
      const { id, ...data } = form
      await updateDocument('parties', id, data)
    } else {
      await addDocument('parties', form)
    }
    setSaving(false)
    setModal(false)
    load()
  }

  const del = async (id) => {
    if (!confirm('Delete this party?')) return
    await deleteDocument('parties', id)
    load()
  }

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const partyInvoices = selectedParty ? invoices.filter(inv => inv.party_id === selectedParty.id || inv.party_name === selectedParty.name) : []
  const totalSales = partyInvoices.filter(i => i.type === 'sale').reduce((s, i) => s + (i.grand_total || 0), 0)
  const totalPurchases = partyInvoices.filter(i => i.type === 'purchase').reduce((s, i) => s + (i.grand_total || 0), 0)
  const totalPaid = partyInvoices.filter(i => i.status === 'paid').reduce((s, i) => s + (i.grand_total || 0), 0)
  const outstanding = partyInvoices.filter(i => i.status !== 'paid').reduce((s, i) => s + (i.grand_total || 0), 0)

  return (
    <div>
      <div className="page-header">
        <div><h1 className="page-title">Parties</h1><p className="page-sub">Customers, vendors and suppliers</p></div>
        <button className="btn btn-primary" onClick={openNew}>+ Add Party</button>
      </div>

      <div className="search-bar">
        <input className="search-input" placeholder="Search by name or phone..." value={search} onChange={e => setSearch(e.target.value)} />
        <span className="text-muted">{filtered.length} parties</span>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Name</th><th>Type</th><th>Phone</th><th>GSTIN</th><th>Balance</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={6}><div className="empty-state"><div className="empty-icon">👥</div><div>No parties yet.</div></div></td></tr>
            ) : filtered.map(p => (
              <tr key={p.id} style={{ cursor: 'pointer' }} onClick={() => openDetail(p)}>
                <td className="fw-bold" style={{ color: 'var(--primary)' }}>{p.name}</td>
                <td><span className={`badge ${p.type === 'customer' ? 'badge-green' : p.type === 'vendor' ? 'badge-blue' : 'badge-gray'}`}>{p.type}</span></td>
                <td>{p.phone || '—'}</td>
                <td>{p.gstin || '—'}</td>
                <td className={p.balance > 0 ? 'text-green fw-bold' : p.balance < 0 ? 'text-red fw-bold' : ''}>{fmt(p.balance || 0)}</td>
                <td onClick={e => e.stopPropagation()}>
                  <div className="flex gap-2">
                    <button className="btn btn-sm" onClick={() => openEdit(p)}>Edit</button>
                    <button className="btn btn-sm btn-danger" onClick={() => del(p.id)}>Delete</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add/Edit Modal */}
      {modal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModal(false)}>
          <div className="modal modal-lg">
            <div className="modal-header">
              <span className="modal-title">{form.id ? 'Edit Party' : 'Add Party'}</span>
              <button className="close-btn" onClick={() => setModal(false)}>×</button>
            </div>

            <div style={{ marginBottom: 12, fontWeight: 600, color: 'var(--primary)', fontSize: 13 }}>Basic Info</div>
            <div className="form-group">
              <label>Party Name *</label>
              <input value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Sharma Traders" autoFocus />
            </div>
            <div className="form-group">
              <label>Type</label>
              <select value={form.type} onChange={e => set('type', e.target.value)}>
                <option value="customer">Customer</option>
                <option value="vendor">Vendor / Supplier</option>
                <option value="both">Both</option>
              </select>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Phone</label>
                <input value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="9876543210" />
              </div>
              <div className="form-group">
                <label>Email</label>
                <input value={form.email} onChange={e => set('email', e.target.value)} placeholder="email@example.com" />
              </div>
            </div>
            <div className="form-group">
              <label>GSTIN</label>
              <input value={form.gstin} onChange={e => set('gstin', e.target.value)} placeholder="22AAAAA0000A1Z5" />
            </div>
            <div className="form-group">
              <label>Address</label>
              <textarea value={form.address} onChange={e => set('address', e.target.value)} placeholder="Full address..." style={{ minHeight: 60 }} />
            </div>

            <div style={{ margin: '16px 0 12px', fontWeight: 600, color: 'var(--primary)', fontSize: 13, borderTop: '1px solid var(--border)', paddingTop: 16 }}>Banking Details</div>
            <div className="form-row">
              <div className="form-group">
                <label>Bank Name</label>
                <input value={form.bank_name} onChange={e => set('bank_name', e.target.value)} placeholder="e.g. SBI, HDFC" />
              </div>
              <div className="form-group">
                <label>Account Number</label>
                <input value={form.account_no} onChange={e => set('account_no', e.target.value)} placeholder="Account number" />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>IFSC Code</label>
                <input value={form.ifsc} onChange={e => set('ifsc', e.target.value)} placeholder="e.g. SBIN0001234" />
              </div>
              <div className="form-group">
                <label>UPI ID</label>
                <input value={form.upi_id} onChange={e => set('upi_id', e.target.value)} placeholder="e.g. name@upi" />
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn" onClick={() => setModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving...' : 'Save Party'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {detailModal && selectedParty && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setDetailModal(false)}>
          <div className="modal modal-lg">
            <div className="modal-header">
              <div>
                <span className="modal-title">{selectedParty.name}</span>
                <span className={`badge ${selectedParty.type === 'customer' ? 'badge-green' : selectedParty.type === 'vendor' ? 'badge-blue' : 'badge-gray'}`} style={{ marginLeft: 10 }}>{selectedParty.type}</span>
              </div>
              <div className="flex gap-2">
                <button className="btn btn-sm" onClick={() => { setDetailModal(false); openEdit(selectedParty) }}>Edit</button>
                <button className="close-btn" onClick={() => setDetailModal(false)}>×</button>
              </div>
            </div>

            {/* Stats */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 20 }}>
              <div className="stat-card"><div className="stat-label">Total Sales</div><div className="stat-value" style={{ fontSize: 18 }}>{fmt(totalSales)}</div></div>
              <div className="stat-card"><div className="stat-label">Total Purchases</div><div className="stat-value" style={{ fontSize: 18 }}>{fmt(totalPurchases)}</div></div>
              <div className="stat-card"><div className="stat-label">Total Paid</div><div className="stat-value" style={{ fontSize: 18, color: 'var(--success)' }}>{fmt(totalPaid)}</div></div>
              <div className="stat-card"><div className="stat-label">Outstanding</div><div className="stat-value" style={{ fontSize: 18, color: outstanding > 0 ? 'var(--danger)' : 'inherit' }}>{fmt(outstanding)}</div></div>
            </div>

            <div className="grid-2" style={{ marginBottom: 20 }}>
              {/* Basic Info */}
              <div className="card">
                <div className="section-title">Contact Info</div>
                <table style={{ width: '100%' }}>
                  <tbody>
                    <tr><td style={{ color: 'var(--text2)', fontSize: 12, width: 120 }}>Phone</td><td>{selectedParty.phone || '—'}</td></tr>
                    <tr><td style={{ color: 'var(--text2)', fontSize: 12 }}>Email</td><td>{selectedParty.email || '—'}</td></tr>
                    <tr><td style={{ color: 'var(--text2)', fontSize: 12 }}>GSTIN</td><td>{selectedParty.gstin || '—'}</td></tr>
                    <tr><td style={{ color: 'var(--text2)', fontSize: 12 }}>Address</td><td>{selectedParty.address || '—'}</td></tr>
                  </tbody>
                </table>
              </div>

              {/* Banking */}
              <div className="card">
                <div className="section-title">Banking Details</div>
                <table style={{ width: '100%' }}>
                  <tbody>
                    <tr><td style={{ color: 'var(--text2)', fontSize: 12, width: 120 }}>Bank</td><td>{selectedParty.bank_name || '—'}</td></tr>
                    <tr><td style={{ color: 'var(--text2)', fontSize: 12 }}>Account No</td><td>{selectedParty.account_no || '—'}</td></tr>
                    <tr><td style={{ color: 'var(--text2)', fontSize: 12 }}>IFSC</td><td>{selectedParty.ifsc || '—'}</td></tr>
                    <tr><td style={{ color: 'var(--text2)', fontSize: 12 }}>UPI ID</td><td>{selectedParty.upi_id || '—'}</td></tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Transaction History */}
            <div className="section-title">Transaction History</div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Invoice No</th><th>Type</th><th>Date</th><th>Amount</th><th>Tax</th><th>Total</th><th>Status</th></tr></thead>
                <tbody>
                  {partyInvoices.length === 0 ? (
                    <tr><td colSpan={7} style={{ textAlign: 'center', padding: 20, color: 'var(--text2)' }}>No transactions yet</td></tr>
                  ) : partyInvoices.map(inv => (
                    <tr key={inv.id}>
                      <td className="fw-bold">{inv.invoice_no}</td>
                      <td><span className={`badge ${inv.type === 'sale' ? 'badge-green' : 'badge-blue'}`}>{inv.type}</span></td>
                      <td>{inv.date}</td>
                      <td>{fmt(inv.total)}</td>
                      <td>{fmt(inv.tax)}</td>
                      <td className="fw-bold">{fmt(inv.grand_total)}</td>
                      <td><span className={`badge ${inv.status === 'paid' ? 'badge-green' : 'badge-yellow'}`}>{inv.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="modal-footer">
              <button className="btn" onClick={() => setDetailModal(false)}>Close</button>
              <button className="btn btn-primary" onClick={() => { setDetailModal(false); openEdit(selectedParty) }}>Edit Party</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
