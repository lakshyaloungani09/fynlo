```jsx
import { useEffect, useState } from 'react'
import { useAuth } from '../AuthContext'
import {
  addDocument,
  getDocuments,
  updateDocument
} from '../firebase'

import {
  collection,
  getDocs,
  deleteDoc,
  doc,
  getFirestore
} from 'firebase/firestore'

const db = getFirestore()

export default function Settings() {
  const user = useAuth()
  const uid = user?.uid

  const [form, setForm] = useState({
    name: '',
    gstin: '',
    address: '',
    phone: ''
  })

  const [docId, setDocId] = useState(null)
  const [saved, setSaved] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [resetDone, setResetDone] = useState(false)

  useEffect(() => {
    if (!uid) return

    let mounted = true

    const fetchCompany = async () => {
      try {
        const snap = await getDocuments(uid, 'company')

        if (!mounted) return

        if (!snap.empty) {
          const d = snap.docs[0]

          setDocId(d.id)
          setForm({
            name: d.data().name || '',
            gstin: d.data().gstin || '',
            address: d.data().address || '',
            phone: d.data().phone || ''
          })
        }
      } catch (e) {
        console.error(e)
      }
    }

    fetchCompany()

    return () => {
      mounted = false
    }

  }, [uid])

  const set = (k, v) => {
    setForm(f => ({
      ...f,
      [k]: v
    }))
  }

  const save = async () => {

    if (!uid) return

    if (!form.name.trim()) {
      alert('Company name is required')
      return
    }

    try {

      if (docId) {

        await updateDocument(
          uid,
          'company',
          docId,
          form
        )

      } else {

        const ref = await addDocument(
          uid,
          'company',
          form
        )

        setDocId(ref.id)
      }

      setSaved(true)

      setTimeout(() => {
        setSaved(false)
      }, 2500)

    } catch (e) {

      alert('Error saving settings: ' + e.message)

    }
  }

  const resetAllData = async () => {

    if (!uid) return

    const confirmed = window.confirm(
      '⚠️ WARNING!\n\nYeh action SABB data delete kar dega:\n• Company Profile\n• Saare invoices\n• Saare customers\n• Saare vendors\n• Saara inventory\n• Saare payments\n• Saari bills\n\nKya aap sure hain? Yeh undo nahi ho sakta!'
    )

    if (!confirmed) return

    const confirmed2 = window.confirm(
      'Aakhri baar confirm karo — SABB DATA DELETE HOGA!'
    )

    if (!confirmed2) return

    setResetting(true)

    try {

      const COLLECTIONS = [
        'company',
        'invoices',
        'parties',
        'items',
        'payments',
        'vendor_bills',
        'bill_payments',
        'expenses',
        'journal_entries',
        'accounts'
      ]

      for (const colName of COLLECTIONS) {

        const snap = await getDocs(
          collection(
            db,
            'users',
            uid,
            colName
          )
        )

        const deletePromises = snap.docs.map(d =>
          deleteDoc(
            doc(
              db,
              'users',
              uid,
              colName,
              d.id
            )
          )
        )

        await Promise.all(deletePromises)
      }

      setResetDone(true)

      setTimeout(() => {
        setResetDone(false)
      }, 4000)

    } catch (e) {

      alert('Error: ' + e.message)

    } finally {

      setResetting(false)

    }
  }

  return (
    <div>

      <div className="page-header">
        <div>
          <h1 className="page-title">
            Settings
          </h1>

          <p className="page-sub">
            Company profile and preferences
          </p>
        </div>
      </div>

      <div
        className="card mb-4"
        style={{ maxWidth: 560 }}
      >

        <div className="section-title">
          Company Profile
        </div>

        {saved && (
          <div className="alert alert-success">
            ✅ Settings saved successfully!
          </div>
        )}

        <div className="form-group">
          <label>
            Company / Business Name *
          </label>

          <input
            value={form.name}
            onChange={e =>
              set('name', e.target.value)
            }
            placeholder="e.g. Sharma Trading Co."
          />
        </div>

        <div className="form-group">
          <label>GSTIN</label>

          <input
            value={form.gstin}
            onChange={e =>
              set('gstin', e.target.value)
            }
            placeholder="22AAAAA0000A1Z5"
          />
        </div>

        <div className="form-group">
          <label>Phone</label>

          <input
            value={form.phone}
            onChange={e =>
              set('phone', e.target.value)
            }
            placeholder="9876543210"
          />
        </div>

        <div className="form-group">
          <label>Address</label>

          <textarea
            value={form.address}
            onChange={e =>
              set('address', e.target.value)
            }
            placeholder="Full business address..."
          />
        </div>

        <button
          className="btn btn-primary"
          onClick={save}
        >
          Save Settings
        </button>

      </div>

      <div
        className="card mb-4"
        style={{ maxWidth: 560 }}
      >

        <div className="section-title">
          About Fynlo
        </div>

        <p
          style={{
            fontSize: 13,
            color: 'var(--text2)',
            lineHeight: 1.7
          }}
        >
          Fynlo — AI-powered business accounting software
          <br />

          Built with Electron + React + Firebase

          <br />

          Data synced to cloud in real-time

          <br />

          Version 1.0.0
        </p>

      </div>

      <div
        className="card"
        style={{
          maxWidth: 560,
          border: '1px solid var(--danger)',
          background: '#fff8f8'
        }}
      >

        <div
          className="section-title"
          style={{
            color: 'var(--danger)'
          }}
        >
          ⚠️ Danger Zone
        </div>

        {resetDone && (

          <div className="alert alert-success mb-4">

            ✅ Sabb data successfully delete ho gaya!

          </div>

        )}

        <p
          style={{
            fontSize: 13,
            color: 'var(--text2)',
            marginBottom: 16,
            lineHeight: 1.6
          }}
        >

          Yeh button
          <strong>
            {' '}sabb data permanently delete{' '}
          </strong>

          kar dega — invoices, customers,
          vendors, inventory, payments sabb.

          Yeh action undo nahi ho sakta.

        </p>

        <button

          className="btn btn-danger"

          onClick={resetAllData}

          disabled={resetting}

          style={{
            width: '100%',
            padding: '10px',
            fontSize: 14
          }}

        >

          {
            resetting
              ? '🔄 Deleting all data...'
              : '🗑️ Reset All Data'
          }

        </button>

      </div>

    </div>
  )
}
```
s