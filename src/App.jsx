import { useState } from 'react'
import { HashRouter, Routes, Route, NavLink, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './AuthContext'
import { logoutUser } from './firebase'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Customers from './pages/Customers'
import Vendors from './pages/Vendors'
import Items from './pages/Items'
import Invoices from './pages/Invoices'
import Reports from './pages/Reports'
import VoiceEntry from './pages/VoiceEntry'
import Settings from './pages/Settings'
import Payments from './pages/Payments'
import './App.css'

const NAV = [
  { to: '/dashboard', icon: '⊞', label: 'Dashboard' },
  { to: '/invoices', icon: '📄', label: 'Billing' },
  { to: '/payments', icon: '💰', label: 'Payments' },
  { to: '/customers', icon: '👥', label: 'Customers' },
  { to: '/vendors', icon: '🏭', label: 'Vendors' },
  { to: '/items', icon: '📦', label: 'Inventory' },
  { to: '/reports', icon: '📊', label: 'Reports' },
  { to: '/voice', icon: '🎤', label: 'Voice AI' },
  { to: '/settings', icon: '⚙', label: 'Settings' },
]

function AppShell() {
  const user = useAuth()
  const [sidebarOpen, setSidebarOpen] = useState(true)

  // Loading
  if (user === undefined) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 36, fontWeight: 800, color: 'var(--primary)', marginBottom: 8 }}>F</div>
        <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>Loading...</div>
      </div>
    </div>
  )

  // Not logged in
  if (!user) return <Login />

  // Logged in
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
          {/* User info + logout */}
          <div style={{ padding: sidebarOpen ? '12px 16px' : '12px 8px', borderTop: '1px solid var(--border)', marginTop: 'auto' }}>
            {sidebarOpen && (
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {user.email}
              </div>
            )}
            <button className="btn btn-sm" onClick={logoutUser} style={{ width: '100%', justifyContent: 'center' }}
              title="Logout">
              {sidebarOpen ? '🚪 Logout' : '🚪'}
            </button>
          </div>
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
            <Route path="/customers" element={<Customers />} />
            <Route path="/vendors/*" element={<Vendors />} />
            <Route path="/items" element={<Items />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/voice" element={<VoiceEntry />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </main>
      </div>
    </HashRouter>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  )
}
