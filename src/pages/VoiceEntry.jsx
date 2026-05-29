import { useState, useRef } from 'react'

export default function VoiceEntry() {
  const [listening, setListening] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [parsed, setParsed] = useState(null)
  const [status, setStatus] = useState('')
  const [textInput, setTextInput] = useState('')
  const recogRef = useRef(null)

  const startListening = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) {
      setStatus('❌ Browser does not support voice. Use text input below.')
      return
    }
    const recog = new SpeechRecognition()
    recog.lang = 'hi-IN'
    recog.interimResults = true
    recog.continuous = false
    recog.onstart = () => { setListening(true); setStatus('🎤 Listening... speak now'); setTranscript('') }
    recog.onresult = (e) => {
      const t = Array.from(e.results).map(r => r[0].transcript).join(' ')
      setTranscript(t)
    }
    recog.onerror = (e) => { setListening(false); setStatus('❌ Error: ' + e.error) }
    recog.onend = async () => {
      setListening(false)
      setStatus('Processing...')
      if (transcript) await parseIt(transcript)
      else setStatus('No speech detected. Try again.')
    }
    recogRef.current = recog
    recog.start()
  }

  const stopListening = () => { recogRef.current?.stop() }

  const parseIt = async (text) => {
    const result = await window.api.ai.parseVoiceEntry(text)
    setParsed(result)
    setStatus('✅ Parsed! Review and confirm below.')
  }

  const handleText = async () => {
    if (!textInput.trim()) return
    setTranscript(textInput)
    await parseIt(textInput)
  }

  const EXAMPLES = [
    'Aaj 5000 ka sale hua Sharma ko',
    'Ram se 2000 ka payment mila',
    'ABC Company ko 10000 ka maal becha',
    'Office rent 15000 diya',
    '50 kg chawal kharida 4500 mein',
  ]

  return (
    <div>
      <div className="page-header">
        <div><h1 className="page-title">Voice AI Entry</h1><p className="page-sub">Bol ke entry karo — Hindi ya English mein</p></div>
      </div>

      <div className="voice-container">
        <div className="card mb-4" style={{ textAlign: 'center', padding: '40px 20px' }}>
          <p style={{ marginBottom: 24, color: 'var(--text2)' }}>
            Mic dabao aur bolo — e.g. <em>"Aaj 5000 ka sale hua Sharma ko"</em>
          </p>
          <button
            className={`mic-btn ${listening ? 'listening' : ''}`}
            onClick={listening ? stopListening : startListening}
            title={listening ? 'Click to stop' : 'Click to speak'}
          >
            {listening ? '⏹' : '🎤'}
          </button>
          <p style={{ marginTop: 16, fontSize: 13, color: 'var(--text2)' }}>
            {listening ? 'Tap to stop recording' : 'Tap to start recording'}
          </p>
          {status && <p style={{ marginTop: 12, fontSize: 13, color: 'var(--primary)' }}>{status}</p>}
        </div>

        {transcript && (
          <div className="card mb-4">
            <div className="section-title">You said:</div>
            <div className="transcript-box">{transcript}</div>
          </div>
        )}

        {parsed && (
          <div className="card mb-4">
            <div className="section-title">AI Parsed Result</div>
            <table style={{ width: '100%' }}>
              <tbody>
                <tr><td style={{ width: 140, color: 'var(--text2)', fontSize: 13 }}>Type</td><td><span className={`badge ${parsed.type === 'sale' ? 'badge-green' : parsed.type === 'purchase' ? 'badge-blue' : 'badge-yellow'}`}>{parsed.type || 'Not detected'}</span></td></tr>
                <tr><td style={{ color: 'var(--text2)', fontSize: 13 }}>Amount</td><td className="fw-bold">{parsed.amount ? '₹' + parsed.amount.toLocaleString('en-IN') : 'Not detected'}</td></tr>
                <tr><td style={{ color: 'var(--text2)', fontSize: 13 }}>Party</td><td>{parsed.party || 'Not detected'}</td></tr>
                <tr><td style={{ color: 'var(--text2)', fontSize: 13 }}>Narration</td><td className="text-muted">{parsed.narration}</td></tr>
              </tbody>
            </table>
            <div style={{ marginTop: 16, padding: '10px 14px', background: 'var(--warning-light)', borderRadius: 'var(--radius)', fontSize: 13, color: 'var(--warning)' }}>
              ⚠️ Voice entry parsed successfully. Go to Billing or Ledger to create the actual entry with full details.
            </div>
          </div>
        )}

        <div className="card mb-4">
          <div className="section-title">Or type your entry</div>
          <div className="flex gap-2">
            <input value={textInput} onChange={e => setTextInput(e.target.value)} placeholder="e.g. Aaj 3000 ka sale hua ABC ko..." onKeyDown={e => e.key === 'Enter' && handleText()} />
            <button className="btn btn-primary" onClick={handleText}>Parse</button>
          </div>
        </div>

        <div className="card">
          <div className="section-title">Example phrases you can say</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {EXAMPLES.map((ex, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ color: 'var(--text2)', fontSize: 12 }}>💬</span>
                <span style={{ fontSize: 13, color: 'var(--text)' }}>"{ex}"</span>
                <button className="btn btn-sm" style={{ marginLeft: 'auto' }} onClick={() => { setTextInput(ex) }}>Try</button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
