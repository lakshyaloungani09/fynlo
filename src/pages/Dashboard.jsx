import { useEffect, useState } from 'react'
import { useAuth } from '../AuthContext'
import { getDocuments } from '../firebase'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

const fmt = n => '₹' + Number(n || 0).toLocaleString('en-IN')
const today = () => new Date().toISOString().split('T')[0]
const monthStart = () => new Date().toISOString().slice(0, 7) + '-01'

export default function Dashboard() {
  const user = useAuth()
  const uid = user?.uid
  const [stats, setStats] = useState({ todaySales: 0, monthSales: 0, totalParties: 0, cashBalance: 0, lowStockCount: 0 })
  const [recentInvoices, setRecentInvoices] = useState([])
  const [lowStockItems, setLowStockItems] = useState([])
  const [salesChart, setSalesChart] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      const [invSnap, partiesSnap, itemsSnap] = await Promise.all([
        getDocuments(uid, 'invoices'),
        getDocuments(uid, 'parties'),
        getDocuments(uid, 'items')
      ])

      const invoices = invSnap.docs.map(d => ({ id: d.id, ...d.data() }))
      const items = itemsSnap.docs.map(d => ({ id: d.id, ...d.data() }))

      const todaySales = invoices.filter(i => i.type === 'sale' && i.date === today()).reduce((s, i) => s + (i.grand_total || 0), 0)
      const monthSales = invoices.filter(i => i.type === 'sale' && i.date >= monthStart()).reduce((s, i) => s + (i.grand_total || 0), 0)
      const lowStock = items.filter(i => i.stock <= i.low_stock_alert)

      const chartMap = {}
      invoices.filter(i => i.type === 'sale').forEach(i => {
        chartMap[i.date] = (chartMap[i.date] || 0) + (i.grand_total || 0)
      })
      const chartData = Object.entries(chartMap).sort().slice(-30).map(([date, total]) => ({ date, total }))

      setStats({ todaySales, monthSales, totalParties: partiesSnap.docs.length, lowStockCount: lowStock.length })
      setRecentInvoices(invoices.slice(0, 5))
      setLowStockItems(lowStock)
      setSalesChart(chartData)
      setLoading(false)
    }
    load()
  }, [])

  if (loading) return <div className="empty-state">Loading...</div>

  return (
    <div>
      <div className="page-header">
        <div><h1 className="page-title">Dashboard</h1><p className="page-sub">Welcome back! Here's your business snapshot.</p></div>
      </div>

      <div className="stats-grid">
        <div className="stat-card"><div className="stat-label">Today's Sales</div><div className="stat-value">{fmt(stats.todaySales)}</div></div>
        <div className="stat-card"><div className="stat-label">Month Sales</div><div className="stat-value">{fmt(stats.monthSales)}</div></div>
        <div className="stat-card"><div className="stat-label">Total Parties</div><div className="stat-value">{stats.totalParties}</div></div>
        <div className="stat-card"><div className="stat-label">Low Stock Items</div><div className="stat-value" style={{ color: stats.lowStockCount > 0 ? 'var(--danger)' : 'inherit' }}>{stats.lowStockCount}</div></div>
      </div>

      <div className="grid-2 mb-6">
        <div className="card">
          <div className="section-title">Sales (Last 30 Days)</div>
          {salesChart.length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={salesChart}>
                <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={d => d.slice(5)} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={v => '₹' + (v/1000).toFixed(0) + 'k'} />
                <Tooltip formatter={v => fmt(v)} />
                <Area type="monotone" dataKey="total" stroke="#4f46e5" fill="#eef2ff" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="empty-state" style={{ padding: '30px' }}>No sales data yet</div>
          )}
        </div>

        <div className="card">
          <div className="section-title">Low Stock Alerts</div>
          {lowStockItems.length === 0 ? (
            <div className="empty-state" style={{ padding: '30px' }}>✅ All items well stocked</div>
          ) : (
            <table style={{ width: '100%' }}>
              <thead><tr><th>Item</th><th>Stock</th></tr></thead>
              <tbody>
                {lowStockItems.map(item => (
                  <tr key={item.id}>
                    <td>{item.name}</td>
                    <td><span className="badge badge-red">{item.stock} {item.unit}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="card">
        <div className="section-title">Recent Invoices</div>
        {recentInvoices.length === 0 ? (
          <div className="empty-state" style={{ padding: '20px' }}>No invoices yet</div>
        ) : (
          <table style={{ width: '100%' }}>
            <thead><tr><th>Invoice No</th><th>Party</th><th>Type</th><th>Date</th><th>Amount</th><th>Status</th></tr></thead>
            <tbody>
              {recentInvoices.map(inv => (
                <tr key={inv.id}>
                  <td className="fw-bold">{inv.invoice_no}</td>
                  <td>{inv.party_name}</td>
                  <td><span className={`badge ${inv.type === 'sale' ? 'badge-green' : 'badge-blue'}`}>{inv.type}</span></td>
                  <td>{inv.date}</td>
                  <td className="fw-bold">{fmt(inv.grand_total)}</td>
                  <td><span className={`badge ${inv.status === 'paid' ? 'badge-green' : 'badge-yellow'}`}>{inv.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}