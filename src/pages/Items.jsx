import { useAuth } from '../AuthContext'
import { useEffect, useRef, useState } from 'react'
import { addDocument, getDocuments, updateDocument, deleteDocument } from '../firebase'
import JsBarcode from 'jsbarcode'
import QRCode from 'qrcode'

const EMPTY = { name: '', unit: 'Nos', sale_price: '', stock: '', low_stock_alert: 10, hsn_code: '', gst_rate: 18, barcode: '', barcode_type: 'CODE128', customFields: {} }
const UNITS = ['Nos', 'Kg', 'Gram', 'Litre', 'ML', 'Meter', 'Box', 'Dozen', 'Piece', 'Set']
const fmt = n => '₹' + Number(n || 0).toLocaleString('en-IN')
const genEAN13Digits = () => {
  const ts = Date.now().toString().slice(-9)
  const rand = Math.floor(Math.random() * 1000).toString().padStart(3, '0')
  return (ts + rand).slice(0, 12) // JsBarcode auto-computes the 13th check digit
}
const genBarcode = (type = 'CODE128') => type === 'EAN13' ? genEAN13Digits() : 'FYN' + Date.now().toString().slice(-9)
const isValidBarcodeForType = (code, type) => type === 'EAN13' ? /^\d{12,13}$/.test(code || '') : !!(code || '').trim()
const genId = () => (crypto.randomUUID ? crypto.randomUUID() : 'cf_' + Date.now() + Math.random().toString(36).slice(2, 8))
// Sale price entered is GST-inclusive; derive base price + GST amount from it
const gstBreakdown = (salePrice, gstRate) => {
  const sp = +salePrice || 0
  const rate = +gstRate || 0
  const base = rate ? sp / (1 + rate / 100) : sp
  return { base, gstAmt: sp - base, total: sp }
}

export default function Items() {
  const user = useAuth()
  const uid = user?.uid
  const [items, setItems] = useState([])
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [barcodeModal, setBarcodeModal] = useState(null) // item to show barcode for
  const [barcodeError, setBarcodeError] = useState(null)
  const barcodeSvgRef = useRef(null)
  const qrCanvasRef = useRef(null)

  // Custom field schema (applies to all items, configured once)
  const [customFieldDefs, setCustomFieldDefs] = useState([])
  const [cfSettingsId, setCfSettingsId] = useState(null)
  const [cfModal, setCfModal] = useState(false)
  const [cfDraft, setCfDraft] = useState([])
  const [cfSaving, setCfSaving] = useState(false)

  const load = async () => {
    const snap = await getDocuments(uid, 'items')
    setItems(snap.docs.map(d => ({ id: d.id, ...d.data() })))
  }

  const loadCustomFieldDefs = async () => {
    const snap = await getDocuments(uid, 'item_settings')
    if (!snap.empty) {
      const d = snap.docs[0]
      setCfSettingsId(d.id)
      setCustomFieldDefs(d.data().fields || [])
    }
  }

  useEffect(() => { load(); loadCustomFieldDefs() }, [])

  // Render barcode/QR when modal opens
  useEffect(() => {
    if (!barcodeModal) return
    const code = barcodeModal.barcode || barcodeModal.id
    const type = barcodeModal.barcode_type || 'CODE128'
    setBarcodeError(null)
    setTimeout(() => {
      try {
        if (type === 'QR') {
          if (qrCanvasRef.current) {
            QRCode.toCanvas(qrCanvasRef.current, code, { width: 200, margin: 2 }, () => {})
          }
        } else {
          if (barcodeSvgRef.current) {
            JsBarcode(barcodeSvgRef.current, code, {
              format: type,
              width: 2,
              height: 80,
              displayValue: true,
              fontSize: 14,
              margin: 10
            })
          }
        }
      } catch (err) {
        setBarcodeError(`"${code}" ${type} format ke liye valid nahi hai (EAN-13 ko exactly 12-13 digit number chahiye). Naya barcode generate karo.`)
      }
    }, 50)
  }, [barcodeModal])

  const regenerateModalBarcode = async () => {
    const newCode = genBarcode(barcodeModal.barcode_type)
    await updateDocument(uid, 'items', barcodeModal.id, { barcode: newCode })
    setBarcodeModal(m => ({ ...m, barcode: newCode }))
    load()
  }

  // Search across all fields, including custom fields
  const matchesSearch = (item, q) => {
    if (!q) return true
    const ql = q.toLowerCase()
    const baseFields = [
      item.name, item.unit, item.hsn_code, item.barcode,
      item.sale_price, item.stock, item.gst_rate
    ]
    const cfValues = item.customFields ? Object.values(item.customFields) : []
    return [...baseFields, ...cfValues].some(f => String(f ?? '').toLowerCase().includes(ql))
  }

  const filtered = items.filter(i => matchesSearch(i, search))

  // Suggestions for autofill (datalist) sourced from previously entered data
  const suggestionsFor = (key, isCustom = false) => {
    const vals = items
      .map(i => isCustom ? i.customFields?.[key] : i[key])
      .filter(v => v !== undefined && v !== null && v !== '')
      .map(String)
    return [...new Set(vals)]
  }

  const blankCustomFields = () => {
    const cf = {}
    customFieldDefs.forEach(f => { cf[f.id] = '' })
    return cf
  }

  const openNew = () => { setForm({ ...EMPTY, barcode: genBarcode(EMPTY.barcode_type), customFields: blankCustomFields() }); setModal(true) }
  const openEdit = (item) => {
    const cf = blankCustomFields()
    Object.assign(cf, item.customFields || {})
    setForm({ ...item, customFields: cf })
    setModal(true)
  }

  const save = async () => {
    if (!form.name.trim()) return alert('Item name required')
    setSaving(true)
    const customFieldsData = {}
    customFieldDefs.forEach(f => {
      const val = form.customFields?.[f.id] ?? ''
      customFieldsData[f.id] = f.type === 'number' ? (val === '' ? '' : +val) : val
    })
    const data = {
      ...form,
      sale_price: +form.sale_price,
      stock: +form.stock,
      low_stock_alert: +form.low_stock_alert,
      gst_rate: +form.gst_rate,
      barcode: form.barcode || genBarcode(form.barcode_type),
      customFields: customFieldsData
    }
    if (form.id) {
      const { id, ...rest } = data
      await updateDocument(uid, 'items', id, rest)
    } else {
      await addDocument(uid, 'items', data)
    }
    setSaving(false)
    setModal(false)
    load()
  }

  const del = async (id) => {
    if (!confirm('Delete this item?')) return
    await deleteDocument(uid, 'items', id)
    load()
  }

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const setCf = (id, v) => setForm(f => ({ ...f, customFields: { ...f.customFields, [id]: v } }))
  const setBarcodeType = (type) => setForm(f => ({
    ...f,
    barcode_type: type,
    barcode: isValidBarcodeForType(f.barcode, type) ? f.barcode : genBarcode(type)
  }))

  // --- Custom field schema management ---
  const openCfModal = () => { setCfDraft(customFieldDefs.map(f => ({ ...f }))); setCfModal(true) }
  const addCfRow = () => setCfDraft(d => [...d, { id: genId(), label: '', type: 'text' }])
  const updateCfRow = (id, key, val) => setCfDraft(d => d.map(f => f.id === id ? { ...f, [key]: val } : f))
  const removeCfRow = (id) => setCfDraft(d => d.filter(f => f.id !== id))

  const saveCfDefs = async () => {
    setCfSaving(true)
    const clean = cfDraft.filter(f => f.label.trim())
    if (cfSettingsId) {
      await updateDocument(uid, 'item_settings', cfSettingsId, { fields: clean })
    } else {
      const ref = await addDocument(uid, 'item_settings', { fields: clean })
      setCfSettingsId(ref.id)
    }
    setCustomFieldDefs(clean)
    setCfSaving(false)
    setCfModal(false)
  }

  const printBarcode = () => {
    const type = barcodeModal.barcode_type || 'CODE128'
    let imgData = ''
    if (type === 'QR') {
      imgData = qrCanvasRef.current?.toDataURL('image/png') || ''
    } else {
      const svgEl = barcodeSvgRef.current
      const svgData = new XMLSerializer().serializeToString(svgEl)
      imgData = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)))
    }
    const win = window.open('', '_blank')
    win.document.write(`
      <html><head><title>Barcode - ${barcodeModal.name}</title>
      <style>
        body { font-family: Arial, sans-serif; display:flex; flex-direction:column; align-items:center; padding:20px; }
        .label { border: 1px solid #ccc; padding: 16px 24px; text-align:center; border-radius:8px; }
        .item-name { font-size:14px; font-weight:bold; margin-bottom:8px; }
        .price { font-size:13px; color:#555; margin-top:8px; }
        @media print { button { display:none; } }
      </style></head><body>
      <div class="label">
        <div class="item-name">${barcodeModal.name}</div>
        <img src="${imgData}" style="max-width:220px;" />
        <div class="price">₹${Number(barcodeModal.sale_price || 0).toLocaleString('en-IN')}</div>
      </div>
      <br/>
      <button onclick="window.print()">🖨️ Print</button>
      </body></html>
    `)
    win.document.close()
  }

  return (
    <div>
      <div className="page-header">
        <div><h1 className="page-title">Inventory</h1><p className="page-sub">Items, stock levels and pricing</p></div>
        <div className="flex gap-2">
          <button className="btn" onClick={openCfModal}>⚙️ Custom Fields</button>
          <button className="btn btn-primary" onClick={openNew}>+ Add Item</button>
        </div>
      </div>

      <div className="search-bar">
        <input className="search-input" placeholder="Search by name, HSN, barcode, custom fields..." value={search} onChange={e => setSearch(e.target.value)} />
        <span className="text-muted">{filtered.length} items</span>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th><th>Unit</th><th>Sale Price</th><th>Stock</th><th>GST %</th>
              {customFieldDefs.map(f => <th key={f.id}>{f.label}</th>)}
              <th>Barcode</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={7 + customFieldDefs.length}><div className="empty-state"><div className="empty-icon">📦</div><div>No items yet.</div></div></td></tr>
            ) : filtered.map(item => (
              <tr key={item.id}>
                <td className="fw-bold">{item.name}</td>
                <td>{item.unit}</td>
                <td>{fmt(item.sale_price)}</td>
                <td>
                  <span className={`badge ${item.stock <= item.low_stock_alert ? 'badge-red' : 'badge-green'}`}>
                    {item.stock} {item.unit}
                  </span>
                </td>
                <td>{item.gst_rate}%</td>
                {customFieldDefs.map(f => (
                  <td key={f.id}>{item.customFields?.[f.id] || '—'}</td>
                ))}
                <td>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                    {item.barcode ? item.barcode.slice(0, 12) + (item.barcode.length > 12 ? '…' : '') : '—'}
                  </span>
                </td>
                <td>
                  <div className="flex gap-2">
                    <button className="btn btn-sm" onClick={() => openEdit(item)}>Edit</button>
                    <button className="btn btn-sm" onClick={() => setBarcodeModal(item)} title="View/Print Barcode">🔖</button>
                    <button className="btn btn-sm btn-danger" onClick={() => del(item.id)}>Delete</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add/Edit Item Modal */}
      {modal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModal(false)}>
          <div className="modal">
            <div className="modal-header">
              <span className="modal-title">{form.id ? 'Edit Item' : 'Add Item'}</span>
              <button className="close-btn" onClick={() => setModal(false)}>×</button>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Item Name *</label>
                <input value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Rice Basmati" autoFocus />
              </div>
              <div className="form-group">
                <label>Unit</label>
                <select value={form.unit} onChange={e => set('unit', e.target.value)}>
                  {UNITS.map(u => <option key={u}>{u}</option>)}
                </select>
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Current Stock</label>
                <input type="number" value={form.stock} onChange={e => set('stock', e.target.value)} placeholder="0" />
              </div>
              <div className="form-group">
                <label>Low Stock Alert At</label>
                <input type="number" value={form.low_stock_alert} onChange={e => set('low_stock_alert', e.target.value)} />
              </div>
            </div>
            <div className="form-group">
              <label>HSN Code</label>
              <input value={form.hsn_code} onChange={e => set('hsn_code', e.target.value)} placeholder="e.g. 1006" list="hsn-suggestions" />
              <datalist id="hsn-suggestions">
                {suggestionsFor('hsn_code').map(v => <option key={v} value={v} />)}
              </datalist>
            </div>

            {/* Sale Price & GST breakdown */}
            <div style={{ background: 'var(--primary-light)', borderRadius: 8, padding: '12px 16px', marginBottom: 16 }}>
              <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 13 }}>💰 Sale Price & GST</div>
              <div className="form-row">
                <div className="form-group">
                  <label>Sale Price (₹, GST included)</label>
                  <input type="number" value={form.sale_price} onChange={e => set('sale_price', e.target.value)} placeholder="0" />
                </div>
                <div className="form-group">
                  <label>GST Rate (%)</label>
                  <select value={form.gst_rate} onChange={e => set('gst_rate', e.target.value)}>
                    {[0, 5, 12, 18, 28].map(r => <option key={r} value={r}>{r}%</option>)}
                  </select>
                </div>
              </div>
              {(() => {
                const { base, gstAmt, total } = gstBreakdown(form.sale_price, form.gst_rate)
                return (
                  <div style={{ fontSize: 12.5, borderTop: '1px dashed var(--border)', paddingTop: 10, marginTop: 4 }}>
                    <div className="flex" style={{ justifyContent: 'space-between', marginBottom: 4, color: 'var(--text-muted)' }}>
                      <span>Base Price (excl. GST)</span><span>₹{base.toFixed(2)}</span>
                    </div>
                    <div className="flex" style={{ justifyContent: 'space-between', marginBottom: 4, color: 'var(--text-muted)' }}>
                      <span>GST ({form.gst_rate}%)</span><span>+ ₹{gstAmt.toFixed(2)}</span>
                    </div>
                    <div className="flex fw-bold" style={{ justifyContent: 'space-between', borderTop: '1px solid var(--border)', paddingTop: 4 }}>
                      <span>Final Sale Price</span><span>₹{total.toFixed(2)}</span>
                    </div>
                  </div>
                )
              })()}
            </div>

            {/* Custom Fields Section */}
            {customFieldDefs.length > 0 && (
              <div style={{ background: 'var(--primary-light)', borderRadius: 8, padding: '12px 16px', marginBottom: 16 }}>
                <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 13 }}>🧩 Custom Fields</div>
                <div className="form-row">
                  {customFieldDefs.map(f => (
                    <div className="form-group" key={f.id}>
                      <label>{f.label}</label>
                      <input
                        type={f.type === 'number' ? 'number' : 'text'}
                        value={form.customFields?.[f.id] ?? ''}
                        onChange={e => setCf(f.id, e.target.value)}
                        placeholder={f.label}
                        list={`cf-suggestions-${f.id}`}
                      />
                      <datalist id={`cf-suggestions-${f.id}`}>
                        {suggestionsFor(f.id, true).map(v => <option key={v} value={v} />)}
                      </datalist>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Barcode Section */}
            <div style={{ background: 'var(--primary-light)', borderRadius: 8, padding: '12px 16px', marginBottom: 16 }}>
              <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 13 }}>🔖 Barcode / QR Code</div>
              <div className="form-row">
                <div className="form-group">
                  <label>Barcode Value</label>
                  <div className="flex gap-2">
                    <input value={form.barcode} onChange={e => set('barcode', e.target.value)} placeholder="Auto-generated" style={{ flex: 1 }} />
                    <button type="button" className="btn btn-sm" onClick={() => set('barcode', genBarcode(form.barcode_type))}>🔄 New</button>
                  </div>
                </div>
                <div className="form-group">
                  <label>Barcode Type</label>
                  <select value={form.barcode_type} onChange={e => setBarcodeType(e.target.value)}>
                    <option value="CODE128">Code128 (Recommended)</option>
                    <option value="EAN13">EAN-13 (Retail, numeric 12-13 digit)</option>
                    <option value="QR">QR Code</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn" onClick={() => setModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving...' : 'Save Item'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Manage Custom Fields Modal */}
      {cfModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setCfModal(false)}>
          <div className="modal">
            <div className="modal-header">
              <span className="modal-title">⚙️ Manage Custom Fields</span>
              <button className="close-btn" onClick={() => setCfModal(false)}>×</button>
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
              Yahan ek baar field add karo (jaise Brand, Color, Size) — yeh field har item ke Add/Edit form mein aur table mein dikhega, aur search mein bhi included rahega.
            </p>
            {cfDraft.length === 0 && (
              <div className="text-muted" style={{ marginBottom: 16, fontSize: 13 }}>Abhi koi custom field nahi hai.</div>
            )}
            {cfDraft.map(f => (
              <div className="form-row" key={f.id} style={{ alignItems: 'end', gridTemplateColumns: '2fr 1fr auto' }}>
                <div className="form-group">
                  <label>Field Name</label>
                  <input value={f.label} onChange={e => updateCfRow(f.id, 'label', e.target.value)} placeholder="e.g. Brand" autoFocus />
                </div>
                <div className="form-group">
                  <label>Type</label>
                  <select value={f.type} onChange={e => updateCfRow(f.id, 'type', e.target.value)}>
                    <option value="text">Text</option>
                    <option value="number">Number</option>
                  </select>
                </div>
                <div className="form-group">
                  <button type="button" className="btn btn-sm btn-danger" onClick={() => removeCfRow(f.id)}>🗑️</button>
                </div>
              </div>
            ))}
            <button type="button" className="btn btn-sm" onClick={addCfRow}>+ Add Field</button>
            <div className="modal-footer">
              <button className="btn" onClick={() => setCfModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={saveCfDefs} disabled={cfSaving}>{cfSaving ? 'Saving...' : 'Save Fields'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Barcode View/Print Modal */}
      {barcodeModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setBarcodeModal(null)}>
          <div className="modal" style={{ maxWidth: 380, textAlign: 'center' }}>
            <div className="modal-header">
              <span className="modal-title">🔖 {barcodeModal.name}</span>
              <button className="close-btn" onClick={() => setBarcodeModal(null)}>×</button>
            </div>
            <div style={{ padding: '24px 16px' }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
                Type: {barcodeModal.barcode_type || 'CODE128'} &nbsp;|&nbsp; Code: <code>{barcodeModal.barcode || barcodeModal.id}</code>
              </div>
              <div style={{ display: 'flex', justifyContent: 'center', background: '#fff', padding: 16, borderRadius: 8, border: '1px solid var(--border)' }}>
                {barcodeError ? (
                  <div style={{ color: 'var(--danger)', fontSize: 13, padding: '12px 8px' }}>⚠️ {barcodeError}</div>
                ) : (barcodeModal.barcode_type || 'CODE128') === 'QR'
                  ? <canvas ref={qrCanvasRef} />
                  : <svg ref={barcodeSvgRef} />
                }
              </div>
              {barcodeError && (
                <button type="button" className="btn btn-sm" style={{ marginTop: 10 }} onClick={regenerateModalBarcode}>🔄 Regenerate Valid Barcode</button>
              )}
              <div style={{ marginTop: 12, fontWeight: 600 }}>₹{Number(barcodeModal.sale_price || 0).toLocaleString('en-IN')}</div>
            </div>
            <div className="modal-footer">
              <button className="btn" onClick={() => setBarcodeModal(null)}>Close</button>
              <button className="btn btn-primary" onClick={printBarcode} disabled={!!barcodeError}>🖨️ Print Label</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
