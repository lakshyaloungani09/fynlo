import { useState, useRef } from 'react'
import { addDocument, getDocuments, updateDocument } from '../firebase'

const today = () => new Date().toISOString().split('T')[0]
const fmt = n => '₹' + Number(n || 0).toLocaleString('en-IN')

export default function VoiceEntry() {
  const user = useAuth()
  const uid = user?.uid
  const [listening, setListening] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [status, setStatus] = useState('')
  const [textInput, setTextInput] = useState('')
  const [result, setResult] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const recogRef = useRef(null)
  const lastTranscriptRef = useRef('')

  const GROQ_KEY = import.meta.env.VITE_GROQ_API_KEY

  const parseWithGroq = async (text) => {
    setStatus('🤖 AI samajh raha hai...')
    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${GROQ_KEY}`
        },
        body: JSON.stringify({
          model: 'llama-3.1-8b-instant',
          messages: [
            {
              role: 'system',
              content: `You are a business accounting assistant. Parse Hindi/English/Hinglish voice commands into structured data.
Extract: type (sale/purchase/payment_received/payment_made/expense), amount (number), party (name), item (product name), date, narration.
Respond ONLY with valid JSON like:
{"type":"sale","amount":5000,"party":"Sharma","item":"Rice","date":"today","narration":"original text"}
If you cannot determine a field, use null. Type must be one of: sale, purchase, payment_received, payment_made, expense.`
            },
            { role: 'user', content: text }
          ],
          temperature: 0.1,
          max_tokens: 200
        })
      })
      const data = await response.json()
      const content = data.choices[0].message.content.trim()
      const parsed = JSON.parse(content)
      return parsed
    } catch (e) {
      setStatus('❌ AI parse nahi kar paya — manually check karo')
      return null
    }
  }

  const startListening = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) {
      setStatus('❌ Browser voice support nahi karta — text input use karo')
      return
    }
    const recog = new SpeechRecognition()
    recog.lang = 'en-US'
    recog.interimResults = true
    recog.continuous = false
    recog.onstart = () => {
      setListening(true)
      setStatus('🎤 Bol raha hoon...')
      setTranscript('')
      setResult(null)
      setSaved(false)
      lastTranscriptRef.current = ''
    }
    recog.onresult = (e) => {
      const t = Array.from(e.results).map(r => r[0].transcript).join(' ')
      setTranscript(t)
      lastTranscriptRef.current = t
    }
    recog.onerror = (e) => { setListening(false); setStatus('❌ Error: ' + e.error) }
    recog.onend = async () => {
      setListening(false)
      const t = lastTranscriptRef.current
      if (t) {
        const parsed = await parseWithGroq(t)
        if (parsed) {
          setResult(parsed)
          setStatus('✅ Samajh gaya! Review karo aur confirm karo.')
        }
      } else {
        setStatus('Kuch nahi suna — dobara try karo')
      }
    }
    recogRef.current = recog
    recog.start()
  }

  const stopListening = () => recogRef.current?.stop()

  const handleText = async () => {
    if (!textInput.trim()) return
    setTranscript(textInput)
    const parsed = await parseWithGroq(textInput)
    if (parsed) {
      setResult(parsed)
      setStatus('✅ Samajh gaya! Review karo aur confirm karo.')
    }
  }

  const confirmEntry = async () => {
    if (!result) return
    setSaving(true)
    try {
      // Step 1: Party check karo — nahi hai toh add karo
      let partyId = null
      if (result.party) {
        const partySnap = await getDocuments(uid, 'parties')
        const parties = partySnap.docs.map(d => ({ id: d.id, ...d.data() }))
        const existing = parties.find(p => p.name.toLowerCase() === result.party.toLowerCase())
        
        if (existing) {
          partyId = existing.id
        } else {
          // Nayi party add karo
          const partyType = result.type === 'sale' ? 'customer' : result.type === 'purchase' ? 'vendor' : 'both'
          const newParty = await addDocument(uid, 'parties', {
            name: result.party,
            type: partyType,
            phone: '',
            email: '',
            address: '',
            gstin: '',
            balance: 0
          })
          partyId = newParty.id
          setStatus('✅ Nayi party add ho gayi: ' + result.party)
        }
      }

      // Step 2: Entry type ke hisaab se save karo
      if (result.type === 'sale' || result.type === 'purchase') {
        await addDocument(uid, 'invoices', {
          invoice_no: (result.type === 'sale' ? 'INV-' : 'PUR-') + Date.now().toString().slice(-6),
          type: result.type,
          party_id: partyId || '',
          party_name: result.party || 'Unknown',
          date: today(),
          total: result.amount || 0,
          tax: 0,
          grand_total: result.amount || 0,
          status: 'unpaid',
          notes: result.narration || '',
          items: result.item ? [{ item_name: result.item, qty: 1, rate: result.amount, amount: result.amount, gst_amount: 0 }] : []
        })

        // Party balance update karo
        if (partyId) {
          const partySnap = await getDocuments(uid, 'parties')
          const party = partySnap.docs.map(d => ({ id: d.id, ...d.data() })).find(p => p.id === partyId)
          if (party) {
            const delta = result.type === 'sale' ? (result.amount || 0) : -(result.amount || 0)
            await updateDocument(uid, 'parties', partyId, { balance: (party.balance || 0) + delta })
          }
        }

      } else if (result.type === 'payment_received' || result.type === 'payment_made') {
        await addDocument(uid, 'payments', {
          party_id: partyId || '',
          party_name: result.party || 'Unknown',
          amount: result.amount || 0,
          type: result.type === 'payment_received' ? 'received' : 'paid',
          mode: 'cash',
          date: today(),
          note: result.narration || ''
        })

        // Party balance update karo
        if (partyId) {
          const partySnap = await getDocuments(uid, 'parties')
          const party = partySnap.docs.map(d => ({ id: d.id, ...d.data() })).find(p => p.id === partyId)
          if (party) {
            const delta = result.type === 'payment_received' ? -(result.amount || 0) : (result.amount || 0)
            await updateDocument(uid, 'parties', partyId, { balance: (party.balance || 0) + delta })
          }
        }

      } else if (result.type === 'expense') {
        await addDocument(uid, 'expenses', {
          description: result.narration || result.item || 'Expense',
          amount: result.amount || 0,
          date: today(),
          note: result.narration || ''
        })
      }

      setSaved(true)
      setStatus('✅ Entry save ho gayi! Party bhi update ho gayi.')
      setResult(null)
      setTranscript('')
      setTextInput('')
      lastTranscriptRef.current = ''
    } catch (e) {
      setStatus('❌ Save nahi hua — dobara try karo: ' + e.message)
    }
    setSaving(false)
  }

  const EXAMPLES = [
    'Sold 5000 worth goods to Sharma',
    'Received payment 2000 from Ram',
    'Purchased goods worth 10000 from ABC Company',
    'Paid office rent 15000',
    'Bought 50 kg rice for 4500 from Raj Traders',
    'Electricity bill paid 800 rupees',
  ]

  const TYPE_LABELS = {
    sale: '📦 Sale',
    purchase: '🛒 Purchase',
    payment_received: '💵 Payment Received',
    payment_made: '💸 Payment Made',
    expense: '💰 Expense'
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Voice AI Entry</h1>
          <p className="page-sub">Bol ke entry karo — Hindi ya English mein, AI samjhega</p>
        </div>
      </div>

      <div className="voice-container">
        <div className="card mb-4" style={{ textAlign: 'center', padding: '40px 20px' }}>
          <p style={{ marginBottom: 24, color: 'var(--text2)', fontSize: 14 }}>
            Mic dabao aur bolo — e.g. <em>"Aaj 5000 ka sale hua Sharma ko"</em>
          </p>
          <button className={`mic-btn ${listening ? 'listening' : ''}`} onClick={listening ? stopListening : startListening}>
            {listening ? '⏹' : '🎤'}
          </button>
          <p style={{ marginTop: 16, fontSize: 13, color: 'var(--text2)' }}>
            {listening ? 'Tap to stop' : 'Tap to speak'}
          </p>
          {status && <p style={{ marginTop: 12, fontSize: 13, color: 'var(--primary)', fontWeight: 500 }}>{status}</p>}
        </div>

        {transcript && (
          <div className="card mb-4">
            <div className="section-title">Tumne kaha:</div>
            <div className="transcript-box">{transcript}</div>
          </div>
        )}

        {result && (
          <div className="card mb-4" style={{ border: '1px solid var(--primary)' }}>
            <div className="section-title">AI ne samjha:</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
              <div style={{ background: 'var(--bg)', borderRadius: 'var(--radius)', padding: '10px 14px' }}>
                <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>TYPE</div>
                <div style={{ fontWeight: 600 }}>{TYPE_LABELS[result.type] || result.type}</div>
              </div>
              <div style={{ background: 'var(--bg)', borderRadius: 'var(--radius)', padding: '10px 14px' }}>
                <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>AMOUNT</div>
                <div style={{ fontWeight: 600, fontSize: 18, color: 'var(--primary)' }}>{result.amount ? fmt(result.amount) : '—'}</div>
              </div>
              <div style={{ background: 'var(--bg)', borderRadius: 'var(--radius)', padding: '10px 14px' }}>
                <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>PARTY</div>
                <div style={{ fontWeight: 500 }}>{result.party || '—'}</div>
                {result.party && <div style={{ fontSize: 11, color: 'var(--success)', marginTop: 2 }}>Auto-add hoga agar naya hai</div>}
              </div>
              <div style={{ background: 'var(--bg)', borderRadius: 'var(--radius)', padding: '10px 14px' }}>
                <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>ITEM</div>
                <div style={{ fontWeight: 500 }}>{result.item || '—'}</div>
              </div>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 16 }}>
              Narration: {result.narration}
            </div>
            <div className="flex gap-2">
              <button className="btn btn-primary" onClick={confirmEntry} disabled={saving}>
                {saving ? 'Saving...' : '✅ Confirm & Save Entry'}
              </button>
              <button className="btn" onClick={() => { setResult(null); setStatus('') }}>Cancel</button>
            </div>
          </div>
        )}

        {saved && (
          <div className="alert alert-success mb-4">
            ✅ Entry + Party successfully save ho gayi Firebase mein! Parties page pe jaake dekho.
          </div>
        )}

        <div className="card mb-4">
          <div className="section-title">Ya text mein likho</div>
          <div className="flex gap-2">
            <input
              value={textInput}
              onChange={e => setTextInput(e.target.value)}
              placeholder="e.g. Sold 5000 to Sharma..."
              onKeyDown={e => e.key === 'Enter' && handleText()}
            />
            <button className="btn btn-primary" onClick={handleText}>Parse</button>
          </div>
        </div>

        <div className="card">
          <div className="section-title">Example phrases</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {EXAMPLES.map((ex, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ color: 'var(--text2)', fontSize: 13 }}>💬</span>
                <span style={{ fontSize: 13 }}>"{ex}"</span>
                <button className="btn btn-sm" style={{ marginLeft: 'auto' }} onClick={() => setTextInput(ex)}>Try</button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
