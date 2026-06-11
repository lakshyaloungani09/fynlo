import { useState } from 'react'
import { loginUser, registerUser } from '../firebase'

export default function Login() {
  const [mode, setMode] = useState('login') // 'login' | 'register'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [bizName, setBizName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handle = async () => {
    if (!email || !password) return setError('Email aur password dono chahiye')
    if (mode === 'register' && !bizName) return setError('Business name dalo')
    setLoading(true)
    setError('')
    try {
      if (mode === 'register') {
        await registerUser(email, password)
      } else {
        await loginUser(email, password)
      }
    } catch (e) {
      const msg = {
        'auth/email-already-in-use': 'Yeh email already registered hai',
        'auth/invalid-email': 'Email sahi nahi hai',
        'auth/weak-password': 'Password kam se kam 6 characters ka ho',
        'auth/user-not-found': 'Email nahi mila',
        'auth/wrong-password': 'Password galat hai',
        'auth/invalid-credential': 'Email ya password galat hai',
      }[e.code] || e.message
      setError(msg)
    }
    setLoading(false)
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg)', fontFamily: 'var(--font)'
    }}>
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16,
        padding: '40px 36px', width: '100%', maxWidth: 400, boxShadow: '0 8px 32px rgba(0,0,0,0.08)'
      }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            width: 52, height: 52, borderRadius: 14, background: 'var(--primary)',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 26, fontWeight: 800, color: '#fff', marginBottom: 12
          }}>F</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)' }}>Fynlo</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>Smart Business Software</div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', background: 'var(--bg)', borderRadius: 8, padding: 4, marginBottom: 24 }}>
          {['login', 'register'].map(m => (
            <button key={m} onClick={() => { setMode(m); setError('') }} style={{
              flex: 1, padding: '8px 0', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600,
              background: mode === m ? 'var(--primary)' : 'transparent',
              color: mode === m ? '#fff' : 'var(--text-muted)',
              transition: 'all 0.2s'
            }}>
              {m === 'login' ? 'Login' : 'Register'}
            </button>
          ))}
        </div>

        {/* Form */}
        {mode === 'register' && (
          <div className="form-group" style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', display: 'block', marginBottom: 6 }}>Business Name</label>
            <input value={bizName} onChange={e => setBizName(e.target.value)} placeholder="e.g. Simran Fashion" />
          </div>
        )}
        <div className="form-group" style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', display: 'block', marginBottom: 6 }}>Email</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="aapka@email.com" onKeyDown={e => e.key === 'Enter' && handle()} />
        </div>
        <div className="form-group" style={{ marginBottom: 20 }}>
          <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', display: 'block', marginBottom: 6 }}>Password</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" onKeyDown={e => e.key === 'Enter' && handle()} />
        </div>

        {error && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#dc2626' }}>
            ⚠️ {error}
          </div>
        )}

        <button className="btn btn-primary" onClick={handle} disabled={loading} style={{ width: '100%', padding: '11px 0', fontSize: 14 }}>
          {loading ? '...' : mode === 'login' ? '🔐 Login' : '🚀 Register'}
        </button>

        <div style={{ textAlign: 'center', marginTop: 16, fontSize: 12, color: 'var(--text-muted)' }}>
          {mode === 'login' ? 'Naya account?' : 'Pehle se account hai?'}{' '}
          <span onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError('') }}
            style={{ color: 'var(--primary)', cursor: 'pointer', fontWeight: 600 }}>
            {mode === 'login' ? 'Register karo' : 'Login karo'}
          </span>
        </div>
      </div>
    </div>
  )
}
