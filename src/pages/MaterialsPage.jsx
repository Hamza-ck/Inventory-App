import { useEffect, useState, useMemo, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import * as XLSX from 'xlsx'
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
  FileSpreadsheet, 
  Download, 
  Upload, 
  DollarSign,
  TrendingUp,
  History,
  Layers,
  Check
} from 'lucide-react'
import { accDb } from '../lib/accountingDb'
import { useAuth } from '../context/AuthContext'
import Nav from '../components/Nav'

const emptyForm = {
  sku: '',
  name: '',
  category: 'Raw Materials',
  unit: 'pcs',
  purchase_rate: 100,
  sales_rate: 140,
  current_qty: 0,
  reorder_threshold: 10,
}

export default function MaterialsPage() {
  const { isAdmin, isOwner } = useAuth()
  const [materials, setMaterials] = useState([])
  const [vouchers, setVouchers] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState(emptyForm)
  const [editingId, setEditingId] = useState(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [filterLowStockOnly, setFilterLowStockOnly] = useState(false)

  // Material Movements Modal
  const [movementMaterial, setMovementMaterial] = useState(null)
  const [isMovementModalOpen, setIsMovementModalOpen] = useState(false)

  const fileInputRef = useRef(null)

  useEffect(() => {
    load()
    function handleUpdate() { load() }
    window.addEventListener('accounting-data-updated', handleUpdate)
    return () => window.removeEventListener('accounting-data-updated', handleUpdate)
  }, [])

  async function load() {
    setLoading(true)
    const list = await accDb.materials.toArray()
    const vchs = await accDb.vouchers.toArray()
    setMaterials(list)
    setVouchers(vchs)
    setLoading(false)
  }

  // Categories list
  const categories = useMemo(() => {
    const set = new Set(materials.map((m) => m.category || 'General').filter(Boolean))
    return ['all', ...Array.from(set)]
  }, [materials])

  // Filtered materials
  const filtered = useMemo(() => {
    return materials.filter((m) => {
      const q = search.toLowerCase().trim()
      const matchesSearch = !q || m.name.toLowerCase().includes(q) || m.sku.toLowerCase().includes(q)
      const matchesCategory = categoryFilter === 'all' || (m.category || 'General') === categoryFilter
      const matchesLowStock = !filterLowStockOnly || (Number(m.current_qty) <= Number(m.reorder_threshold))
      return matchesSearch && matchesCategory && matchesLowStock
    })
  }, [materials, search, categoryFilter, filterLowStockOnly])

  // Inventory Totals
  const totalStockItems = materials.length
  const totalValuation = materials.reduce((acc, m) => acc + (Number(m.current_qty) || 0) * (Number(m.purchase_rate) || 0), 0)
  const lowStockCount = materials.filter((m) => Number(m.current_qty) <= Number(m.reorder_threshold)).length

  function startAdd() {
    setEditingId(null)
    setForm({
      ...emptyForm,
      sku: `MAT-${Date.now().toString().slice(-4)}`,
    })
    setError(null)
    setIsModalOpen(true)
  }

  function startEdit(material) {
    setEditingId(material.id)
    setForm({
      sku: material.sku,
      name: material.name,
      category: material.category || 'General',
      unit: material.unit || 'pcs',
      purchase_rate: material.purchase_rate || 0,
      sales_rate: material.sales_rate || 0,
      current_qty: material.current_qty || 0,
      reorder_threshold: material.reorder_threshold || 10,
    })
    setError(null)
    setIsModalOpen(true)
  }

  async function handleSave(e) {
    e.preventDefault()
    if (isOwner) return
    if (!form.sku.trim() || !form.name.trim()) {
      setError('SKU and Material Name are required')
      return
    }

    setSaving(true)
    setError(null)

    try {
      if (editingId) {
        await accDb.materials.update(editingId, {
          ...form,
          purchase_rate: Number(form.purchase_rate) || 0,
          sales_rate: Number(form.sales_rate) || 0,
          current_qty: Number(form.current_qty) || 0,
          reorder_threshold: Number(form.reorder_threshold) || 0,
        })
      } else {
        await accDb.materials.add({
          ...form,
          purchase_rate: Number(form.purchase_rate) || 0,
          sales_rate: Number(form.sales_rate) || 0,
          current_qty: Number(form.current_qty) || 0,
          reorder_threshold: Number(form.reorder_threshold) || 0,
          created_at: new Date().toISOString(),
        })
      }

      setSaving(false)
      setIsModalOpen(false)
      load()
    } catch (err) {
      setError(err.message || 'Failed to save material')
      setSaving(false)
    }
  }

  async function handleDelete(id) {
    if (!isAdmin) return
    if (!confirm('Are you sure you want to delete this material?')) return
    await accDb.materials.delete(id)
    load()
  }

  // Export to Excel
  function exportMaterialsExcel() {
    const rows = materials.map((m) => ({
      'SKU / Item Code': m.sku,
      'Material Name': m.name,
      Category: m.category || 'General',
      Unit: m.unit || 'pcs',
      'Cost Rate (₹)': Number(m.purchase_rate || 0),
      'Sales Rate (₹)': Number(m.sales_rate || 0),
      'Current Stock': Number(m.current_qty || 0),
      'Reorder Level': Number(m.reorder_threshold || 0),
      'Stock Valuation (₹)': Number(m.current_qty || 0) * Number(m.purchase_rate || 0),
    }))

    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Materials_Inventory')
    XLSX.writeFile(wb, `Materials_Stock_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  // Import from Excel
  async function handleExcelUpload(e) {
    if (isOwner) return
    const file = e.target.files?.[0]
    if (!file) return

    try {
      const buffer = await file.arrayBuffer()
      const wb = XLSX.read(buffer, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json(ws, { defval: '' })

      let added = 0
      for (const r of rows) {
        const name = r['Material Name'] || r['Item Name'] || r['Name']
        const sku = r['SKU / Item Code'] || r['SKU'] || r['Item Code'] || `MAT-${Date.now().toString().slice(-4)}`
        if (name) {
          await accDb.materials.add({
            sku: String(sku).trim(),
            name: String(name).trim(),
            category: r['Category'] || 'General',
            unit: r['Unit'] || 'pcs',
            purchase_rate: parseFloat(r['Cost Rate (₹)'] || r['Purchase Rate'] || 100) || 100,
            sales_rate: parseFloat(r['Sales Rate (₹)'] || r['Sales Rate'] || 140) || 140,
            current_qty: parseFloat(r['Current Stock'] || r['Qty'] || 0) || 0,
            reorder_threshold: parseFloat(r['Reorder Level'] || 10) || 10,
          })
          added++
        }
      }

      alert(`Successfully imported ${added} materials!`)
      load()
    } catch (err) {
      alert('Failed to import Excel: ' + err.message)
    }
  }

  // Material Movement History from vouchers
  const materialMovements = useMemo(() => {
    if (!movementMaterial) return []
    const moves = []
    vouchers.forEach((v) => {
      if (Array.isArray(v.items) && v.items.length > 0) {
        v.items.forEach((it) => {
          if (it.sku === movementMaterial.sku || it.name === movementMaterial.name || it.material_id === movementMaterial.id) {
            moves.push({
              voucher_no: v.voucher_no,
              voucher_type: v.voucher_type,
              date: v.date,
              party_name: v.party_name,
              qty: it.qty,
              rate: it.rate,
              amount: it.amount || it.qty * it.rate,
            })
          }
        })
      }
    })
    return moves.sort((a, b) => new Date(b.date) - new Date(a.date))
  }, [movementMaterial, vouchers])

  return (
    <div className="min-h-screen bg-[#f4f7f4] text-[#172f2c] font-sans pb-28 lg:pb-0">
      <Nav />

      <main className="min-h-screen bg-[#f4f7f4] px-4 pb-28 pt-5 text-[#172f2c] sm:px-6 lg:ml-64 lg:w-[calc(100%-16rem)] lg:px-9 lg:pb-8 lg:pt-8 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-2">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl sm:text-3xl font-black text-[#172f2c] tracking-tight flex items-center gap-2.5">
                <Boxes className="w-7 h-7 text-[#7662a8]" />
                <span>Materials Stock & Valuation</span>
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-purple-500/20 text-[#7662a8] border border-purple-500/30">
                Pure Material-Wise (No Models)
              </span>
            </div>
            <p className="text-xs sm:text-sm text-[#71827a] mt-1">
              Material-wise stock levels, cost valuation, reorder alerts, and movement tracking.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={exportMaterialsExcel}
              className="px-3.5 py-2 bg-white hover:bg-[#edf5f0] text-[#435b52] border border-[#e1e8e3] rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5"
            >
              <Download className="w-4 h-4 text-[#0e7a70]" />
              <span>Export Stock</span>
            </button>

            {isAdmin && (
              <>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleExcelUpload}
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3.5 py-2 bg-white hover:bg-[#edf5f0] text-[#435b52] border border-[#e1e8e3] rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5"
                >
                  <Upload className="w-4 h-4 text-[#0e7a70]" />
                  <span>Import Excel</span>
                </button>

                <button
                  type="button"
                  onClick={startAdd}
                  className="px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-xl text-xs font-bold shadow-lg shadow-purple-600/30 flex items-center gap-1.5 transition-all active:scale-95"
                >
                  <Plus className="w-4 h-4" />
                  <span>+ Add Material</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* 3 Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white p-4 rounded-2xl border border-[#e1e8e3] shadow-md">
            <span className="text-xs font-bold text-[#71827a] uppercase tracking-wider block mb-1">Total Stock Items</span>
            <div className="text-2xl font-black text-[#172f2c]">{totalStockItems}</div>
            <div className="text-[11px] text-[#71827a] mt-1">Material SKU catalog count</div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-[#e1e8e3] shadow-md">
            <span className="text-xs font-bold text-[#7662a8] uppercase tracking-wider block mb-1">Total Stock Valuation</span>
            <div className="text-2xl font-black text-[#7662a8]">₹{totalValuation.toLocaleString()}</div>
            <div className="text-[11px] text-[#71827a] mt-1">Based on purchase cost rate</div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-[#e1e8e3] shadow-md">
            <span className="text-xs font-bold text-[#a6651e] uppercase tracking-wider block mb-1">Low Stock Warnings</span>
            <div className="text-2xl font-black text-[#a6651e]">{lowStockCount} Items</div>
            <div className="text-[11px] text-[#71827a] mt-1">Items at or below reorder threshold</div>
          </div>
        </div>

        {/* Filter Toolbar */}
        <div className="bg-white p-3.5 rounded-2xl border border-[#e1e8e3] flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5 flex-1 max-w-xl">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#71827a]" />
              <input
                type="text"
                placeholder="Search material SKU, name..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 bg-[#f4f7f4] border border-[#e1e8e3] rounded-xl text-xs font-medium text-[#172f2c] placeholder:text-[#8a9991] focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>

            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="px-3 py-1.5 bg-[#f4f7f4] border border-[#e1e8e3] rounded-xl text-xs font-semibold text-[#172f2c] focus:outline-none focus:ring-2 focus:ring-purple-500"
            >
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c === 'all' ? 'All Categories' : c}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => setFilterLowStockOnly(!filterLowStockOnly)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors ${
                filterLowStockOnly
                  ? 'bg-[#fff5e8] text-[#9c611c] border-amber-500/40'
                  : 'bg-[#f4f7f4] text-[#71827a] border-[#e1e8e3] hover:text-white'
              }`}
            >
              Low Stock Only
            </button>
          </div>

          <span className="text-xs text-[#71827a] font-semibold">
            Showing {filtered.length} Materials
          </span>
        </div>

        {/* Materials Table */}
        <div className="bg-white rounded-2xl border border-[#e1e8e3] shadow-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#f8fbf9] text-[#71827a] font-bold uppercase text-[10px] border-b border-[#e1e8e3]">
                <tr>
                  <th className="py-3 px-3">Item Code / SKU</th>
                  <th className="py-3 px-3">Material Name</th>
                  <th className="py-3 px-3">Category</th>
                  <th className="py-3 px-3 text-right">Cost Rate (₹)</th>
                  <th className="py-3 px-3 text-right">Selling Rate (₹)</th>
                  <th className="py-3 px-3 text-right">Current Stock</th>
                  <th className="py-3 px-3 text-right">Stock Valuation (₹)</th>
                  <th className="py-3 px-3 text-center">Status</th>
                  <th className="py-3 px-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e8eee9] font-medium">
                {filtered.length > 0 ? (
                  filtered.map((mat) => {
                    const isLow = Number(mat.current_qty) <= Number(mat.reorder_threshold)
                    const valuation = Number(mat.current_qty || 0) * Number(mat.purchase_rate || 0)
                    return (
                      <tr key={mat.id} className="hover:bg-[#f3f8f5] transition-colors">
                        <td className="py-3 px-3 font-mono font-bold text-[#172f2c] whitespace-nowrap">{mat.sku}</td>
                        <td className="py-3 px-3 font-bold text-[#172f2c]">
                          <div>{mat.name}</div>
                        </td>
                        <td className="py-3 px-3 text-[#71827a]">{mat.category || 'General'}</td>
                        <td className="py-3 px-3 text-right text-[#52685e] font-mono">₹{Number(mat.purchase_rate || 0).toLocaleString()}</td>
                        <td className="py-3 px-3 text-right text-[#0e7a70] font-mono font-bold">₹{Number(mat.sales_rate || 0).toLocaleString()}</td>
                        <td className="py-3 px-3 text-right font-black text-[#172f2c] whitespace-nowrap">
                          {mat.current_qty} <span className="text-[10px] text-[#71827a] font-normal">{mat.unit || 'pcs'}</span>
                        </td>
                        <td className="py-3 px-3 text-right font-black text-[#7662a8] whitespace-nowrap">
                          ₹{valuation.toLocaleString()}
                        </td>
                        <td className="py-3 px-3 text-center whitespace-nowrap">
                          {isLow ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#fff5e8] text-[#9c611c] text-[10px] font-bold border border-[#ead6b7]">
                              <AlertTriangle className="w-3 h-3 text-[#a6651e]" />
                              <span>Reorder</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#e6f4ee] text-[#0e7a70] text-[10px] font-bold border border-[#c6e5d9]">
                              <CheckCircle2 className="w-3 h-3 text-[#0e7a70]" />
                              <span>Optimal</span>
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-center whitespace-nowrap">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => { setMovementMaterial(mat); setIsMovementModalOpen(true) }}
                              className="p-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-[#52685e] hover:text-[#172f2c] transition-colors"
                              title="Stock Inward/Outward Movements"
                            >
                              <History className="w-3.5 h-3.5 text-[#0e7a70]" />
                            </button>
                            {isAdmin && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => startEdit(mat)}
                                  className="p-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-[#52685e] hover:text-[#172f2c] transition-colors"
                                  title="Edit Material"
                                >
                                  <Edit3 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDelete(mat.id)}
                                  className="p-1.5 rounded-lg bg-rose-600/20 hover:bg-rose-600 text-[#ad5545] hover:text-white transition-colors"
                                  title="Delete Material"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })
                ) : (
                  <tr>
                    <td colSpan={9} className="py-8 text-center text-[#8a9991]">
                      No materials found matching filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* Add / Edit Material Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-xs">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-lg bg-[#f4f7f4] rounded-2xl p-6 border border-[#e1e8e3] shadow-2xl text-[#172f2c] font-sans"
          >
            <div className="flex items-center justify-between pb-3 border-b border-[#e1e8e3]">
              <h2 className="text-base font-bold text-[#172f2c]">
                {editingId ? 'Modify Material' : 'Add New Material Stock Item'}
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="text-[#71827a] hover:text-[#172f2c]">
                <X className="w-5 h-5" />
              </button>
            </div>

            {error && (
              <div className="mt-3 p-3 bg-[#fff0eb] border border-[#f0d1c7] text-[#a94a3f] rounded-xl text-xs font-semibold">
                {error}
              </div>
            )}

            <form onSubmit={handleSave} className="space-y-3.5 pt-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-[#52685e] mb-1">SKU / Item Code *</label>
                  <input
                    type="text"
                    required
                    value={form.sku}
                    onChange={(e) => setForm({ ...form, sku: e.target.value })}
                    placeholder="e.g. MAT-CANVAS-01"
                    className="w-full px-3 py-2 bg-white border border-[#e1e8e3] rounded-xl text-xs font-mono text-[#172f2c] focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#52685e] mb-1">Category / Group</label>
                  <input
                    type="text"
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                    placeholder="e.g. Textiles"
                    className="w-full px-3 py-2 bg-white border border-[#e1e8e3] rounded-xl text-xs text-[#172f2c] focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#52685e] mb-1">Material Name *</label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Industrial Cotton Canvas 350 GSM"
                  className="w-full px-3 py-2 bg-white border border-[#e1e8e3] rounded-xl text-xs text-[#172f2c] focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-[#52685e] mb-1">Unit of Measure</label>
                  <input
                    type="text"
                    value={form.unit}
                    onChange={(e) => setForm({ ...form, unit: e.target.value })}
                    placeholder="meter, kg, pcs, box"
                    className="w-full px-3 py-2 bg-white border border-[#e1e8e3] rounded-xl text-xs text-[#172f2c]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#52685e] mb-1">Cost Rate (₹)</label>
                  <input
                    type="number"
                    step="any"
                    value={form.purchase_rate}
                    onChange={(e) => setForm({ ...form, purchase_rate: e.target.value })}
                    className="w-full px-3 py-2 bg-white border border-[#e1e8e3] rounded-xl text-xs text-[#172f2c] text-right"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#52685e] mb-1">Sales Rate (₹)</label>
                  <input
                    type="number"
                    step="any"
                    value={form.sales_rate}
                    onChange={(e) => setForm({ ...form, sales_rate: e.target.value })}
                    className="w-full px-3 py-2 bg-white border border-[#e1e8e3] rounded-xl text-xs text-[#172f2c] text-right"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-[#52685e] mb-1">Current Stock Quantity</label>
                  <input
                    type="number"
                    step="any"
                    value={form.current_qty}
                    onChange={(e) => setForm({ ...form, current_qty: e.target.value })}
                    className="w-full px-3 py-2 bg-white border border-[#e1e8e3] rounded-xl text-xs text-[#172f2c] text-right"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#52685e] mb-1">Reorder Threshold</label>
                  <input
                    type="number"
                    step="any"
                    value={form.reorder_threshold}
                    onChange={(e) => setForm({ ...form, reorder_threshold: e.target.value })}
                    className="w-full px-3 py-2 bg-white border border-[#e1e8e3] rounded-xl text-xs text-[#172f2c] text-right"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-[#e1e8e3] flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs text-[#71827a] hover:text-[#172f2c]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-[#172f2c] text-xs font-bold shadow-md shadow-purple-600/30"
                >
                  {saving ? 'Saving...' : 'Save Material'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* Material Inward/Outward Movements Modal */}
      {isMovementModalOpen && movementMaterial && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-2xl bg-[#f4f7f4] rounded-2xl p-6 border border-[#e1e8e3] shadow-2xl text-[#172f2c] font-sans max-h-[85vh] flex flex-col"
          >
            <div className="flex items-center justify-between pb-3 border-b border-[#e1e8e3] shrink-0">
              <div>
                <span className="text-[10px] font-mono text-[#7662a8] font-bold uppercase">Stock Register</span>
                <h2 className="text-base font-bold text-[#172f2c] mt-0.5">
                  {movementMaterial.name} ({movementMaterial.sku})
                </h2>
              </div>
              <button onClick={() => setIsMovementModalOpen(false)} className="text-[#71827a] hover:text-[#172f2c]">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="py-4 overflow-y-auto flex-1">
              <table className="w-full text-left text-xs">
                <thead className="bg-white text-[#71827a] uppercase text-[10px] font-bold">
                  <tr>
                    <th className="py-2.5 px-3">Date</th>
                    <th className="py-2.5 px-3">Vch No.</th>
                    <th className="py-2.5 px-3">Type</th>
                    <th className="py-2.5 px-3">Party</th>
                    <th className="py-2.5 px-3 text-right">Inward / Outward Qty</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 font-medium">
                  {materialMovements.length > 0 ? (
                    materialMovements.map((m, i) => (
                      <tr key={i} className="hover:bg-[#f3f8f5]">
                        <td className="py-2.5 px-3 text-[#52685e] font-mono">{m.date}</td>
                        <td className="py-2.5 px-3 font-mono font-bold text-[#172f2c]">{m.voucher_no}</td>
                        <td className="py-2.5 px-3 uppercase text-[10px] font-bold">
                          <span className={m.voucher_type === 'purchase' ? 'text-[#0e7a70]' : 'text-[#0e7a70]'}>
                            {m.voucher_type === 'purchase' ? 'IN (Purchase)' : 'OUT (Sales)'}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-[#52685e]">{m.party_name}</td>
                        <td className={`py-2.5 px-3 text-right font-bold ${
                          m.voucher_type === 'purchase' ? 'text-[#0e7a70]' : 'text-[#ad5545]'
                        }`}>
                          {m.voucher_type === 'purchase' ? `+${m.qty}` : `-${m.qty}`} {movementMaterial.unit || 'pcs'}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="py-6 text-center text-[#8a9991]">
                        No inward/outward voucher movements logged yet for this material.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="pt-3 border-t border-[#e1e8e3] flex justify-between items-center text-xs shrink-0">
              <span className="text-[#71827a]">Current Stock in Hand:</span>
              <span className="text-base font-black text-[#172f2c]">
                {movementMaterial.current_qty} {movementMaterial.unit || 'pcs'}
              </span>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  )
}
