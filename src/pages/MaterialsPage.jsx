import { useEffect, useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Boxes, 
  Plus, 
  Search, 
  Edit3, 
  Trash2, 
  AlertTriangle, 
  CheckCircle2, 
  X, 
  Package, 
  Layers
} from 'lucide-react'
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

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    return materials.filter((m) => {
      const matchesSearch =
        !q ||
        m.name?.toLowerCase().includes(q) ||
        m.sku?.toLowerCase().includes(q) ||
        (m.model && m.model.toLowerCase().includes(q))
      const matchesLowStock =
        !filterLowStockOnly || Number(m.current_qty) <= Number(m.reorder_threshold ?? 0)
      return matchesSearch && matchesLowStock
    })
  }, [materials, search, filterLowStockOnly])

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      <Nav />

      <main className="w-full max-w-6xl mx-auto px-4 pt-5 pb-28 sm:py-8 flex-1">
        {/* Header and Add SKU Button */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2.5">
              <Boxes className="w-7 h-7 text-blue-600" />
              Materials Inventory
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">
              Manage product catalogs, QR barcodes, model variants & threshold alerts
            </p>
          </div>

          <button
            type="button"
            onClick={startAdd}
            className="inline-flex items-center justify-center gap-2 px-5 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm rounded-2xl shadow-md shadow-blue-600/25 active:scale-95 transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Add New SKU</span>
          </button>
        </div>

        {/* Search & Filter Bar */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search by Product Name, Model, or SKU..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-11 pr-4 py-3 bg-white border border-slate-300 rounded-2xl text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent shadow-sm"
            />
          </div>

          <button
            type="button"
            onClick={() => setFilterLowStockOnly(!filterLowStockOnly)}
            className={`px-4 py-3 rounded-2xl text-xs sm:text-sm font-bold border transition-all flex items-center justify-center gap-2 ${
              filterLowStockOnly
                ? 'bg-amber-500 text-white border-amber-500 shadow-md shadow-amber-500/20'
                : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
            }`}
          >
            <AlertTriangle className="w-4 h-4" />
            <span>Low Stock Alert</span>
          </button>
        </div>

        {/* Modal for Add / Edit */}
        <AnimatePresence>
          {isModalOpen && (
            <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 10 }}
                className="bg-white rounded-3xl p-6 sm:p-7 w-full max-w-lg shadow-2xl border border-slate-200"
              >
                <div className="flex items-start justify-between mb-5">
                  <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                    <Package className="w-5 h-5 text-blue-600" />
                    {editingId ? 'Edit Material SKU' : 'Register New Material'}
                  </h3>
                  <button
                    type="button"
                    onClick={closeModal}
                    className="p-1.5 rounded-xl text-slate-400 hover:bg-slate-100"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      SKU (QR Code identifier) *
                    </label>
                    <input
                      value={form.sku}
                      onChange={(e) => setForm({ ...form, sku: e.target.value })}
                      placeholder="e.g. ITEM-SHIRT-001"
                      required
                      disabled={!!editingId}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-mono focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600 disabled:opacity-60"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Material / Product Name *
                    </label>
                    <input
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      placeholder="e.g. Cotton Crew Neck T-Shirt"
                      required
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Model / Variant
                      </label>
                      <input
                        value={form.model}
                        onChange={(e) => setForm({ ...form, model: e.target.value })}
                        placeholder="e.g. Black / XL"
                        className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Unit</label>
                      <input
                        value={form.unit}
                        onChange={(e) => setForm({ ...form, unit: e.target.value })}
                        placeholder="pcs, kg, box"
                        className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Current Quantity
                      </label>
                      <input
                        type="number"
                        value={form.current_qty}
                        onChange={(e) => setForm({ ...form, current_qty: e.target.value })}
                        className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Reorder Threshold
                      </label>
                      <input
                        type="number"
                        value={form.reorder_threshold}
                        onChange={(e) => setForm({ ...form, reorder_threshold: e.target.value })}
                        className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                      />
                    </div>
                  </div>

                  {error && (
                    <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs font-medium">
                      {error}
                    </div>
                  )}

                  <div className="flex gap-2.5 pt-3">
                    <button
                      type="submit"
                      disabled={saving}
                      className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm rounded-xl shadow-md shadow-blue-600/30 transition-all disabled:opacity-50"
                    >
                      {saving ? 'Saving...' : editingId ? 'Update Material' : 'Create Material'}
                    </button>
                    <button
                      type="button"
                      onClick={closeModal}
                      className="px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-sm rounded-xl"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Materials Cards List */}
        {loading ? (
          <div className="py-16 text-center text-slate-400">
            <div className="w-8 h-8 border-3 border-slate-300 border-t-blue-600 rounded-full animate-spin mx-auto mb-2" />
            <p className="text-xs font-medium">Loading materials inventory...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-3xl border border-slate-200 p-8 shadow-sm">
            <Boxes className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="font-bold text-slate-800 text-base">No materials found</p>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              {search
                ? 'No items match your search criteria. Try a different keyword.'
                : 'Get started by clicking "Add New SKU" above.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((m) => {
              const qty = Number(m.current_qty) || 0
              const threshold = Number(m.reorder_threshold ?? 0)
              const isLow = qty <= threshold

              return (
                <motion.div
                  key={m.id}
                  layout
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="bg-white rounded-3xl p-5 border border-slate-200 shadow-sm hover:shadow-md transition-all flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <h4 className="font-bold text-slate-900 text-base leading-tight truncate flex-1">
                        {m.name}
                      </h4>
                      <span
                        className={`px-2.5 py-1 rounded-full text-xs font-bold shrink-0 ${
                          isLow
                            ? 'bg-amber-50 text-amber-800 border border-amber-200'
                            : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                        }`}
                      >
                        {isLow ? '⚠️ Low' : '✓ In Stock'}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500 mb-4">
                      <span className="font-mono bg-slate-100 px-2 py-0.5 rounded border border-slate-200 text-slate-700">
                        {m.sku}
                      </span>
                      {m.model && (
                        <span className="bg-slate-100 px-2 py-0.5 rounded text-slate-600">
                          {m.model}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-100">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <div className="text-[10px] uppercase font-bold text-slate-400">Current Qty</div>
                        <div className="text-xl font-black text-slate-900">
                          {qty.toLocaleString()}{' '}
                          <span className="text-xs font-semibold text-slate-500">{m.unit || 'pcs'}</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-[10px] uppercase font-bold text-slate-400">Min Alert</div>
                        <div className="text-xs font-bold text-slate-600">
                          ≤ {threshold} {m.unit || 'pcs'}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => startEdit(m)}
                        className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-1.5"
                      >
                        <Edit3 className="w-3.5 h-3.5" /> Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(m.id, m.name)}
                        className="p-2 text-rose-600 hover:bg-rose-50 rounded-xl transition-all"
                        title="Delete Material"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </motion.div>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}
