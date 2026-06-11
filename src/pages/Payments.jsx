import { useEffect, useState } from 'react'
import { useAuth } from '../AuthContext'
import { addDocument, getDocuments, updateDocument } from '../firebase'

const fmt = n => '₹' + Number(n || 0).toLocaleString('en-IN')
const today = () => new Date().toISOString().split('T')[0]
const EMPTY = { party_id: '', party_name: '', amount: '', mode: 'cash', date: today(), note: '', type: 'received' }

export default function Payments() {
  const user = useAuth()
  const uid = user?.uid
  const [payments, setPayments] = useState([])
  const [parties, setParties] = useState([])
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [filterType, setFilterType] = useState('all')

  const load = async () => {
    const [paySnap, partySnap] = await Promise.all([
      getDocuments(uid, 'payments'),
      getDocuments(uid, 'parties')
    ])
    setPayments(paySnap.docs.map(d => ({ id: d.id, ...d.data() })))
    setParties(partySnap.docs.map(d => ({ id: d.id, ...d.data() })))
  }

  useEffect(() => { load() }, [])

  const filtered = payments.filter(p => {
    const matchType = filterType === 'all' || p.type === filterType
    const matchSearch = p.party_name?.toLowerCase().includes(search.toLowerCase())
    return matchType && matchSearch
  })

  const totalReceived = payments.filter(p => p.type === 'received').reduce((s, p) => s + (+p.amount || 0), 0)
  const totalPaid = payments.filter(p => p.type === 'paid').reduce((s, p) => s + (+p.amount || 0), 0)

  const set = (k, v) => setForm(f => {
    const updated = { ...f, [k]: v }
    if (k === 'party_id') {
      const party = parties.find(p => p.id === v)
      updated.party_name = party?.name || ''
    }
    return updated
  })

  const save = async () => {
    if (!form.party_id) return alert('Party select karo')
    if (!form.amount || +form.amount <= 0) return alert('Amount daalo')
    setSaving(true)

    await addDocument(uid, 'payments', { ...form, amount: +form.amount })

    // Update party balance
    const party = parties.find(p => p.id === form.party_id)
    if (party) {
      const delta = form.type === 'received' ? -(+form.amount) : +(+form.amount)
      await updateDocument(uid, 'parties', form.party_id, { balance: (party.balance || 0) + delta })
    }

    setSaving(false)
    setModal(false)
    setForm(EMPTY)
    load()
  }

  const MODES = ['cash', 'bank transfer', 'upi', 'cheque', 'other']

  return (
    <div>
      <div className="page-header">
        <div><h1 className="page-title">Payments</h1><p className="page-sub">Track all incoming and outgoing payments</p></div>
        <button className="btn btn-primary" onClick={() => { setForm(EMPTY); setModal(true) }}>+ Add Payment</button>
      </div>

      {/* Stats */}
      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
        <div className="stat-card">
          <div className="stat-label">Total Received</div>
          <div className="stat-value" style={{ color: 'var(--success)' }}>{fmt(totalReceived)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Total Paid Out</div>
          <div className="stat-value" style={{ color: 'var(--danger)' }}>{fmt(totalPaid)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Net</div>
          <div className="stat-value" style={{ color: totalReceived - totalPaid >= 0 ? 'var(--success)' : 'var(--danger)' }}>
            {fmt(totalReceived - totalPaid)}
          </div>
        </div>
      </div>

      <div className="search-bar">
        <div className="flex gap-2">
          {['all', 'received', 'paid'].map(t => (
            <button key={t} className={`btn btn-sm ${filterType === t ? 'btn-primary' : ''}`} onClick={() => setFilterType(t)}>
              {t === 'all' ? 'All' : t === 'received' ? 'Received' : 'Paid Out'}
            </button>
          ))}
        </div>
        <input className="search-input" placeholder="Search by party..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Date</th><th>Party</th><th>Type</th><th>Mode</th><th>Amount</th><th>Note</th></tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={6}>
                <div className="empty-state"><div className="empty-icon">💰</div><div>No payments yet</div></div>
              </td></tr>
            ) : filtered.map(p => (
              <tr key={p.id}>
                <td>{p.date}</td>
                <td className="fw-bold">{p.party_name}</td>
                <td>
                  <span className={`badge ${p.type === 'received' ? 'badge-green' : 'badge-red'}`}>
                    {p.type === 'received' ? '↓ Received' : '↑ Paid Out'}
                  </span>
                </td>
                <td><span className="badge badge-gray">{p.mode}</span></td>
                <td className={`fw-bold ${p.type === 'received' ? 'text-green' : 'text-red'}`}>
                  {p.type === 'received' ? '+' : '-'}{fmt(p.amount)}
                </td>
                <td className="text-muted">{p.note || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModal(false)}>
          <div className="modal">
            <div className="modal-header">
              <span className="modal-title">Add Payment</span>
              <button className="close-btn" onClick={() => setModal(false)}>×</button>
            </div>

            <div className="form-group">
              <label>Payment Type</label>
              <div className="flex gap-2">
                <button
                  className={`btn ${form.type === 'received' ? 'btn-primary' : ''}`}
                  style={{ flex: 1 }}
                  onClick={() => set('type', 'received')}
                >
                  ↓ Received (Customer ne diya)
                </button>
                <button
                  className={`btn ${form.type === 'paid' ? 'btn-danger' : ''}`}
                  style={{ flex: 1 }}
                  onClick={() => set('type', 'paid')}
                >
                  ↑ Paid Out (Vendor ko diya)
                </button>
              </div>
            </div>

            <div className="form-group">
              <label>Party *</label>
              <select value={form.party_id} onChange={e => set('party_id', e.target.value)}>
                <option value="">-- Select Party --</option>
                {parties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Amount (₹) *</label>
                <input type="number" value={form.amount} onChange={e => set('amount', e.target.value)} placeholder="0" />
              </div>
              <div className="form-group">
                <label>Date</label>
                <input type="date" value={form.date} onChange={e => set('date', e.target.value)} />
              </div>
            </div>

            <div className="form-group">
              <label>Payment Mode</label>
              <select value={form.mode} onChange={e => set('mode', e.target.value)}>
                {MODES.map(m => <option key={m} value={m}>{m.charAt(0).toUpperCase() + m.slice(1)}</option>)}
              </select>
            </div>

            <div className="form-group">
              <label>Note (optional)</label>
              <input value={form.note} onChange={e => set('note', e.target.value)} placeholder="e.g. Against invoice INV-001" />
            </div>

            <div className="modal-footer">
              <button className="btn" onClick={() => setModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={save} disabled={saving}>
                {saving ? 'Saving...' : 'Save Payment'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
