import { useState, useMemo, useRef } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
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
  Download, 
  Upload, 
  History } from 'lucide-react'
import { accDb, isSkuTaken } from '../lib/accountingDb'
import { useTable, EMPTY } from '../lib/useTable'
import { useUI } from '../context/UIContext'
import { todayISO } from '../lib/format'
import { useAuth } from '../context/AuthContext'

const emptyForm = {
  sku: '',
  name: '',
  category: 'Raw Materials',
  unit: 'pcs',
  purchase_rate: 100,
  sales_rate: 140,
  current_qty: 0,
  reorder_threshold: 10 }

export default function MaterialsPage() {
  const { isAdmin, isOwner } = useAuth()
  const ui = useUI()
  const materialsRaw = useTable('materials')
  const materials = useMemo(() => materialsRaw ?? [], [materialsRaw])
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
      sku: `MAT-${Date.now().toString().slice(-4)}` })
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
      reorder_threshold: material.reorder_threshold || 10 })
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
      if (await isSkuTaken(form.sku, editingId)) {
        setError(`SKU "${form.sku.trim()}" is already used by another material`)
        setSaving(false)
        return
      }
      if (editingId) {
        await accDb.materials.update(editingId, {
          ...form,
          purchase_rate: Number(form.purchase_rate) || 0,
          sales_rate: Number(form.sales_rate) || 0,
          current_qty: Number(form.current_qty) || 0,
          reorder_threshold: Number(form.reorder_threshold) || 0 })
      } else {
        await accDb.materials.add({
          ...form,
          purchase_rate: Number(form.purchase_rate) || 0,
          sales_rate: Number(form.sales_rate) || 0,
          current_qty: Number(form.current_qty) || 0,
          reorder_threshold: Number(form.reorder_threshold) || 0,
          created_at: new Date().toISOString() })
      }

      setSaving(false)
      setIsModalOpen(false)
    } catch (err) {
      setError(err.message || 'Failed to save material')
      setSaving(false)
    }
  }

  async function handleDelete(m) {
    if (!isAdmin) return
    const used = await accDb.vouchers
      .filter((v) => (v.items || []).some((it) => Number(it.material_id) === m.id || it.sku === m.sku))
      .count()
    if (used > 0) {
      ui.toast(`"${m.name}" is used in ${used} voucher(s) and can't be deleted. Set its stock to zero instead.`, 'error')
      return
    }
    if (!(await ui.confirm(`Delete "${m.name}"?`, { confirmLabel: 'Delete', danger: true }))) return
    await accDb.materials.delete(m.id)
    ui.toast('Material deleted')
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
      'Stock Valuation (₹)': Number(m.current_qty || 0) * Number(m.purchase_rate || 0) }))

    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Materials_Inventory')
    XLSX.writeFile(wb, `Materials_Stock_${todayISO()}.xlsx`)
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

      const toAdd = []
      let skipped = 0
      const seen = new Set()
      const num = (v, d = 0) => (Number.isFinite(parseFloat(v)) ? parseFloat(v) : d)
      for (const r of rows) {
        const name = String(r['Material Name'] || r['Item Name'] || r['Name'] || '').trim()
        if (!name) continue
        const sku = String(r['SKU / Item Code'] || r['SKU'] || r['Item Code'] || '').trim()
        if (!sku || seen.has(sku.toLowerCase()) || (await isSkuTaken(sku))) {
          skipped++ // missing or duplicate SKU: never create a second copy
          continue
        }
        seen.add(sku.toLowerCase())
        toAdd.push({
          sku,
          name,
          category: r['Category'] || 'General',
          unit: r['Unit'] || 'pcs',
          purchase_rate: num(r['Cost Rate (₹)'] ?? r['Purchase Rate']),
          sales_rate: num(r['Sales Rate (₹)'] ?? r['Sales Rate']),
          current_qty: num(r['Current Stock'] ?? r['Qty']),
          reorder_threshold: num(r['Reorder Level'], 10),
          created_at: new Date().toISOString() })
      }
      await accDb.materials.bulkAdd(toAdd)
      ui.toast(`Imported ${toAdd.length} material(s)${skipped ? `, skipped ${skipped} with a missing or duplicate SKU` : ''}`)
    } catch (err) {
      ui.toast('Failed to import Excel: ' + err.message, 'error')
    } finally {
      e.target.value = ''
    }
  }

  // Vouchers are only read while the movement history modal is open
  const vouchers = useLiveQuery(() => (movementMaterial ? accDb.vouchers.toArray() : []), [movementMaterial?.id]) ?? EMPTY

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
              amount: it.amount || it.qty * it.rate })
          }
        })
      }
    })
    return moves.sort((a, b) => new Date(b.date) - new Date(a.date))
  }, [movementMaterial, vouchers])

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans pb-16">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 pt-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-2">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight flex items-center gap-2.5">
                <Boxes className="w-7 h-7 text-purple-600" />
                <span>Materials Stock & Valuation</span>
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-purple-50 text-purple-700 border border-purple-200">
                Pure Material-Wise (No Models)
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-600 mt-1">
              Material-wise stock levels, cost valuation, reorder alerts, and movement tracking.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={exportMaterialsExcel}
              className="px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 shadow-xs"
            >
              <Download className="w-4 h-4 text-emerald-600" />
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
                  className="px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 shadow-xs"
                >
                  <Upload className="w-4 h-4 text-blue-600" />
                  <span>Import Excel</span>
                </button>

                <button
                  type="button"
                  onClick={startAdd}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold shadow-xs flex items-center gap-1.5 transition-all active:scale-95"
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
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
            <span className="text-xs font-bold text-slate-600 uppercase tracking-wider block mb-1">Total Stock Items</span>
            <div className="text-2xl font-black text-slate-900">{totalStockItems}</div>
            <div className="text-[11px] text-slate-500 mt-1 font-medium">Material SKU catalog count</div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
            <span className="text-xs font-bold text-purple-700 uppercase tracking-wider block mb-1">Total Stock Valuation</span>
            <div className="text-2xl font-black text-purple-700">₹{totalValuation.toLocaleString()}</div>
            <div className="text-[11px] text-slate-500 mt-1 font-medium">Based on purchase cost rate</div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
            <span className="text-xs font-bold text-amber-700 uppercase tracking-wider block mb-1">Low Stock Warnings</span>
            <div className="text-2xl font-black text-amber-700">{lowStockCount} Items</div>
            <div className="text-[11px] text-slate-500 mt-1 font-medium">Items at or below reorder threshold</div>
          </div>
        </div>

        {/* Filter Toolbar */}
        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5 flex-1 max-w-xl">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search material SKU, name..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-600"
              />
            </div>

            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="px-3 py-1.5 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-600"
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
                  ? 'bg-amber-100 text-amber-900 border-amber-300'
                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
              }`}
            >
              Low Stock Only
            </button>
          </div>

          <span className="text-xs text-slate-600 font-bold">
            Showing {filtered.length} Materials
          </span>
        </div>

        {/* Materials Table */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100 text-slate-700 font-bold uppercase text-[10px] border-b border-slate-200">
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
              <tbody className="divide-y divide-slate-100 font-medium">
                {filtered.length > 0 ? (
                  filtered.map((mat) => {
                    const isLow = Number(mat.current_qty) <= Number(mat.reorder_threshold)
                    const valuation = Number(mat.current_qty || 0) * Number(mat.purchase_rate || 0)
                    return (
                      <tr key={mat.id} className="hover:bg-slate-50 transition-colors">
                        <td className="py-3 px-3 font-mono font-black text-slate-900 whitespace-nowrap">{mat.sku}</td>
                        <td className="py-3 px-3 font-bold text-slate-900">
                          <div>{mat.name}</div>
                        </td>
                        <td className="py-3 px-3 text-slate-600">{mat.category || 'General'}</td>
                        <td className="py-3 px-3 text-right text-slate-700 font-mono font-bold">₹{Number(mat.purchase_rate || 0).toLocaleString()}</td>
                        <td className="py-3 px-3 text-right text-emerald-700 font-mono font-black">₹{Number(mat.sales_rate || 0).toLocaleString()}</td>
                        <td className="py-3 px-3 text-right font-black text-slate-900 whitespace-nowrap">
                          {mat.current_qty} <span className="text-[10px] text-slate-500 font-medium">{mat.unit || 'pcs'}</span>
                        </td>
                        <td className="py-3 px-3 text-right font-black text-purple-700 whitespace-nowrap">
                          ₹{valuation.toLocaleString()}
                        </td>
                        <td className="py-3 px-3 text-center whitespace-nowrap">
                          {isLow ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 text-[10px] font-bold border border-amber-200">
                              <AlertTriangle className="w-3 h-3 text-amber-600" />
                              <span>Reorder</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-bold border border-emerald-200">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              <span>Optimal</span>
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-center whitespace-nowrap">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => { setMovementMaterial(mat); setIsMovementModalOpen(true) }}
                              className="p-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 transition-colors"
                              title="Stock Inward/Outward Movements"
                            >
                              <History className="w-3.5 h-3.5 text-blue-600" />
                            </button>
                            {isAdmin && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => startEdit(mat)}
                                  className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
                                  title="Edit Material"
                                >
                                  <Edit3 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDelete(mat)}
                                  className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 transition-colors"
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
                    <td colSpan={9} className="py-8 text-center text-slate-500 font-medium">
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50">
          <div
            className="w-full max-w-lg bg-white rounded-2xl p-6 border border-slate-200 shadow-xl text-slate-900 font-sans"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h2 className="text-base font-bold text-slate-900">
                {editingId ? 'Modify Material' : 'Add New Material Stock Item'}
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            {error && (
              <div className="mt-3 p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs font-bold">
                {error}
              </div>
            )}

            <form onSubmit={handleSave} className="space-y-3.5 pt-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">SKU / Item Code *</label>
                  <input
                    type="text"
                    required
                    value={form.sku}
                    onChange={(e) => setForm({ ...form, sku: e.target.value })}
                    placeholder="e.g. MAT-CANVAS-01"
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-mono font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Category / Group</label>
                  <input
                    type="text"
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                    placeholder="e.g. Textiles"
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-600"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Material Name *</label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Industrial Cotton Canvas 350 GSM"
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-600"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Unit of Measure</label>
                  <input
                    type="text"
                    value={form.unit}
                    onChange={(e) => setForm({ ...form, unit: e.target.value })}
                    placeholder="meter, kg, pcs, box"
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Cost Rate (₹)</label>
                  <input
                    type="number"
                    step="any"
                    value={form.purchase_rate}
                    onChange={(e) => setForm({ ...form, purchase_rate: e.target.value })}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 text-right"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Sales Rate (₹)</label>
                  <input
                    type="number"
                    step="any"
                    value={form.sales_rate}
                    onChange={(e) => setForm({ ...form, sales_rate: e.target.value })}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 text-right"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">{editingId ? 'Current Stock' : 'Opening Stock'}</label>
                  <input
                    type="number"
                    step="any"
                    value={form.current_qty}
                    onChange={(e) => setForm({ ...form, current_qty: e.target.value })}
                    readOnly={Boolean(editingId)}
                    className={`w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 text-right ${editingId ? 'opacity-60 cursor-not-allowed bg-slate-50' : ''}`}
                  />
                  {editingId && <p className="mt-1 text-[10px] text-slate-500 font-medium">Stock changes through purchase and sales vouchers.</p>}
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Reorder Threshold</label>
                  <input
                    type="number"
                    step="any"
                    value={form.reorder_threshold}
                    onChange={(e) => setForm({ ...form, reorder_threshold: e.target.value })}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 text-right"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:text-slate-900"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold shadow-xs"
                >
                  {saving ? 'Saving...' : 'Save Material'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Material Inward/Outward Movements Modal */}
      {isMovementModalOpen && movementMaterial && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50">
          <div
            className="w-full max-w-2xl bg-white rounded-2xl p-6 border border-slate-200 shadow-xl text-slate-900 font-sans max-h-[85vh] flex flex-col"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 shrink-0">
              <div>
                <span className="text-[10px] font-mono text-purple-700 font-bold uppercase">Stock Register</span>
                <h2 className="text-base font-bold text-slate-900 mt-0.5">
                  {movementMaterial.name} ({movementMaterial.sku})
                </h2>
              </div>
              <button onClick={() => setIsMovementModalOpen(false)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="py-4 overflow-y-auto flex-1">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 text-slate-700 uppercase text-[10px] font-bold border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-3">Date</th>
                    <th className="py-2.5 px-3">Vch No.</th>
                    <th className="py-2.5 px-3">Type</th>
                    <th className="py-2.5 px-3">Party</th>
                    <th className="py-2.5 px-3 text-right">Inward / Outward Qty</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {materialMovements.length > 0 ? (
                    materialMovements.map((m, i) => (
                      <tr key={i} className="hover:bg-slate-50 transition-colors">
                        <td className="py-2.5 px-3 text-slate-600 font-mono">{m.date}</td>
                        <td className="py-2.5 px-3 font-mono font-black text-slate-900">{m.voucher_no}</td>
                        <td className="py-2.5 px-3 uppercase text-[10px] font-bold">
                          <span className={m.voucher_type === 'purchase' ? 'text-teal-700' : 'text-emerald-700'}>
                            {m.voucher_type === 'purchase' ? 'IN (Purchase)' : 'OUT (Sales)'}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-slate-900 font-semibold">{m.party_name}</td>
                        <td className={`py-2.5 px-3 text-right font-black ${
                          m.voucher_type === 'purchase' ? 'text-teal-700' : 'text-rose-700'
                        }`}>
                          {m.voucher_type === 'purchase' ? `+${m.qty}` : `-${m.qty}`} {movementMaterial.unit || 'pcs'}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="py-6 text-center text-slate-500 font-medium">
                        No inward/outward voucher movements logged yet for this material.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="pt-3 border-t border-slate-200 flex justify-between items-center text-xs shrink-0">
              <span className="text-slate-600 font-semibold">Current Stock in Hand:</span>
              <span className="text-base font-black text-slate-900">
                {movementMaterial.current_qty} {movementMaterial.unit || 'pcs'}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
