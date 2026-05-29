import { useEffect, useState } from 'react'
import { addDocument, getDocuments, updateDocument } from '../firebase'

export default function Settings() {
  const [form, setForm] = useState({ name: '', gstin: '', address: '', phone: '' })
  const [docId, setDocId] = useState(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    getDocuments('company').then(snap => {
      if (!snap.empty) {
        const d = snap.docs[0]
        setDocId(d.id)
        setForm(d.data())
      }
    })
  }, [])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const save = async () => {
    if (docId) {
      await updateDocument('company', docId, form)
    } else {
      const ref = await addDocument('company', form)
      setDocId(ref.id)
    }
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  return (
    <div>
      <div className="page-header">
        <div><h1 className="page-title">Settings</h1><p className="page-sub">Company profile and preferences</p></div>
      </div>

      <div className="card" style={{ maxWidth: 560 }}>
        <div className="section-title">Company Profile</div>
        {saved && <div className="alert alert-success">✅ Settings saved successfully!</div>}
        <div className="form-group">
          <label>Company / Business Name *</label>
          <input value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Sharma Trading Co." />
        </div>
        <div className="form-group">
          <label>GSTIN</label>
          <input value={form.gstin} onChange={e => set('gstin', e.target.value)} placeholder="22AAAAA0000A1Z5" />
        </div>
        <div className="form-group">
          <label>Phone</label>
          <input value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="9876543210" />
        </div>
        <div className="form-group">
          <label>Address</label>
          <textarea value={form.address} onChange={e => set('address', e.target.value)} placeholder="Full business address..." />
        </div>
        <button className="btn btn-primary" onClick={save}>Save Settings</button>
      </div>

      <div className="card" style={{ maxWidth: 560, marginTop: 20 }}>
        <div className="section-title">About Fynlo</div>
        <p style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.7 }}>
          Fynlo — AI-powered business accounting software<br />
          Built with Electron + React + Firebase<br />
          Data synced to cloud in real-time<br />
          Version 1.0.0
        </p>
      </div>
    </div>
  )
}