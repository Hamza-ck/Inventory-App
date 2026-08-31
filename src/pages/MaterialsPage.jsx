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
  AlertCircle, 
  Check, 
  FileText,
  FileDown,
  RotateCcw,
  Megaphone
} from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { advancedFilterMaterials } from '../lib/searchUtils'
import Nav from '../components/Nav'
import ProductReportModal from '../components/ProductReportModal'

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

  // Marketing Report Modal State
  const [isReportOpen, setIsReportOpen] = useState(false)

  // Erase All Quantities Safety Modal State
  const [isEraseModalOpen, setIsEraseModalOpen] = useState(false)
  const [erasing, setErasing] = useState(false)
  const [toastMessage, setToastMessage] = useState(null)

  // Excel Bulk Import States
  const [isImportModalOpen, setIsImportModalOpen] = useState(false)
  const [importRows, setImportRows] = useState([])
  const [importErrorsCount, setImportErrorsCount] = useState(0)
  const [importWarningsCount, setImportWarningsCount] = useState(0)
  const [importing, setImporting] = useState(false)
  const [importSummary, setImportSummary] = useState(null)
  const fileInputRef = useRef(null)

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

  // --- Reset / Erase All Quantities to 0 ---
  async function handleEraseAllQuantities() {
    setErasing(true)
    try {
      const { error: updateError } = await supabase
        .from('materials')
        .update({ current_qty: 0 })
        .not('id', 'is', null)

      if (updateError) throw updateError

      setIsEraseModalOpen(false)
      setToastMessage('✓ Successfully reset stock quantities of all products to 0.')
      setTimeout(() => setToastMessage(null), 4000)
      load()
    } catch (err) {
      alert(`Could not reset quantities: ${err.message}`)
    } finally {
      setErasing(false)
    }
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

  // --- Sample & Template Download Functions ---

  function downloadSampleFile() {
    const sampleData = [
      {
        sku: 'SKU-2MM-V40E',
        name: '2MM',
        model: 'VIVO V40 E',
        unit: 'pcs',
        current_qty: 50,
        reorder_threshold: 10,
      },
      {
        sku: 'SKU-2MM-V29',
        name: '2MM',
        model: 'VIVO V29',
        unit: 'pcs',
        current_qty: 30,
        reorder_threshold: 10,
      },
      {
        sku: 'SKU-2MM-OP15',
        name: '2MM',
        model: 'OPPO A15C',
        unit: 'pcs',
        current_qty: 25,
        reorder_threshold: 5,
      },
      {
        sku: 'SKU-MAG-IP15P',
        name: 'Clear Magsafe',
        model: 'IPHONE 15 PRO',
        unit: 'pcs',
        current_qty: 40,
        reorder_threshold: 10,
      },
    ]

    const ws = XLSX.utils.json_to_sheet(sampleData)
    ws['!cols'] = [
      { wch: 18 },
      { wch: 22 },
      { wch: 22 },
      { wch: 10 },
      { wch: 14 },
      { wch: 18 },
    ]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Sample_Inventory')
    XLSX.writeFile(wb, 'inventory_sample_materials.xlsx')
  }

  function downloadBlankTemplate() {
    const templateData = [
      {
        sku: '',
        name: '',
        model: '',
        unit: 'pcs',
        current_qty: 0,
        reorder_threshold: 5,
      },
    ]

    const ws = XLSX.utils.json_to_sheet(templateData)
    ws['!cols'] = [
      { wch: 18 },
      { wch: 28 },
      { wch: 18 },
      { wch: 10 },
      { wch: 14 },
      { wch: 18 },
    ]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Materials_Template')
    XLSX.writeFile(wb, 'inventory_blank_template.xlsx')
  }

  function handleFileChange(e) {
    const file = e.target.files?.[0]
    if (!file) return

    setImportSummary(null)
    const reader = new FileReader()

    reader.onload = (evt) => {
      try {
        const buffer = evt.target.result
        const workbook = XLSX.read(buffer, { type: 'array' })
        const sheetName = workbook.SheetNames[0]
        const worksheet = workbook.Sheets[sheetName]
        const rawJson = XLSX.utils.sheet_to_json(worksheet, { defval: '' })

        if (rawJson.length === 0) {
          alert('The selected Excel file is empty.')
          return
        }

        const seenSkus = new Map()
        let errCount = 0
        let warnCount = 0

        const parsed = rawJson.map((row, index) => {
          const getVal = (possibleKeys) => {
            for (const key of Object.keys(row)) {
              const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, '')
              if (possibleKeys.includes(normalized)) {
                return String(row[key]).trim()
              }
            }
            return ''
          }

          const sku = getVal(['sku', 'skuid', 'barcode', 'itemcode', 'code'])
          const name = getVal(['name', 'materialname', 'productname', 'itemname', 'title'])
          const model = getVal(['model', 'variant', 'type', 'spec'])
          const unit = getVal(['unit', 'uom', 'measure']) || 'pcs'
          const rawQty = getVal(['currentqty', 'qty', 'quantity', 'stock', 'initialqty'])
          const rawThreshold = getVal(['reorderthreshold', 'threshold', 'alertmin', 'minqty', 'reorder'])

          const current_qty = rawQty === '' ? 0 : Number(rawQty) || 0
          const reorder_threshold = rawThreshold === '' ? 0 : Number(rawThreshold) || 0

          const issues = []
          let isError = false
          let isWarning = false

          if (!sku) {
            issues.push('Missing SKU')
            isError = true
          }
          if (!name) {
            issues.push('Missing Name')
            isError = true
          }

          if (sku) {
            if (seenSkus.has(sku)) {
              issues.push(`Duplicate SKU in file (row ${seenSkus.get(sku) + 1} & row ${index + 1})`)
              isWarning = true
              warnCount++
            } else {
              seenSkus.set(sku, index)
            }
          }

          if (isError) errCount++

          return {
            rowNum: index + 1,
            sku,
            name,
            model,
            unit,
            current_qty,
            reorder_threshold,
            isError,
            isWarning,
            issues,
          }
        })

        setImportRows(parsed)
        setImportErrorsCount(errCount)
        setImportWarningsCount(warnCount)
      } catch (err) {
        alert(`Failed to read Excel file: ${err.message}`)
      }
    }

    reader.readAsArrayBuffer(file)
  }

  async function handleConfirmImport() {
    const validRows = importRows.filter((r) => !r.isError)
    if (validRows.length === 0) {
      alert('No valid rows found to import.')
      return
    }

    setImporting(true)
    const existingSkus = new Set(materials.map((m) => m.sku))

    let addedCount = 0
    let updatedCount = 0

    const payloads = validRows.map((r) => {
      if (existingSkus.has(r.sku)) {
        updatedCount++
      } else {
        addedCount++
      }
      return {
        sku: r.sku,
        name: r.name,
        model: r.model || null,
        unit: r.unit || 'pcs',
        current_qty: r.current_qty,
        reorder_threshold: r.reorder_threshold,
      }
    })

    const { error: upsertError } = await supabase
      .from('materials')
      .upsert(payloads, { onConflict: 'sku' })

    setImporting(false)

    if (upsertError) {
      alert(`Import failed: ${upsertError.message}`)
      return
    }

    const skipped = importRows.filter((r) => r.isError)

    setImportSummary({
      added: addedCount,
      updated: updatedCount,
      skippedCount: skipped.length,
      skippedRows: skipped,
    })

    load()
  }

  function closeImportModal() {
    setIsImportModalOpen(false)
    setImportRows([])
    setImportSummary(null)
    setImportErrorsCount(0)
    setImportWarningsCount(0)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const filtered = useMemo(() => {
    return advancedFilterMaterials(materials, search, {
      statusFilter: filterLowStockOnly ? 'low' : 'all',
    })
  }, [materials, search, filterLowStockOnly])

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      <Nav />

      <main className="w-full max-w-6xl mx-auto px-4 sm:px-6 pt-6 pb-24 flex-1">
        {/* Header and Action Buttons */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
              <Boxes className="w-7 h-7 text-blue-600" />
              Materials Inventory
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
              Manage product catalogs, QR barcodes, model variants & threshold alerts
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
            {/* Marketing Report Header Button */}
            <button
              type="button"
              onClick={() => setIsReportOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-amber-50 hover:bg-amber-100 text-amber-900 font-bold text-xs sm:text-sm rounded-xl border border-amber-200 shadow-xs transition-all"
              title="Generate Marketing Available Stock Report (PDF / Copy)"
            >
              <Megaphone className="w-4 h-4 text-amber-600" />
              <span>Available Stock Report</span>
            </button>

            {/* Import from Excel Button */}
            <button
              type="button"
              onClick={() => setIsImportModalOpen(true)}
              className="inline-flex items-center gap-2 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs sm:text-sm rounded-xl shadow-sm transition-all"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Import Excel</span>
            </button>

            {/* Single Add SKU Button */}
            <button
              type="button"
              onClick={startAdd}
              className="inline-flex items-center gap-2 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs sm:text-sm rounded-xl shadow-sm transition-all"
            >
              <Plus className="w-4 h-4" />
              <span>Add SKU</span>
            </button>

            {/* Erase / Reset All Quantities to 0 Button */}
            <button
              type="button"
              onClick={() => setIsEraseModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-rose-50 text-rose-700 hover:text-rose-800 font-semibold text-xs sm:text-sm rounded-xl border border-rose-200 shadow-xs transition-all"
              title="Erase / Reset all stock quantities to 0"
            >
              <RotateCcw className="w-4 h-4 text-rose-600" />
              <span>Reset All Qty</span>
            </button>
          </div>
        </div>

        {/* Success Toast Notification */}
        <AnimatePresence>
          {toastMessage && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl text-xs sm:text-sm font-semibold mb-5 flex items-center justify-between shadow-xs"
            >
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                <span>{toastMessage}</span>
              </div>
              <button
                type="button"
                onClick={() => setToastMessage(null)}
                className="p-1 text-emerald-600 hover:text-emerald-900"
              >
                <X className="w-4 h-4" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Search & Filter Bar */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Search with advance multi-keyword logic by Product Name, Model, or SKU..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 sm:py-3 bg-white border border-slate-300 rounded-xl text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600 shadow-xs"
            />
          </div>

          <button
            type="button"
            onClick={() => setFilterLowStockOnly(!filterLowStockOnly)}
            className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold border transition-all flex items-center justify-center gap-2 ${
              filterLowStockOnly
                ? 'bg-amber-500 text-white border-amber-500 shadow-xs'
                : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
            }`}
          >
            <AlertTriangle className="w-4 h-4" />
            <span>Low Stock Alert</span>
          </button>
        </div>

        {/* Modal for Single Add / Edit */}
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

        {/* Modal for Reset / Erase All Quantities */}
        <AnimatePresence>
          {isEraseModalOpen && (
            <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 10 }}
                className="bg-white rounded-3xl p-6 sm:p-7 w-full max-w-md shadow-2xl border border-rose-200 text-center"
              >
                <div className="w-14 h-14 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto mb-4 border border-rose-100 shadow-sm">
                  <RotateCcw className="w-7 h-7" />
                </div>

                <h3 className="text-lg font-bold text-slate-900 mb-2">
                  Erase All Stock Quantities?
                </h3>

                <p className="text-xs text-slate-500 mb-6 leading-relaxed">
                  This action will set the current stock quantity of <strong className="text-slate-800">ALL {materials.length} products</strong> to <strong>0</strong>.
                  <br />
                  Product names, model variants and SKUs will remain intact.
                </p>

                <div className="flex gap-2.5">
                  <button
                    type="button"
                    onClick={handleEraseAllQuantities}
                    disabled={erasing}
                    className="flex-1 py-3 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs sm:text-sm rounded-xl shadow-md shadow-rose-600/30 active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {erasing ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        <span>Resetting to 0...</span>
                      </>
                    ) : (
                      <>
                        <Check className="w-4 h-4" />
                        <span>Yes, Reset All to 0</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsEraseModalOpen(false)}
                    className="px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs sm:text-sm rounded-xl transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Modal for Excel Bulk Import */}
        <AnimatePresence>
          {isImportModalOpen && (
            <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 10 }}
                className="bg-white rounded-3xl p-6 sm:p-7 w-full max-w-3xl shadow-2xl border border-slate-200 flex flex-col max-h-[90vh]"
              >
                {/* Header */}
                <div className="flex items-start justify-between mb-4 shrink-0">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100">
                      <FileSpreadsheet className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-slate-900">Bulk Import Materials from Excel</h3>
                      <p className="text-xs text-slate-500">Upload a spreadsheet (.xlsx, .xls, or .csv) to batch register or update products</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={closeImportModal}
                    className="p-1.5 rounded-xl text-slate-400 hover:bg-slate-100"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Body Content */}
                <div className="overflow-y-auto pr-1 flex-1 space-y-4">
                  {/* Download Template & Sample Banner */}
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 bg-slate-50 border border-slate-200 rounded-2xl">
                    <div className="flex items-center gap-2.5">
                      <FileText className="w-5 h-5 text-emerald-600 shrink-0" />
                      <div className="text-xs">
                        <span className="font-bold text-slate-800 block text-sm">Download Spreadsheet Template & Samples</span>
                        <span className="text-slate-500">Expected columns: sku, name, model, unit, current_qty, reorder_threshold</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={downloadSampleFile}
                        className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-semibold text-xs rounded-xl border border-emerald-200 flex items-center gap-1.5 transition-colors"
                      >
                        <FileDown className="w-3.5 h-3.5" />
                        <span>Sample File (.xlsx)</span>
                      </button>

                      <button
                        type="button"
                        onClick={downloadBlankTemplate}
                        className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 font-semibold text-xs rounded-xl border border-slate-300 shadow-xs flex items-center gap-1.5 transition-colors"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Blank Template</span>
                      </button>
                    </div>
                  </div>

                  {/* File Upload Area */}
                  {importRows.length === 0 && !importSummary && (
                    <div
                      onClick={() => fileInputRef.current?.click()}
                      className="border-2 border-dashed border-slate-300 hover:border-emerald-500 bg-slate-50/60 hover:bg-emerald-50/20 rounded-2xl p-8 text-center cursor-pointer transition-all flex flex-col items-center justify-center"
                    >
                      <Upload className="w-10 h-10 text-emerald-600 mb-2.5" />
                      <p className="font-bold text-slate-800 text-sm mb-1">Click to choose your Excel file</p>
                      <p className="text-xs text-slate-500">Supports .xlsx, .xls and .csv files</p>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".xlsx, .xls, .csv"
                        onChange={handleFileChange}
                        className="hidden"
                      />
                    </div>
                  )}

                  {/* Post-Import Summary */}
                  {importSummary && (
                    <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl space-y-3">
                      <div className="flex items-center gap-2 text-emerald-800 font-bold text-sm">
                        <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                        <span>
                          Import Complete: {importSummary.added} added, {importSummary.updated} updated, {importSummary.skippedCount} skipped.
                        </span>
                      </div>

                      {importSummary.skippedRows.length > 0 && (
                        <div className="mt-2 text-xs bg-white p-3 rounded-xl border border-emerald-100">
                          <p className="font-semibold text-slate-700 mb-1">Skipped Rows:</p>
                          <ul className="list-disc pl-4 space-y-1 text-slate-600">
                            {importSummary.skippedRows.map((sr, idx) => (
                              <li key={idx}>
                                Row {sr.rowNum}: {sr.issues.join(', ')} ({sr.sku || 'No SKU'} - {sr.name || 'No Name'})
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Preview Table */}
                  {importRows.length > 0 && !importSummary && (
                    <div>
                      {/* Metric Banner */}
                      <div className="flex items-center justify-between mb-2 text-xs">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-800">
                            Preview: {importRows.length} total rows
                          </span>
                          <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-full font-bold">
                            {importRows.length - importErrorsCount} valid
                          </span>
                          {importErrorsCount > 0 && (
                            <span className="px-2 py-0.5 bg-rose-100 text-rose-800 rounded-full font-bold">
                              {importErrorsCount} errors
                            </span>
                          )}
                          {importWarningsCount > 0 && (
                            <span className="px-2 py-0.5 bg-amber-100 text-amber-800 rounded-full font-bold">
                              {importWarningsCount} warnings
                            </span>
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            setImportRows([])
                            if (fileInputRef.current) fileInputRef.current.value = ''
                          }}
                          className="text-slate-500 hover:text-slate-800 underline text-xs"
                        >
                          Choose another file
                        </button>
                      </div>

                      <div className="border border-slate-200 rounded-xl overflow-hidden max-h-60 overflow-y-auto">
                        <table className="w-full text-left text-xs border-collapse">
                          <thead className="bg-slate-100 text-slate-700 font-bold sticky top-0 border-b border-slate-200">
                            <tr>
                              <th className="p-2 w-12">#</th>
                              <th className="p-2">SKU *</th>
                              <th className="p-2">Name *</th>
                              <th className="p-2">Model</th>
                              <th className="p-2">Unit</th>
                              <th className="p-2 text-right">Qty</th>
                              <th className="p-2 text-right">Alert Min</th>
                              <th className="p-2">Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {importRows.map((r) => (
                              <tr
                                key={r.rowNum}
                                className={`${
                                  r.isError
                                    ? 'bg-rose-50/70 text-rose-900'
                                    : r.isWarning
                                    ? 'bg-amber-50/50 text-slate-800'
                                    : 'hover:bg-slate-50 text-slate-800'
                                }`}
                              >
                                <td className="p-2 font-mono text-slate-400">{r.rowNum}</td>
                                <td className="p-2 font-mono font-bold">
                                  {r.sku || <span className="text-rose-600 font-sans italic">Missing</span>}
                                </td>
                                <td className="p-2 font-medium">
                                  {r.name || <span className="text-rose-600 italic">Missing</span>}
                                </td>
                                <td className="p-2 text-slate-500">{r.model || '—'}</td>
                                <td className="p-2 text-slate-500">{r.unit}</td>
                                <td className="p-2 text-right font-semibold">{r.current_qty}</td>
                                <td className="p-2 text-right text-slate-500">{r.reorder_threshold}</td>
                                <td className="p-2">
                                  {r.isError ? (
                                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-600">
                                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                                      {r.issues.join(', ')}
                                    </span>
                                  ) : r.isWarning ? (
                                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-600">
                                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                                      Duplicate
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600">
                                      <Check className="w-3.5 h-3.5" /> Ready
                                    </span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>

                {/* Footer Controls */}
                <div className="flex gap-2.5 pt-4 border-t border-slate-100 mt-4 shrink-0">
                  {importRows.length > 0 && !importSummary ? (
                    <button
                      type="button"
                      onClick={handleConfirmImport}
                      disabled={importing || importRows.length - importErrorsCount === 0}
                      className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm rounded-xl shadow-md shadow-emerald-600/30 active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {importing ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          <span>Importing to Database...</span>
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="w-4 h-4" />
                          <span>
                            Confirm Import ({importRows.length - importErrorsCount} valid items)
                          </span>
                        </>
                      )}
                    </button>
                  ) : null}

                  <button
                    type="button"
                    onClick={closeImportModal}
                    className="px-5 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-sm rounded-xl transition-colors"
                  >
                    {importSummary ? 'Done' : 'Cancel'}
                  </button>
                </div>
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
                : 'Get started by clicking "Add SKU" or "Import Excel" above.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((m) => {
              const qty = Number(m.current_qty) || 0
              const threshold = Number(m.reorder_threshold ?? 0)
              const isOut = qty <= 0
              const isLow = !isOut && qty <= threshold

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
                          isOut
                            ? 'bg-rose-50 text-rose-800 border border-rose-200'
                            : isLow
                            ? 'bg-amber-50 text-amber-800 border border-amber-200'
                            : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                        }`}
                      >
                        {isOut ? '🚫 Out of Stock' : isLow ? '⚠️ Low' : '✓ In Stock'}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500 mb-4">
                      <span className="font-mono bg-slate-100 px-2 py-0.5 rounded border border-slate-200 text-slate-700">
                        {m.sku}
                      </span>
                      {m.model && (
                        <span className="bg-slate-100 px-2 py-0.5 rounded text-slate-600 font-semibold">
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
                        className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-1.5"
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

      {/* Marketing Product Report Modal */}
      <ProductReportModal
        isOpen={isReportOpen}
        onClose={() => setIsReportOpen(false)}
        materials={materials}
      />
    </div>
  )
}
