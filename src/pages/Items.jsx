import { useAuth } from '../AuthContext'
import { useEffect, useRef, useState } from 'react'
import { addDocument, getDocuments, updateDocument, deleteDocument } from '../firebase'
import JsBarcode from 'jsbarcode'
import QRCode from 'qrcode'

const EMPTY = { name: '', unit: 'Nos', purchase_price: '', sale_price: '', stock: '', low_stock_alert: 10, hsn_code: '', gst_rate: 18, barcode: '', barcode_type: 'CODE128' }
const UNITS = ['Nos', 'Kg', 'Gram', 'Litre', 'ML', 'Meter', 'Box', 'Dozen', 'Piece', 'Set']
const fmt = n => '₹' + Number(n || 0).toLocaleString('en-IN')
const genBarcode = () => 'FYN' + Date.now().toString().slice(-9)

export default function Items() {
  const user = useAuth()
  const uid = user?.uid
  const [items, setItems] = useState([])
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [barcodeModal, setBarcodeModal] = useState(null) // item to show barcode for
  const barcodeSvgRef = useRef(null)
  const qrCanvasRef = useRef(null)

  const load = async () => {
    const snap = await getDocuments(uid, 'items')
    setItems(snap.docs.map(d => ({ id: d.id, ...d.data() })))
  }

  useEffect(() => { load() }, [])

  // Render barcode/QR when modal opens
  useEffect(() => {
    if (!barcodeModal) return
    const code = barcodeModal.barcode || barcodeModal.id
    const type = barcodeModal.barcode_type || 'CODE128'
    setTimeout(() => {
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
    }, 50)
  }, [barcodeModal])

  const filtered = items.filter(i => i.name.toLowerCase().includes(search.toLowerCase()))

  const openNew = () => { setForm({ ...EMPTY, barcode: genBarcode() }); setModal(true) }
  const openEdit = (item) => { setForm({ ...item }); setModal(true) }

  const save = async () => {
    if (!form.name.trim()) return alert('Item name required')
    setSaving(true)
    const data = {
      ...form,
      purchase_price: +form.purchase_price,
      sale_price: +form.sale_price,
      stock: +form.stock,
      low_stock_alert: +form.low_stock_alert,
      gst_rate: +form.gst_rate,
      barcode: form.barcode || genBarcode()
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
        <button className="btn btn-primary" onClick={openNew}>+ Add Item</button>
      </div>

      <div className="search-bar">
        <input className="search-input" placeholder="Search items..." value={search} onChange={e => setSearch(e.target.value)} />
        <span className="text-muted">{filtered.length} items</span>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Name</th><th>Unit</th><th>Purchase Price</th><th>Sale Price</th><th>Stock</th><th>GST %</th><th>Barcode</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={8}><div className="empty-state"><div className="empty-icon">📦</div><div>No items yet.</div></div></td></tr>
            ) : filtered.map(item => (
              <tr key={item.id}>
                <td className="fw-bold">{item.name}</td>
                <td>{item.unit}</td>
                <td>{fmt(item.purchase_price)}</td>
                <td>{fmt(item.sale_price)}</td>
                <td>
                  <span className={`badge ${item.stock <= item.low_stock_alert ? 'badge-red' : 'badge-green'}`}>
                    {item.stock} {item.unit}
                  </span>
                </td>
                <td>{item.gst_rate}%</td>
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
                <label>Purchase Price (₹)</label>
                <input type="number" value={form.purchase_price} onChange={e => set('purchase_price', e.target.value)} placeholder="0" />
              </div>
              <div className="form-group">
                <label>Sale Price (₹)</label>
                <input type="number" value={form.sale_price} onChange={e => set('sale_price', e.target.value)} placeholder="0" />
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
            <div className="form-row">
              <div className="form-group">
                <label>HSN Code</label>
                <input value={form.hsn_code} onChange={e => set('hsn_code', e.target.value)} placeholder="e.g. 1006" />
              </div>
              <div className="form-group">
                <label>GST Rate (%)</label>
                <select value={form.gst_rate} onChange={e => set('gst_rate', e.target.value)}>
                  {[0, 5, 12, 18, 28].map(r => <option key={r} value={r}>{r}%</option>)}
                </select>
              </div>
            </div>
            {/* Barcode Section */}
            <div style={{ background: 'var(--primary-light)', borderRadius: 8, padding: '12px 16px', marginBottom: 16 }}>
              <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 13 }}>🔖 Barcode / QR Code</div>
              <div className="form-row">
                <div className="form-group">
                  <label>Barcode Value</label>
                  <div className="flex gap-2">
                    <input value={form.barcode} onChange={e => set('barcode', e.target.value)} placeholder="Auto-generated" style={{ flex: 1 }} />
                    <button type="button" className="btn btn-sm" onClick={() => set('barcode', genBarcode())}>🔄 New</button>
                  </div>
                </div>
                <div className="form-group">
                  <label>Barcode Type</label>
                  <select value={form.barcode_type} onChange={e => set('barcode_type', e.target.value)}>
                    <option value="CODE128">Code128 (Recommended)</option>
                    <option value="EAN13">EAN-13 (Retail)</option>
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
                {(barcodeModal.barcode_type || 'CODE128') === 'QR'
                  ? <canvas ref={qrCanvasRef} />
                  : <svg ref={barcodeSvgRef} />
                }
              </div>
              <div style={{ marginTop: 12, fontWeight: 600 }}>₹{Number(barcodeModal.sale_price || 0).toLocaleString('en-IN')}</div>
            </div>
            <div className="modal-footer">
              <button className="btn" onClick={() => setBarcodeModal(null)}>Close</button>
              <button className="btn btn-primary" onClick={printBarcode}>🖨️ Print Label</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
