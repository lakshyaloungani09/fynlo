import { useEffect, useState } from 'react'
import { useAuth } from '../AuthContext'
import { addDocument, getDocuments, updateDocument, deleteDocument } from '../firebase'

const EMPTY = { name: '', phone: '', email: '', address: '', gstin: '', type: 'customer' }
const fmt = n => '₹' + Number(n || 0).toLocaleString('en-IN')
const UNKNOWN_CUSTOMER = { id: 'unknown', name: 'Walk-in Customer', phone: '', email: '', address: '', gstin: '', type: 'customer', balance: 0 }

export default function Customers() {
  const user = useAuth()
  const uid = user?.uid
  const [customers, setCustomers] = useState([])
  const [invoices, setInvoices] = useState([])
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState(false)
  const [detailModal, setDetailModal] = useState(false)
  const [selectedCustomer, setSelectedCustomer] = useState(null)
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)

  const load = async () => {
    const [custSnap, invSnap] = await Promise.all([
      getDocuments(uid, 'parties'),
      getDocuments(uid, 'invoices')
    ])
    const all = custSnap.docs.map(d => ({ id: d.id, ...d.data() }))
    setCustomers(all.filter(p => p.type === 'customer' || p.type === 'both'))
    setInvoices(invSnap.docs.map(d => ({ id: d.id, ...d.data() })))
  }

  useEffect(() => { load() }, [])

  const filtered = [UNKNOWN_CUSTOMER, ...customers].filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.phone || '').includes(search)
  )

  const openNew = () => { setForm(EMPTY); setModal(true) }
  const openEdit = (c) => { setForm({ ...c }); setModal(true) }
  const openDetail = (c) => { setSelectedCustomer(c); setDetailModal(true) }

  const save = async () => {
    if (!form.name.trim()) return alert('Customer name required')
    setSaving(true)
    const data = { ...form, type: 'customer' }
    if (form.id) {
      const { id, ...rest } = data
      await updateDocument(uid, 'parties', id, rest)
    } else {
      await addDocument(uid, 'parties', data)
    }
    setSaving(false)
    setModal(false)
    load()
  }

  const del = async (id) => {
    if (!confirm('Delete this customer?')) return
    await deleteDocument(uid, 'parties', id)
    load()
  }

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const custInvoices = selectedCustomer ? invoices.filter(inv =>
    inv.type === 'sale' && (inv.party_id === selectedCustomer.id || inv.party_name === selectedCustomer.name)
  ) : []

  const totalSales = custInvoices.reduce((s, i) => s + (i.grand_total || 0), 0)
  const totalPaid = custInvoices.filter(i => i.status === 'paid').reduce((s, i) => s + (i.grand_total || 0), 0)
  const outstanding = custInvoices.filter(i => i.status !== 'paid').reduce((s, i) => s + (i.grand_total || 0), 0)

  return (
    <div>
      <div className="page-header">
        <div><h1 className="page-title">Customers</h1><p className="page-sub">Manage your customers and their billing history</p></div>
        <button className="btn btn-primary" onClick={openNew}>+ Add Customer</button>
      </div>

      <div className="search-bar">
        <input className="search-input" placeholder="Search by name or phone..." value={search} onChange={e => setSearch(e.target.value)} />
        <span className="text-muted">{customers.length} customers</span>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Name</th><th>Phone</th><th>GSTIN</th><th>Balance</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={5}><div className="empty-state"><div className="empty-icon">👥</div><div>No customers yet</div></div></td></tr>
            ) : filtered.map(c => (
              <tr key={c.id} style={{ cursor: 'pointer' }} onClick={() => openDetail(c)}>
                <td>
                  <div className="fw-bold" style={{ color: 'var(--primary)' }}>{c.name}</div>
                  {c.id === 'unknown' && <div style={{ fontSize: 11, color: 'var(--text3)' }}>Default — for bills without customer details</div>}
                </td>
                <td>{c.phone || '—'}</td>
                <td>{c.gstin || '—'}</td>
                <td className={c.balance > 0 ? 'text-green fw-bold' : c.balance < 0 ? 'text-red fw-bold' : ''}>{fmt(c.balance || 0)}</td>
                <td onClick={e => e.stopPropagation()}>
                  {c.id !== 'unknown' && (
                    <div className="flex gap-2">
                      <button className="btn btn-sm" onClick={() => openEdit(c)}>Edit</button>
                      <button className="btn btn-sm btn-danger" onClick={() => del(c.id)}>Delete</button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add/Edit Modal */}
      {modal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModal(false)}>
          <div className="modal">
            <div className="modal-header">
              <span className="modal-title">{form.id ? 'Edit Customer' : 'Add Customer'}</span>
              <button className="close-btn" onClick={() => setModal(false)}>×</button>
            </div>
            <div className="form-group">
              <label>Customer Name *</label>
              <input value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Sharma Ji" autoFocus />
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
            <div className="modal-footer">
              <button className="btn" onClick={() => setModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving...' : 'Save Customer'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {detailModal && selectedCustomer && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setDetailModal(false)}>
          <div className="modal modal-lg">
            <div className="modal-header">
              <div>
                <span className="modal-title">{selectedCustomer.name}</span>
                <span className="badge badge-green" style={{ marginLeft: 10 }}>customer</span>
              </div>
              <div className="flex gap-2">
                {selectedCustomer.id !== 'unknown' && <button className="btn btn-sm" onClick={() => { setDetailModal(false); openEdit(selectedCustomer) }}>Edit</button>}
                <button className="close-btn" onClick={() => setDetailModal(false)}>×</button>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 20 }}>
              <div className="stat-card"><div className="stat-label">Total Sales</div><div className="stat-value" style={{ fontSize: 18 }}>{fmt(totalSales)}</div></div>
              <div className="stat-card"><div className="stat-label">Total Paid</div><div className="stat-value" style={{ fontSize: 18, color: 'var(--success)' }}>{fmt(totalPaid)}</div></div>
              <div className="stat-card"><div className="stat-label">Outstanding</div><div className="stat-value" style={{ fontSize: 18, color: outstanding > 0 ? 'var(--danger)' : 'inherit' }}>{fmt(outstanding)}</div></div>
            </div>

            {selectedCustomer.id !== 'unknown' && (
              <div className="card mb-4">
                <div className="section-title">Contact Info</div>
                <table style={{ width: '100%' }}>
                  <tbody>
                    <tr><td style={{ color: 'var(--text2)', fontSize: 12, width: 120 }}>Phone</td><td>{selectedCustomer.phone || '—'}</td></tr>
                    <tr><td style={{ color: 'var(--text2)', fontSize: 12 }}>Email</td><td>{selectedCustomer.email || '—'}</td></tr>
                    <tr><td style={{ color: 'var(--text2)', fontSize: 12 }}>GSTIN</td><td>{selectedCustomer.gstin || '—'}</td></tr>
                    <tr><td style={{ color: 'var(--text2)', fontSize: 12 }}>Address</td><td>{selectedCustomer.address || '—'}</td></tr>
                  </tbody>
                </table>
              </div>
            )}

            <div className="section-title">Invoice History</div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Invoice No</th><th>Date</th><th>Amount</th><th>Tax</th><th>Total</th><th>Status</th></tr></thead>
                <tbody>
                  {custInvoices.length === 0 ? (
                    <tr><td colSpan={6} style={{ textAlign: 'center', padding: 20, color: 'var(--text2)' }}>No invoices yet</td></tr>
                  ) : custInvoices.map(inv => (
                    <tr key={inv.id}>
                      <td className="fw-bold">{inv.invoice_no}</td>
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
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
