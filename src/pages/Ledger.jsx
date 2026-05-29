import { useEffect, useState } from 'react'
import { addDocument, getDocuments, updateDocument, deleteDocument } from '../firebase'

const fmt = n => '₹' + Number(n || 0).toLocaleString('en-IN')
const today = () => new Date().toISOString().split('T')[0]

const EMPTY_BILL = {
  party_id: '', party_name: '', invoice_no: '', invoice_date: today(),
  due_date: '', amount: '', description: '', type: 'purchase'
}

const EMPTY_PAYMENT = {
  bill_id: '', party_id: '', party_name: '', amount: '',
  mode: 'cash', date: today(), note: ''
}

export default function Ledger() {
  const [tab, setTab] = useState('ledger')
  const [parties, setParties] = useState([])
  const [bills, setBills] = useState([])
  const [billPayments, setBillPayments] = useState([])
  const [accounts, setAccounts] = useState([])
  const [journal, setJournal] = useState([])
  const [selectedParty, setSelectedParty] = useState(null)
  const [billModal, setBillModal] = useState(false)
  const [payModal, setPayModal] = useState(false)
  const [billForm, setBillForm] = useState(EMPTY_BILL)
  const [payForm, setPayForm] = useState(EMPTY_PAYMENT)
  const [selectedBill, setSelectedBill] = useState(null)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')

  const load = async () => {
    const [partySnap, billSnap, paySnap, accSnap, jSnap] = await Promise.all([
      getDocuments('parties'),
      getDocuments('vendor_bills'),
      getDocuments('bill_payments'),
      getDocuments('accounts'),
      getDocuments('journal_entries')
    ])
    setParties(partySnap.docs.map(d => ({ id: d.id, ...d.data() })))
    setBills(billSnap.docs.map(d => ({ id: d.id, ...d.data() })))
    setBillPayments(paySnap.docs.map(d => ({ id: d.id, ...d.data() })))
    setAccounts(accSnap.docs.map(d => ({ id: d.id, ...d.data() })))
    setJournal(jSnap.docs.map(d => ({ id: d.id, ...d.data() })))
  }

  useEffect(() => { load() }, [])

  // Calculate paid amount for each bill
  const getBillPaid = (billId) => billPayments.filter(p => p.bill_id === billId).reduce((s, p) => s + (+p.amount || 0), 0)
  const getBillBalance = (bill) => (+bill.amount || 0) - getBillPaid(bill.id)
  const getBillStatus = (bill) => {
    const bal = getBillBalance(bill)
    if (bal <= 0) return 'paid'
    if (getBillPaid(bill.id) > 0) return 'partial'
    return 'unpaid'
  }

  // Party ledger stats
  const getPartyStats = (partyId) => {
    const partyBills = bills.filter(b => b.party_id === partyId)
    const totalBilled = partyBills.reduce((s, b) => s + (+b.amount || 0), 0)
    const totalPaid = partyBills.reduce((s, b) => s + getBillPaid(b.id), 0)
    const outstanding = totalBilled - totalPaid
    const overdue = partyBills.filter(b => {
      const bal = getBillBalance(b)
      return bal > 0 && b.due_date && new Date(b.due_date) < new Date()
    }).reduce((s, b) => s + getBillBalance(b), 0)
    return { totalBilled, totalPaid, outstanding, overdue }
  }

  // Save vendor bill
  const saveBill = async () => {
    if (!billForm.party_id) return alert('Party select karo')
    if (!billForm.amount || +billForm.amount <= 0) return alert('Amount daalo')
    if (!billForm.invoice_no) return alert('Invoice number daalo')
    setSaving(true)
    await addDocument('vendor_bills', { ...billForm, amount: +billForm.amount, paid: 0 })
    setSaving(false)
    setBillModal(false)
    setBillForm(EMPTY_BILL)
    load()
  }

  // Save payment against bill
  const savePayment = async () => {
    if (!payForm.amount || +payForm.amount <= 0) return alert('Amount daalo')
    const bill = bills.find(b => b.id === payForm.bill_id)
    if (!bill) return
    const remaining = getBillBalance(bill)
    if (+payForm.amount > remaining) return alert(`Maximum pay kar sakte ho: ${fmt(remaining)}`)
    setSaving(true)
    await addDocument('bill_payments', { ...payForm, amount: +payForm.amount })
    setSaving(false)
    setPayModal(false)
    setPayForm(EMPTY_PAYMENT)
    load()
  }

  // Open payment modal for a bill
  const openPayment = (bill) => {
    setSelectedBill(bill)
    setPayForm({
      ...EMPTY_PAYMENT,
      bill_id: bill.id,
      party_id: bill.party_id,
      party_name: bill.party_name,
      amount: getBillBalance(bill).toString()
    })
    setPayModal(true)
  }

  const filteredParties = parties.filter(p => p.name.toLowerCase().includes(search.toLowerCase()))

  const partyBills = selectedParty ? bills.filter(b => b.party_id === selectedParty.id) : []

  const TYPES = ['asset', 'liability', 'income', 'expense']

  // Journal helpers
  const [jModal, setJModal] = useState(false)
  const [jForm, setJForm] = useState({ date: today(), narration: '', lines: [
    { account_id: '', account_name: '', debit: 0, credit: 0 },
    { account_id: '', account_name: '', debit: 0, credit: 0 }
  ]})
  const [accModal, setAccModal] = useState(false)
  const [accForm, setAccForm] = useState({ name: '', type: 'asset', group_name: '', opening_balance: 0 })

  const jTotals = jForm.lines.reduce((a, l) => ({ dr: a.dr + (+l.debit || 0), cr: a.cr + (+l.credit || 0) }), { dr: 0, cr: 0 })
  const jBalanced = Math.abs(jTotals.dr - jTotals.cr) < 0.01

  const setJLine = (i, k, v) => {
    setJForm(f => {
      const lines = [...f.lines]
      lines[i] = { ...lines[i], [k]: v }
      if (k === 'account_id') {
        const acc = accounts.find(a => a.id === v)
        if (acc) lines[i].account_name = acc.name
      }
      return { ...f, lines }
    })
  }

  const saveJournal = async () => {
    if (!jBalanced) return alert('Entry balanced nahi hai!')
    if (jTotals.dr === 0) return alert('Amount daalo')
    setSaving(true)
    await addDocument('journal_entries', jForm)
    setSaving(false)
    setJModal(false)
    load()
  }

  const saveAcc = async () => {
    if (!accForm.name.trim()) return alert('Account name required')
    setSaving(true)
    await addDocument('accounts', accForm)
    setSaving(false)
    setAccModal(false)
    load()
  }

  return (
    <div>
      <div className="page-header">
        <div><h1 className="page-title">Ledger</h1><p className="page-sub">Party ledger, bills, payments & accounts</p></div>
        <div className="flex gap-2">
          {tab === 'ledger' && <button className="btn btn-primary" onClick={() => { setBillForm(EMPTY_BILL); setBillModal(true) }}>+ Add Bill</button>}
          {tab === 'accounts' && <button className="btn" onClick={() => { setAccForm({ name: '', type: 'asset', group_name: '', opening_balance: 0 }); setAccModal(true) }}>+ Account</button>}
          {tab === 'journal' && <button className="btn btn-primary" onClick={() => setJModal(true)}>+ Journal Entry</button>}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-4">
        {['ledger', 'accounts', 'journal'].map(t => (
          <button key={t} className={`btn btn-sm ${tab === t ? 'btn-primary' : ''}`} onClick={() => { setTab(t); setSelectedParty(null) }} style={{ textTransform: 'capitalize' }}>{t === 'ledger' ? 'Party Ledger' : t === 'accounts' ? 'Chart of Accounts' : 'Journal Entries'}</button>
        ))}
      </div>

      {/* PARTY LEDGER TAB */}
      {tab === 'ledger' && !selectedParty && (
        <div>
          <div className="search-bar">
            <input className="search-input" placeholder="Search party..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Party</th><th>Type</th><th>Total Billed</th><th>Total Paid</th><th>Outstanding</th><th>Overdue</th><th></th></tr></thead>
              <tbody>
                {filteredParties.length === 0 ? (
                  <tr><td colSpan={7}><div className="empty-state"><div className="empty-icon">📒</div><div>No parties yet</div></div></td></tr>
                ) : filteredParties.map(p => {
                  const stats = getPartyStats(p.id)
                  return (
                    <tr key={p.id} style={{ cursor: 'pointer' }} onClick={() => setSelectedParty(p)}>
                      <td className="fw-bold" style={{ color: 'var(--primary)' }}>{p.name}</td>
                      <td><span className={`badge ${p.type === 'customer' ? 'badge-green' : p.type === 'vendor' ? 'badge-blue' : 'badge-gray'}`}>{p.type}</span></td>
                      <td>{fmt(stats.totalBilled)}</td>
                      <td className="text-green">{fmt(stats.totalPaid)}</td>
                      <td className={`fw-bold ${stats.outstanding > 0 ? 'text-red' : 'text-green'}`}>{fmt(stats.outstanding)}</td>
                      <td>{stats.overdue > 0 ? <span className="badge badge-red">{fmt(stats.overdue)}</span> : <span className="text-muted">—</span>}</td>
                      <td><button className="btn btn-sm" onClick={e => { e.stopPropagation(); setSelectedParty(p) }}>View →</button></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* PARTY DETAIL LEDGER */}
      {tab === 'ledger' && selectedParty && (
        <div>
          <button className="btn btn-sm mb-4" onClick={() => setSelectedParty(null)}>← Back to all parties</button>

          <div className="page-header" style={{ marginBottom: 16 }}>
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 600 }}>{selectedParty.name}</h2>
              <p style={{ fontSize: 12, color: 'var(--text2)' }}>{selectedParty.phone} {selectedParty.phone && selectedParty.gstin ? '•' : ''} {selectedParty.gstin}</p>
            </div>
            <button className="btn btn-primary" onClick={() => { setBillForm({ ...EMPTY_BILL, party_id: selectedParty.id, party_name: selectedParty.name }); setBillModal(true) }}>+ Add Bill</button>
          </div>

          {/* Stats */}
          {(() => {
            const stats = getPartyStats(selectedParty.id)
            return (
              <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(4,1fr)', marginBottom: 20 }}>
                <div className="stat-card"><div className="stat-label">Total Billed</div><div className="stat-value" style={{ fontSize: 18 }}>{fmt(stats.totalBilled)}</div></div>
                <div className="stat-card"><div className="stat-label">Total Paid</div><div className="stat-value" style={{ fontSize: 18, color: 'var(--success)' }}>{fmt(stats.totalPaid)}</div></div>
                <div className="stat-card"><div className="stat-label">Outstanding</div><div className="stat-value" style={{ fontSize: 18, color: stats.outstanding > 0 ? 'var(--danger)' : 'var(--success)' }}>{fmt(stats.outstanding)}</div></div>
                <div className="stat-card"><div className="stat-label">Overdue</div><div className="stat-value" style={{ fontSize: 18, color: stats.overdue > 0 ? 'var(--danger)' : 'inherit' }}>{fmt(stats.overdue)}</div></div>
              </div>
            )
          })()}

          {/* Bills */}
          <div className="section-title">Bills & Invoices</div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Invoice No</th><th>Description</th><th>Invoice Date</th><th>Due Date</th><th>Amount</th><th>Paid</th><th>Balance</th><th>Status</th><th>Action</th></tr></thead>
              <tbody>
                {partyBills.length === 0 ? (
                  <tr><td colSpan={9}><div className="empty-state" style={{ padding: 20 }}>No bills yet — Add first bill</div></td></tr>
                ) : partyBills.map(bill => {
                  const paid = getBillPaid(bill.id)
                  const balance = getBillBalance(bill)
                  const status = getBillStatus(bill)
                  const isOverdue = balance > 0 && bill.due_date && new Date(bill.due_date) < new Date()
                  return (
                    <tr key={bill.id} style={{ background: isOverdue ? '#fff5f5' : 'inherit' }}>
                      <td className="fw-bold">{bill.invoice_no}</td>
                      <td className="text-muted">{bill.description || '—'}</td>
                      <td>{bill.invoice_date}</td>
                      <td style={{ color: isOverdue ? 'var(--danger)' : 'inherit', fontWeight: isOverdue ? 600 : 400 }}>
                        {bill.due_date || '—'} {isOverdue && '⚠️'}
                      </td>
                      <td className="fw-bold">{fmt(bill.amount)}</td>
                      <td className="text-green">{fmt(paid)}</td>
                      <td className={`fw-bold ${balance > 0 ? 'text-red' : 'text-green'}`}>{fmt(balance)}</td>
                      <td><span className={`badge ${status === 'paid' ? 'badge-green' : status === 'partial' ? 'badge-yellow' : 'badge-red'}`}>{status}</span></td>
                      <td>
                        {balance > 0 && (
                          <button className="btn btn-sm btn-primary" onClick={() => openPayment(bill)}>Pay</button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Payment History */}
          <div className="section-title" style={{ marginTop: 24 }}>Payment History</div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Date</th><th>Against Bill</th><th>Mode</th><th>Amount</th><th>Note</th></tr></thead>
              <tbody>
                {billPayments.filter(p => p.party_id === selectedParty.id).length === 0 ? (
                  <tr><td colSpan={5}><div className="empty-state" style={{ padding: 20 }}>No payments yet</div></td></tr>
                ) : billPayments.filter(p => p.party_id === selectedParty.id).map(p => (
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

      {/* CHART OF ACCOUNTS TAB */}
      {tab === 'accounts' && (
        <div>
          {TYPES.map(type => {
            const accs = accounts.filter(a => a.type === type)
            if (!accs.length) return null
            return (
              <div key={type} className="mb-6">
                <div className="section-title" style={{ textTransform: 'capitalize' }}>{type}s</div>
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Account Name</th><th>Group</th><th>Opening Balance</th><th>Balance</th></tr></thead>
                    <tbody>
                      {accs.map(acc => (
                        <tr key={acc.id}>
                          <td className="fw-bold">{acc.name}</td>
                          <td className="text-muted">{acc.group_name}</td>
                          <td>{fmt(acc.opening_balance)}</td>
                          <td className={acc.balance >= 0 ? 'text-green fw-bold' : 'text-red fw-bold'}>{fmt(acc.balance || acc.opening_balance || 0)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          })}
          {accounts.length === 0 && <div className="empty-state"><div className="empty-icon">📒</div><div>No accounts yet</div></div>}
        </div>
      )}

      {/* JOURNAL TAB */}
      {tab === 'journal' && (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Date</th><th>Narration</th><th>Accounts</th><th>Amount</th></tr></thead>
            <tbody>
              {journal.length === 0 ? (
                <tr><td colSpan={4}><div className="empty-state"><div className="empty-icon">📒</div><div>No journal entries yet</div></div></td></tr>
              ) : journal.map(entry => (
                <tr key={entry.id}>
                  <td>{entry.date}</td>
                  <td>{entry.narration}</td>
                  <td>{entry.lines?.map((l, i) => <div key={i} className="text-muted" style={{ fontSize: 12 }}>{l.account_name} — {l.debit > 0 ? `Dr ${fmt(l.debit)}` : `Cr ${fmt(l.credit)}`}</div>)}</td>
                  <td className="fw-bold">{fmt(entry.lines?.reduce((s, l) => s + (+l.debit || 0), 0))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add Bill Modal */}
      {billModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setBillModal(false)}>
          <div className="modal">
            <div className="modal-header">
              <span className="modal-title">Add Vendor Bill / Invoice</span>
              <button className="close-btn" onClick={() => setBillModal(false)}>×</button>
            </div>
            <div className="form-group">
              <label>Party (Vendor) *</label>
              <select value={billForm.party_id} onChange={e => {
                const p = parties.find(p => p.id === e.target.value)
                setBillForm(f => ({ ...f, party_id: e.target.value, party_name: p?.name || '' }))
              }}>
                <option value="">-- Select Party --</option>
                {parties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Invoice Number *</label>
                <input value={billForm.invoice_no} onChange={e => setBillForm(f => ({ ...f, invoice_no: e.target.value }))} placeholder="e.g. VND-001" />
              </div>
              <div className="form-group">
                <label>Amount (₹) *</label>
                <input type="number" value={billForm.amount} onChange={e => setBillForm(f => ({ ...f, amount: e.target.value }))} placeholder="0" />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Invoice Date</label>
                <input type="date" value={billForm.invoice_date} onChange={e => setBillForm(f => ({ ...f, invoice_date: e.target.value }))} />
              </div>
              <div className="form-group">
                <label>Due Date</label>
                <input type="date" value={billForm.due_date} onChange={e => setBillForm(f => ({ ...f, due_date: e.target.value }))} />
              </div>
            </div>
            <div className="form-group">
              <label>Description</label>
              <input value={billForm.description} onChange={e => setBillForm(f => ({ ...f, description: e.target.value }))} placeholder="e.g. Fabric purchase, Office supplies..." />
            </div>
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
              <strong>Bill: {selectedBill.invoice_no}</strong> — {selectedBill.party_name}<br />
              Total: {fmt(selectedBill.amount)} | Paid: {fmt(getBillPaid(selectedBill.id))} | <strong>Balance: {fmt(getBillBalance(selectedBill))}</strong>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Amount to Pay (₹) *</label>
                <input type="number" value={payForm.amount} onChange={e => setPayForm(f => ({ ...f, amount: e.target.value }))} />
              </div>
              <div className="form-group">
                <label>Date</label>
                <input type="date" value={payForm.date} onChange={e => setPayForm(f => ({ ...f, date: e.target.value }))} />
              </div>
            </div>

            <div className="flex gap-2 mb-4">
              {['cash', 'bank transfer', 'upi', 'cheque'].map(m => (
                <button key={m} className={`btn btn-sm ${payForm.mode === m ? 'btn-primary' : ''}`} onClick={() => setPayForm(f => ({ ...f, mode: m }))}>
                  {m === 'cash' ? '💵' : m === 'bank transfer' ? '🏦' : m === 'upi' ? '📱' : '📝'} {m}
                </button>
              ))}
            </div>

            <div className="form-group">
              <label>Quick Fill</label>
              <div className="flex gap-2">
                <button className="btn btn-sm" onClick={() => setPayForm(f => ({ ...f, amount: getBillBalance(selectedBill).toString() }))}>Full Amount ({fmt(getBillBalance(selectedBill))})</button>
                <button className="btn btn-sm" onClick={() => setPayForm(f => ({ ...f, amount: (getBillBalance(selectedBill) / 2).toFixed(0) }))}>Half ({fmt(getBillBalance(selectedBill) / 2)})</button>
              </div>
            </div>

            <div className="form-group">
              <label>Note</label>
              <input value={payForm.note} onChange={e => setPayForm(f => ({ ...f, note: e.target.value }))} placeholder="Optional note..." />
            </div>

            <div className="modal-footer">
              <button className="btn" onClick={() => setPayModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={savePayment} disabled={saving}>{saving ? 'Saving...' : 'Save Payment'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Add Account Modal */}
      {accModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setAccModal(false)}>
          <div className="modal">
            <div className="modal-header">
              <span className="modal-title">Add Account</span>
              <button className="close-btn" onClick={() => setAccModal(false)}>×</button>
            </div>
            <div className="form-group"><label>Account Name *</label><input value={accForm.name} onChange={e => setAccForm(f => ({ ...f, name: e.target.value }))} autoFocus /></div>
            <div className="form-row">
              <div className="form-group">
                <label>Type</label>
                <select value={accForm.type} onChange={e => setAccForm(f => ({ ...f, type: e.target.value }))}>
                  {['asset', 'liability', 'income', 'expense'].map(t => <option key={t} value={t} style={{ textTransform: 'capitalize' }}>{t}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Group</label>
                <input value={accForm.group_name} onChange={e => setAccForm(f => ({ ...f, group_name: e.target.value }))} placeholder="e.g. Current Assets" />
              </div>
            </div>
            <div className="form-group"><label>Opening Balance (₹)</label><input type="number" value={accForm.opening_balance} onChange={e => setAccForm(f => ({ ...f, opening_balance: +e.target.value }))} /></div>
            <div className="modal-footer">
              <button className="btn" onClick={() => setAccModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={saveAcc} disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Journal Modal */}
      {jModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setJModal(false)}>
          <div className="modal modal-lg">
            <div className="modal-header">
              <span className="modal-title">New Journal Entry</span>
              <button className="close-btn" onClick={() => setJModal(false)}>×</button>
            </div>
            <div className="form-row mb-4">
              <div className="form-group"><label>Date</label><input type="date" value={jForm.date} onChange={e => setJForm(f => ({ ...f, date: e.target.value }))} /></div>
              <div className="form-group"><label>Narration</label><input value={jForm.narration} onChange={e => setJForm(f => ({ ...f, narration: e.target.value }))} placeholder="Being amount paid for..." /></div>
            </div>
            <div className="table-wrap mb-4">
              <table>
                <thead><tr><th>Account</th><th>Debit (₹)</th><th>Credit (₹)</th><th></th></tr></thead>
                <tbody>
                  {jForm.lines.map((l, i) => (
                    <tr key={i}>
                      <td>
                        <select value={l.account_id} onChange={e => setJLine(i, 'account_id', e.target.value)} style={{ minWidth: 180 }}>
                          <option value="">-- Select Account --</option>
                          {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                        </select>
                      </td>
                      <td><input type="number" value={l.debit} onChange={e => setJLine(i, 'debit', +e.target.value)} style={{ width: 110 }} /></td>
                      <td><input type="number" value={l.credit} onChange={e => setJLine(i, 'credit', +e.target.value)} style={{ width: 110 }} /></td>
                      <td>{i >= 2 && <button className="btn btn-sm btn-danger" onClick={() => setJForm(f => ({ ...f, lines: f.lines.filter((_, j) => j !== i) }))}>✕</button>}</td>
                    </tr>
                  ))}
                  <tr style={{ background: 'var(--bg)' }}>
                    <td className="fw-bold">Total</td>
                    <td className="fw-bold">{fmt(jTotals.dr)}</td>
                    <td className="fw-bold">{fmt(jTotals.cr)}</td>
                    <td><span className={`badge ${jBalanced ? 'badge-green' : 'badge-red'}`}>{jBalanced ? '✓ Balanced' : '✗ Unbalanced'}</span></td>
                  </tr>
                </tbody>
              </table>
            </div>
            <button className="btn btn-sm mb-4" onClick={() => setJForm(f => ({ ...f, lines: [...f.lines, { account_id: '', account_name: '', debit: 0, credit: 0 }] }))}>+ Add Line</button>
            <div className="modal-footer">
              <button className="btn" onClick={() => setJModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={saveJournal} disabled={saving || !jBalanced}>{saving ? 'Saving...' : 'Post Entry'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
