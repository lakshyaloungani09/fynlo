import { useEffect, useState } from 'react'
import { addDocument, getDocuments, updateDocument, deleteDocument } from '../firebase'

const EMPTY = { name: '', unit: 'Nos', purchase_price: '', sale_price: '', stock: '', low_stock_alert: 10, hsn_code: '', gst_rate: 18 }
const UNITS = ['Nos', 'Kg', 'Gram', 'Litre', 'ML', 'Meter', 'Box', 'Dozen', 'Piece', 'Set']
const fmt = n => '₹' + Number(n || 0).toLocaleString('en-IN')

export default function Items() {
  const [items, setItems] = useState([])
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)

  const load = async () => {
    const snap = await getDocuments('items')
    setItems(snap.docs.map(d => ({ id: d.id, ...d.data() })))
  }

  useEffect(() => { load() }, [])

  const filtered = items.filter(i => i.name.toLowerCase().includes(search.toLowerCase()))

  const openNew = () => { setForm(EMPTY); setModal(true) }
  const openEdit = (item) => { setForm({ ...item }); setModal(true) }

  const save = async () => {
    if (!form.name.trim()) return alert('Item name required')
    setSaving(true)
    const data = { ...form, purchase_price: +form.purchase_price, sale_price: +form.sale_price, stock: +form.stock, low_stock_alert: +form.low_stock_alert, gst_rate: +form.gst_rate }
    if (form.id) {
      const { id, ...rest } = data
      await updateDocument('items', id, rest)
    } else {
      await addDocument('items', data)
    }
    setSaving(false)
    setModal(false)
    load()
  }

  const del = async (id) => {
    if (!confirm('Delete this item?')) return
    await deleteDocument('items', id)
    load()
  }

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

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
            <tr><th>Name</th><th>Unit</th><th>Purchase Price</th><th>Sale Price</th><th>Stock</th><th>GST %</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={7}><div className="empty-state"><div className="empty-icon">📦</div><div>No items yet.</div></div></td></tr>
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
                  <div className="flex gap-2">
                    <button className="btn btn-sm" onClick={() => openEdit(item)}>Edit</button>
                    <button className="btn btn-sm btn-danger" onClick={() => del(item.id)}>Delete</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

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
            <div className="modal-footer">
              <button className="btn" onClick={() => setModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving...' : 'Save Item'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}