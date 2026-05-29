import { useState } from 'react'
import { HashRouter, Routes, Route, NavLink, Navigate } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import Parties from './pages/Parties'
import Items from './pages/Items'
import Invoices from './pages/Invoices'
import Ledger from './pages/Ledger'
import Reports from './pages/Reports'
import VoiceEntry from './pages/VoiceEntry'
import Settings from './pages/Settings'
import Payments from './pages/Payments'
import './App.css'

const NAV = [
  { to: '/dashboard', icon: '⊞', label: 'Dashboard' },
  { to: '/invoices', icon: '📄', label: 'Billing' },
  { to: '/payments', icon: '💰', label: 'Payments' },
  { to: '/parties', icon: '👥', label: 'Parties' },
  { to: '/items', icon: '📦', label: 'Inventory' },
  { to: '/ledger', icon: '📒', label: 'Ledger' },
  { to: '/reports', icon: '📊', label: 'Reports' },
  { to: '/voice', icon: '🎤', label: 'Voice AI' },
  { to: '/settings', icon: '⚙', label: 'Settings' },
]

export default function App() {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  return (
    <HashRouter>
      <div className="app-shell">
        <aside className={`sidebar ${sidebarOpen ? 'open' : 'collapsed'}`}>
          <div className="sidebar-header">
            <span className="logo">F</span>
            {sidebarOpen && <span className="app-name">Fynlo</span>}
          </div>
          <nav className="nav-list">
            {NAV.map(n => (
              <NavLink key={n.to} to={n.to} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                <span className="nav-icon">{n.icon}</span>
                {sidebarOpen && <span className="nav-label">{n.label}</span>}
              </NavLink>
            ))}
          </nav>
          <button className="collapse-btn" onClick={() => setSidebarOpen(!sidebarOpen)}>
            {sidebarOpen ? '◀' : '▶'}
          </button>
        </aside>
        <main className="main-content">
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/invoices/*" element={<Invoices />} />
            <Route path="/payments" element={<Payments />} />
            <Route path="/parties" element={<Parties />} />
            <Route path="/items" element={<Items />} />
            <Route path="/ledger" element={<Ledger />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/voice" element={<VoiceEntry />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </main>
      </div>
    </HashRouter>
  )
}
