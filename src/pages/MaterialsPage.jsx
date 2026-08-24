import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import Nav from '../components/Nav'

const emptyForm = { sku: '', name: '', model: '', unit: 'pcs', current_qty: 0, reorder_threshold: 5 }

export default function MaterialsPage() {
  const [materials, setMaterials] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState(emptyForm)
  const [editingId, setEditingId] = useState(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [filterLowStockOnly, setFilterLowStockOnly] = useState(false)

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)
    const { data, error } = await supabase.from('materials').select('*').order('name')
    if (!error) setMaterials(data || [])
    setLoading(false)
  }

  function startEdit(material) {
    setEditingId(material.id)
    setForm({
      sku: material.sku,
      name: material.name,
      model: material.model || '',
      unit: material.unit || 'pcs',
      current_qty: material.current_qty,
      reorder_threshold: material.reorder_threshold ?? 0,
    })
    setIsModalOpen(true)
  }

  function startAdd() {
    setEditingId(null)
    setForm(emptyForm)
    setError(null)
    setIsModalOpen(true)
  }

  function closeModal() {
    setIsModalOpen(false)
    setEditingId(null)
    setForm(emptyForm)
    setError(null)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setSaving(true)

    const payload = {
      sku: form.sku.trim(),
      name: form.name.trim(),
      model: form.model.trim() || null,
      unit: form.unit.trim() || 'pcs',
      current_qty: Number(form.current_qty) || 0,
      reorder_threshold: Number(form.reorder_threshold) || 0,
    }

    const result = editingId
      ? await supabase.from('materials').update(payload).eq('id', editingId)
      : await supabase.from('materials').insert(payload)

    setSaving(false)

    if (result.error) {
      setError(result.error.message)
      return
    }

    closeModal()
    load()
  }

  async function handleDelete(id, name) {
    if (!confirm(`Are you sure you want to delete "${name}"? This cannot be undone.`)) return
    const { error } = await supabase.from('materials').delete().eq('id', id)
    if (error) alert(`Could not delete: ${error.message}`)
    else load()
  }

  const filtered = materials.filter((m) => {
    const matchesSearch =
      m.name.toLowerCase().includes(search.toLowerCase()) ||
      m.sku.toLowerCase().includes(search.toLowerCase()) ||
      (m.model && m.model.toLowerCase().includes(search.toLowerCase()))
    const matchesLowStock = !filterLowStockOnly || Number(m.current_qty) <= Number(m.reorder_threshold ?? 0)
    return matchesSearch && matchesLowStock
  })

  return (
    <div className="app-layout">
      <Nav />
      <main className="page-container">
        {/* Header & Add Button */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <h1>Materials Inventory</h1>
            <p>Manage all registered material SKUs and stock thresholds</p>
          </div>
          <button type="button" className="btn-primary" onClick={startAdd}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            <span>Add SKU</span>
          </button>
        </div>

        {/* Search and Filters */}
        <div className="search-filter-bar">
          <div className="search-input-wrapper">
            <svg className="search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              placeholder="Search by name, SKU, or model..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <button
            type="button"
            className={filterLowStockOnly ? 'btn-primary' : 'btn-outline'}
            onClick={() => setFilterLowStockOnly(!filterLowStockOnly)}
            title="Filter low stock items"
            style={{ whiteSpace: 'nowrap' }}
          >
            ⚠️ Low Stock
          </button>
        </div>

        {/* Modal / Slide-over Dialog for Add / Edit */}
        {isModalOpen && (
          <div className="modal-backdrop">
            <div className="modal-content">
              <div className="modal-header">
                <h2>{editingId ? 'Edit Material' : 'Add New Material'}</h2>
                <button type="button" className="btn-ghost btn-icon" onClick={closeModal}>✕</button>
              </div>

              <form onSubmit={handleSubmit}>
                <div className="form-group">
                  <label>SKU (QR Code identifier)</label>
                  <input
                    value={form.sku}
                    onChange={(e) => setForm({ ...form, sku: e.target.value })}
                    placeholder="e.g. ITEM-SHIRT-001"
                    required
                    disabled={!!editingId}
                  />
                </div>

                <div className="form-group">
                  <label>Material Name</label>
                  <input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="e.g. Cotton Crew Neck T-Shirt"
                    required
                  />
                </div>

                <div className="form-grid-2">
                  <div className="form-group">
                    <label>Model / Variant</label>
                    <input
                      value={form.model}
                      onChange={(e) => setForm({ ...form, model: e.target.value })}
                      placeholder="e.g. Black / XL"
                    />
                  </div>
                  <div className="form-group">
                    <label>Unit</label>
                    <input
                      value={form.unit}
                      onChange={(e) => setForm({ ...form, unit: e.target.value })}
                      placeholder="pcs, kg, box"
                    />
                  </div>
                </div>

                <div className="form-grid-2">
                  <div className="form-group">
                    <label>Initial / Current Qty</label>
                    <input
                      type="number"
                      value={form.current_qty}
                      onChange={(e) => setForm({ ...form, current_qty: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label>Reorder Alert Threshold</label>
                    <input
                      type="number"
                      value={form.reorder_threshold}
                      onChange={(e) => setForm({ ...form, reorder_threshold: e.target.value })}
                    />
                  </div>
                </div>

                {error && (
                  <div className="toast-banner toast-error" style={{ margin: '12px 0' }}>
                    {error}
                  </div>
                )}

                <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
                  <button type="submit" className="btn-primary" style={{ flex: 1 }} disabled={saving}>
                    {saving ? 'Saving...' : editingId ? 'Update Material' : 'Create Material'}
                  </button>
                  <button type="button" className="btn-outline" onClick={closeModal}>
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Materials List */}
        <div className="section-header">
          <h2>Registered Items ({filtered.length})</h2>
        </div>

        {loading ? (
          <p style={{ color: 'var(--text-muted)' }}>Loading materials...</p>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 16px', background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)' }}>
            <p style={{ fontWeight: 600, color: 'var(--text-main)' }}>No materials found</p>
            <p style={{ fontSize: '0.85rem' }}>{search ? 'Try adjusting your search query.' : 'Click "Add SKU" to register your first item.'}</p>
          </div>
        ) : (
          <div className="material-cards-list">
            {filtered.map((m) => {
              const isLow = Number(m.current_qty) <= Number(m.reorder_threshold ?? 0)
              return (
                <div key={m.id} className="material-item-card">
                  <div className="material-item-header">
                    <div>
                      <div className="material-title">{m.name}</div>
                      <div className="material-meta-row" style={{ marginTop: 4 }}>
                        <span className="queue-card-sku">SKU: {m.sku}</span>
                        {m.model && <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>• {m.model}</span>}
                      </div>
                    </div>

                    <span className={`stock-pill ${isLow ? 'low' : 'healthy'}`}>
                      {isLow ? '⚠️ ' : '✓ '}
                      <strong>{m.current_qty}</strong> {m.unit || 'pcs'}
                    </span>
                  </div>

                  <div className="material-actions-row">
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginRight: 'auto', alignSelf: 'center' }}>
                      Reorder when ≤ {m.reorder_threshold} {m.unit || 'pcs'}
                    </span>
                    <button type="button" className="btn-outline" style={{ padding: '6px 12px', fontSize: '0.825rem' }} onClick={() => startEdit(m)}>
                      Edit
                    </button>
                    <button type="button" className="btn-danger" style={{ padding: '6px 12px', fontSize: '0.825rem' }} onClick={() => handleDelete(m.id, m.name)}>
                      Delete
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}
