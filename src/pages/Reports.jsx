import { useEffect, useState } from 'react'

const fmt = n => '₹' + Number(n || 0).toLocaleString('en-IN')
const firstOfMonth = () => new Date().toISOString().slice(0, 7) + '-01'
const today = () => new Date().toISOString().split('T')[0]

export default function Reports() {
  const [tab, setTab] = useState('pl')
  const [from, setFrom] = useState(firstOfMonth())
  const [to, setTo] = useState(today())
  const [pl, setPl] = useState(null)
  const [tb, setTb] = useState([])

  const loadPL = () => window.api.reports.profitLoss(from, to).then(setPl)
  const loadTB = () => window.api.reports.trialBalance().then(setTb)

  useEffect(() => { loadPL(); loadTB() }, [])

  const TYPES = [
    { key: 'asset', label: 'Assets' },
    { key: 'liability', label: 'Liabilities' },
    { key: 'income', label: 'Income' },
    { key: 'expense', label: 'Expenses' },
  ]

  const totalDr = tb.filter(a => ['asset', 'expense'].includes(a.type)).reduce((s, a) => s + (a.balance || 0), 0)
  const totalCr = tb.filter(a => ['liability', 'income', 'equity'].includes(a.type)).reduce((s, a) => s + (a.balance || 0), 0)

  return (
    <div>
      <div className="page-header">
        <div><h1 className="page-title">Reports</h1><p className="page-sub">Financial statements and analysis</p></div>
      </div>

      <div className="flex gap-2 mb-4">
        <button className={`btn btn-sm ${tab === 'pl' ? 'btn-primary' : ''}`} onClick={() => setTab('pl')}>Profit & Loss</button>
        <button className={`btn btn-sm ${tab === 'tb' ? 'btn-primary' : ''}`} onClick={() => setTab('tb')}>Trial Balance</button>
      </div>

      {tab === 'pl' && (
        <div>
          <div className="card mb-6">
            <div className="flex gap-2 items-center">
              <div className="form-group" style={{ margin: 0 }}>
                <label>From</label>
                <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={{ width: 160 }} />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label>To</label>
                <input type="date" value={to} onChange={e => setTo(e.target.value)} style={{ width: 160 }} />
              </div>
              <button className="btn btn-primary" style={{ marginTop: 18 }} onClick={loadPL}>Generate</button>
            </div>
          </div>

          {pl && (
            <div className="grid-2">
              <div className="card">
                <div className="section-title text-green">Income</div>
                <table style={{ width: '100%' }}>
                  <thead><tr><th>Party</th><th className="text-right">Amount</th></tr></thead>
                  <tbody>
                    {pl.income.map((r, i) => (
                      <tr key={i}><td>{r.party_name || 'Direct Sales'}</td><td className="text-right">{fmt(r.total)}</td></tr>
                    ))}
                    {pl.income.length === 0 && <tr><td colSpan={2} className="text-muted" style={{ padding: '12px' }}>No income in this period</td></tr>}
                  </tbody>
                </table>
                <div className="divider" />
                <div className="flex justify-between fw-bold">
                  <span>Total Income</span>
                  <span className="text-green">{fmt(pl.totalIncome)}</span>
                </div>
              </div>

              <div className="card">
                <div className="section-title text-red">Expenses</div>
                <table style={{ width: '100%' }}>
                  <thead><tr><th>Party</th><th className="text-right">Amount</th></tr></thead>
                  <tbody>
                    {pl.expense.map((r, i) => (
                      <tr key={i}><td>{r.party_name || 'Direct Purchase'}</td><td className="text-right">{fmt(r.total)}</td></tr>
                    ))}
                    {pl.expense.length === 0 && <tr><td colSpan={2} className="text-muted" style={{ padding: '12px' }}>No expenses in this period</td></tr>}
                  </tbody>
                </table>
                <div className="divider" />
                <div className="flex justify-between fw-bold">
                  <span>Total Expense</span>
                  <span className="text-red">{fmt(pl.totalExpense)}</span>
                </div>
              </div>
            </div>
          )}

          {pl && (
            <div className="card" style={{ marginTop: 16, background: pl.netProfit >= 0 ? 'var(--success-light)' : 'var(--danger-light)', border: `1px solid ${pl.netProfit >= 0 ? '#a7f3d0' : '#fecaca'}` }}>
              <div className="flex justify-between items-center">
                <span style={{ fontSize: 16, fontWeight: 600 }}>Net {pl.netProfit >= 0 ? 'Profit' : 'Loss'}</span>
                <span style={{ fontSize: 24, fontWeight: 700, color: pl.netProfit >= 0 ? 'var(--success)' : 'var(--danger)' }}>{fmt(Math.abs(pl.netProfit))}</span>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'tb' && (
        <div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Account</th><th>Type</th><th>Group</th><th className="text-right">Debit (₹)</th><th className="text-right">Credit (₹)</th></tr></thead>
              <tbody>
                {TYPES.map(({ key, label }) => {
                  const accs = tb.filter(a => a.type === key)
                  if (!accs.length) return null
                  return [
                    <tr key={'head-' + key} style={{ background: 'var(--primary-light)' }}>
                      <td colSpan={5} className="fw-bold" style={{ color: 'var(--primary)' }}>{label}</td>
                    </tr>,
                    ...accs.map(acc => (
                      <tr key={acc.id}>
                        <td>{acc.name}</td>
                        <td className="text-muted">{acc.type}</td>
                        <td className="text-muted">{acc.group_name}</td>
                        <td className="text-right">{['asset', 'expense'].includes(acc.type) ? fmt(acc.balance) : '—'}</td>
                        <td className="text-right">{['liability', 'income', 'equity'].includes(acc.type) ? fmt(acc.balance) : '—'}</td>
                      </tr>
                    ))
                  ]
                })}
                <tr style={{ background: 'var(--bg)', fontWeight: 700 }}>
                  <td colSpan={3} className="fw-bold">TOTAL</td>
                  <td className="text-right fw-bold">{fmt(totalDr)}</td>
                  <td className="text-right fw-bold">{fmt(totalCr)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
