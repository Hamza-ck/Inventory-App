import { useCallback, useState, useRef, useEffect, useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  ArrowDownCircle, 
  ArrowUpCircle, 
  Plus, 
  Minus,
  UploadCloud, 
  CheckCircle2, 
  AlertTriangle, 
  X, 
  QrCode, 
  Package, 
  Search,
  Sparkles,
  Check,
  FileText
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabaseClient'
import { db, addToQueue, updateQueueQty } from '../lib/db'
import { submitQueue } from '../lib/sync'
import { advancedFilterMaterials } from '../lib/searchUtils'
import ScannerView from '../components/ScannerView'
import QueueList from '../components/QueueList'
import Nav from '../components/Nav'
import AdvanceSearchModal from '../components/AdvanceSearchModal'
import ProductReportModal from '../components/ProductReportModal'

export default function ScanPage() {
  const { user, isOwner } = useAuth()
  const [direction, setDirection] = useState('out') // 'in' | 'out'
  const directionRef = useRef(direction)
  const isOwnerRef = useRef(isOwner)

  const [status, setStatus] = useState(null)
  const [statusType, setStatusType] = useState('info') // 'info' | 'success' | 'warning' | 'error'
  const [submitting, setSubmitting] = useState(false)
  const [unknownSku, setUnknownSku] = useState(null)
  const [quickAdd, setQuickAdd] = useState({ name: '', model: '' })
  const [addingMaterial, setAddingMaterial] = useState(false)
  const [manualSku, setManualSku] = useState('')
  const [isManualFocused, setIsManualFocused] = useState(false)
  const manualSearchRef = useRef(null)

  // Materials state for live advanced search
  const [materials, setMaterials] = useState([])

  // Modal states for Advance Search and Product Report
  const [isAdvanceSearchOpen, setIsAdvanceSearchOpen] = useState(false)
  const [isReportOpen, setIsReportOpen] = useState(false)
  const [reportProduct, setReportProduct] = useState('')

  // Scanned item popup modal state (displays Model Name as h3 and Product Name as h5)
  const [scannedPopup, setScannedPopup] = useState(null)

  useEffect(() => {
    directionRef.current = direction
  }, [direction])

  useEffect(() => {
    isOwnerRef.current = isOwner
  }, [isOwner])

  useEffect(() => {
    loadMaterials()
  }, [])

  async function loadMaterials() {
    const { data } = await supabase.from('materials').select('*').order('name')
    if (data) setMaterials(data)
  }

  // Close live suggestions on outside click
  useEffect(() => {
    function handleClickOutside(event) {
      if (manualSearchRef.current && !manualSearchRef.current.contains(event.target)) {
        setIsManualFocused(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const queueItems = useLiveQuery(() => db.queue.toArray(), []) || []
  const validItemsCount = queueItems.filter((i) => Number(i.qty) > 0).length

  // Live advance search suggestions for employees & owners
  const liveSuggestions = useMemo(() => {
    if (!manualSku.trim()) return []
    return advancedFilterMaterials(materials, manualSku.trim()).slice(0, 5)
  }, [materials, manualSku])

  // Stable scan handler
  const handleScan = useCallback(async (rawSku) => {
    const sku = rawSku.trim()
    if (!sku) return
    const currentDirection = directionRef.current
    const ownerStatus = isOwnerRef.current

    let materialData = null
    try {
      const { data } = await supabase
        .from('materials')
        .select('name, model, unit, current_qty')
        .eq('sku', sku)
        .single()
      materialData = data
      if (data?.name) {
        await db.materialsCache.put({ 
          sku, 
          name: data.name, 
          model: data.model || '',
          updatedAt: new Date().toISOString() 
        })
      }
    } catch {
      const cached = await db.materialsCache.get(sku)
      if (cached?.name) {
        materialData = { name: cached.name, model: cached.model || '' }
      }
    }

    const name = materialData?.name ?? null
    const model = materialData?.model ?? ''
    const unit = materialData?.unit ?? 'pcs'

    if (!name && ownerStatus) {
      setUnknownSku(sku)
      setQuickAdd({ name: '', model: '' })
      setStatusType('warning')
      setStatus(`Unregistered SKU: "${sku}". Register material details below.`)
      return
    }

    // Add to queue
    const queueId = await addToQueue({ sku, name, direction: currentDirection })

    // Trigger visual pop-up modal showing Model Name (h3) and Product Name (h5)
    setScannedPopup({
      queueId,
      sku,
      name: name || 'Unregistered Product',
      model: model || 'Standard Model',
      unit,
      direction: currentDirection,
      qty: 1,
    })

    if (name) {
      setStatusType('success')
      setStatus(`Scanned: "${model || name}" (${currentDirection === 'in' ? 'Inward' : 'Outward'})`)
    } else {
      setStatusType('warning')
      setStatus(`Added unregistered SKU (${sku})`)
    }
  }, [])

  function handleManualSubmit(e) {
    e.preventDefault()
    if (!manualSku.trim()) return
    handleScan(manualSku.trim())
    setManualSku('')
    setIsManualFocused(false)
  }

  function handleSelectSuggestion(m) {
    handleScan(m.sku)
    setManualSku('')
    setIsManualFocused(false)
  }

  async function handleQuickAdd(e) {
    e.preventDefault()
    setAddingMaterial(true)
    const { error } = await supabase.from('materials').insert({
      sku: unknownSku,
      name: quickAdd.name.trim(),
      model: quickAdd.model.trim() || null,
    })
    setAddingMaterial(false)

    if (error) {
      setStatusType('error')
      setStatus(`Could not register: ${error.message}`)
      return
    }

    await db.materialsCache.put({
      sku: unknownSku,
      name: quickAdd.name.trim(),
      model: quickAdd.model.trim() || '',
      updatedAt: new Date().toISOString(),
    })
    const queueId = await addToQueue({ sku: unknownSku, name: quickAdd.name.trim(), direction })
    
    // Show popup
    setScannedPopup({
      queueId,
      sku: unknownSku,
      name: quickAdd.name.trim(),
      model: quickAdd.model.trim() || 'Standard Model',
      unit: 'pcs',
      direction,
      qty: 1,
    })

    setStatusType('success')
    setStatus(`✓ Registered "${quickAdd.name.trim()}" and added to queue`)
    setUnknownSku(null)
    loadMaterials()
  }

  async function handleSubmit() {
    if (queueItems.length === 0 || !user) return
    setSubmitting(true)
    const result = await submitQueue(user.id)
    setSubmitting(false)

    if (result.succeeded > 0) {
      setStatusType('success')
      setStatus(
        `✓ Successfully synced ${result.succeeded} item(s)! ${
          result.skipped > 0 ? `(${result.skipped} skipped without qty)` : ''
        }`
      )
    } else if (result.skipped > 0) {
      setStatusType('warning')
      setStatus(`Please enter quantities before submitting (${result.skipped} items pending)`)
    } else if (result.failed > 0) {
      setStatusType('error')
      setStatus(`Sync failed for ${result.failed} item(s). Will retry automatically when online.`)
    }
  }

  function adjustPopupQty(delta) {
    if (!scannedPopup) return
    const nextQty = Math.max(1, (Number(scannedPopup.qty) || 1) + delta)
    setScannedPopup({ ...scannedPopup, qty: nextQty })
    if (scannedPopup.queueId) {
      updateQueueQty(scannedPopup.queueId, String(nextQty))
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      <Nav />

      <main className="w-full max-w-2xl mx-auto px-4 pt-4 pb-28 sm:py-8 flex-1">
        {/* Header and Mode Indicator */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 flex items-center gap-2">
              <QrCode className="w-6 h-6 text-blue-600" />
              QR Scanner
            </h1>
            <p className="text-xs sm:text-sm text-slate-500">Scan barcodes or search models in real-time</p>
          </div>

          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border transition-colors ${
                direction === 'in'
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200 ring-4 ring-emerald-500/10'
                  : 'bg-rose-50 text-rose-700 border-rose-200 ring-4 ring-rose-500/10'
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  direction === 'in' ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500 animate-pulse'
                }`}
              />
              {direction === 'in' ? 'INWARD MODE' : 'OUTWARD MODE'}
            </span>
          </div>
        </div>

        {/* Direction Segmented Toggle Buttons */}
        <div className="grid grid-cols-2 gap-2 p-1.5 bg-slate-200/80 rounded-2xl border border-slate-300/60 mb-4 shadow-inner">
          <button
            type="button"
            onClick={() => setDirection('in')}
            className={`relative flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-bold text-sm transition-all duration-200 active:scale-[0.98] ${
              direction === 'in'
                ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30'
                : 'text-slate-700 hover:text-slate-900 hover:bg-slate-200/50'
            }`}
          >
            <ArrowDownCircle className={`w-5 h-5 ${direction === 'in' ? 'text-white' : 'text-emerald-600'}`} />
            <span>Inward (Stock In)</span>
          </button>

          <button
            type="button"
            onClick={() => setDirection('out')}
            className={`relative flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-bold text-sm transition-all duration-200 active:scale-[0.98] ${
              direction === 'out'
                ? 'bg-rose-600 text-white shadow-md shadow-rose-600/30'
                : 'text-slate-700 hover:text-slate-900 hover:bg-slate-200/50'
            }`}
          >
            <ArrowUpCircle className={`w-5 h-5 ${direction === 'out' ? 'text-white' : 'text-rose-600'}`} />
            <span>Outward (Stock Out)</span>
          </button>
        </div>

        {/* Camera Scanner View */}
        <ScannerView onScan={handleScan} />

        {/* Advance Search & Live Barcode / Model Input for Employees */}
        <div ref={manualSearchRef} className="relative mb-4 z-20">
          <form onSubmit={handleManualSubmit} className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder='Search Model Name, Product or SKU (e.g. "2mm", "Vivo")...'
                value={manualSku}
                onFocus={() => setIsManualFocused(true)}
                onChange={(e) => {
                  setManualSku(e.target.value)
                  setIsManualFocused(true)
                }}
                className="w-full pl-10 pr-4 py-2.5 bg-white rounded-xl border border-slate-300 text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent shadow-xs"
              />
              {manualSku && (
                <button
                  type="button"
                  onClick={() => {
                    setManualSku('')
                    setIsManualFocused(false)
                  }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <button
              type="submit"
              disabled={!manualSku.trim()}
              className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm rounded-xl shadow-xs active:scale-95 transition-all disabled:opacity-50 disabled:pointer-events-none flex items-center gap-1.5 shrink-0"
            >
              <Plus className="w-4 h-4" /> Add
            </button>

            <button
              type="button"
              onClick={() => setIsAdvanceSearchOpen(true)}
              className="px-3 py-2.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 font-semibold text-xs rounded-xl shadow-xs transition-colors shrink-0 flex items-center gap-1"
              title="Open full advance search palette"
            >
              <Search className="w-3.5 h-3.5 text-blue-600" />
              <span className="hidden sm:inline">Search</span>
            </button>
          </form>

          {/* Live Search Suggestions Dropdown */}
          <AnimatePresence>
            {isManualFocused && liveSuggestions.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 4 }}
                className="absolute top-full left-0 right-0 mt-1.5 bg-white rounded-2xl border border-slate-200 shadow-2xl overflow-hidden divide-y divide-slate-100 z-30"
              >
                <div className="px-3 py-1.5 bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center justify-between">
                  <span>Matching Models & Products</span>
                  <span className="text-[10px] font-normal lowercase">Click to scan/queue</span>
                </div>

                {liveSuggestions.map((m) => {
                  const qty = Number(m.current_qty) || 0
                  const isLow = qty <= Number(m.reorder_threshold ?? 0)

                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => handleSelectSuggestion(m)}
                      className="w-full p-3 text-left hover:bg-blue-50/70 transition-colors flex items-center justify-between gap-3 group"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="font-extrabold text-slate-900 group-hover:text-blue-700 text-xs sm:text-sm truncate">
                          {m.model || m.name}
                        </div>
                        <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-0.5">
                          <span className="font-medium text-slate-700">{m.name}</span>
                          <span>•</span>
                          <span className="font-mono bg-slate-100 px-1.5 py-0.2 rounded border border-slate-200">
                            {m.sku}
                          </span>
                        </div>
                      </div>

                      <div className="text-right shrink-0 pl-2">
                        <div className="font-black text-xs sm:text-sm text-slate-900">
                          {qty.toLocaleString()} {m.unit || 'pcs'}
                        </div>
                        <span
                          className={`text-[10px] font-semibold ${
                            isLow ? 'text-amber-600' : 'text-emerald-600'
                          }`}
                        >
                          {isLow ? 'Low stock' : 'In stock'}
                        </span>
                      </div>
                    </button>
                  )
                })}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Status Toast Banner */}
        <AnimatePresence>
          {status && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className={`flex items-center justify-between gap-3 p-3.5 rounded-xl text-xs sm:text-sm font-medium mb-5 border ${
                statusType === 'success'
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                  : statusType === 'warning'
                  ? 'bg-amber-50 text-amber-900 border-amber-200'
                  : statusType === 'error'
                  ? 'bg-rose-50 text-rose-800 border-rose-200'
                  : 'bg-blue-50 text-blue-800 border-blue-200'
              }`}
            >
              <div className="flex items-center gap-2">
                {statusType === 'success' ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                ) : (
                  <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
                )}
                <span>{status}</span>
              </div>
              <button
                type="button"
                onClick={() => setStatus(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ======================================================== */}
        {/* SCAN POP-UP: Shows Model Name(h3) & Product Name(h5)     */}
        {/* ======================================================== */}
        <AnimatePresence>
          {scannedPopup && (
            <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-md flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0, scale: 0.92, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.92, y: 20 }}
                transition={{ type: 'spring', damping: 25, stiffness: 350 }}
                className="bg-white rounded-3xl p-6 sm:p-7 w-full max-w-sm shadow-2xl border border-slate-200 text-center relative overflow-hidden"
              >
                {/* Close Button */}
                <button
                  type="button"
                  onClick={() => setScannedPopup(null)}
                  className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>

                {/* Scan Direction Badge & Icon */}
                <div
                  className={`mx-auto w-14 h-14 rounded-2xl flex items-center justify-center mb-3 shadow-md ${
                    scannedPopup.direction === 'in'
                      ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                      : 'bg-rose-100 text-rose-700 border border-rose-200'
                  }`}
                >
                  {scannedPopup.direction === 'in' ? (
                    <ArrowDownCircle className="w-8 h-8" />
                  ) : (
                    <ArrowUpCircle className="w-8 h-8" />
                  )}
                </div>

                <div className="mb-1">
                  <span
                    className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider ${
                      scannedPopup.direction === 'in'
                        ? 'bg-emerald-50 text-emerald-800'
                        : 'bg-rose-50 text-rose-800'
                    }`}
                  >
                    {scannedPopup.direction === 'in' ? 'Stock Inward' : 'Stock Outward'}
                  </span>
                </div>

                {/* MODEL NAME as <h3> */}
                <h3 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight leading-tight mt-1 mb-0.5">
                  {scannedPopup.model || 'Standard Variant / Model'}
                </h3>

                {/* PRODUCT NAME as <h5> */}
                <h5 className="text-sm font-semibold text-slate-500 mb-4">
                  {scannedPopup.name}
                </h5>

                {/* Quantity Stepper Controller */}
                <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200 mb-4">
                  <div className="text-[11px] font-bold text-slate-400 uppercase mb-2">
                    Scanned Quantity ({scannedPopup.unit || 'pcs'})
                  </div>

                  <div className="flex items-center justify-center gap-3">
                    <button
                      type="button"
                      onClick={() => adjustPopupQty(-1)}
                      className="w-10 h-10 rounded-xl bg-white border border-slate-200 shadow-xs flex items-center justify-center text-slate-700 font-bold hover:bg-slate-100 active:scale-95 transition-all"
                    >
                      <Minus className="w-4 h-4" />
                    </button>

                    <div className="w-16 text-center font-black text-2xl text-slate-900">
                      {scannedPopup.qty}
                    </div>

                    <button
                      type="button"
                      onClick={() => adjustPopupQty(1)}
                      className="w-10 h-10 rounded-xl bg-white border border-slate-200 shadow-xs flex items-center justify-center text-slate-700 font-bold hover:bg-slate-100 active:scale-95 transition-all"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Preset chips */}
                  <div className="flex items-center justify-center gap-2 mt-2.5">
                    {[5, 10, 25, 50].map((num) => (
                      <button
                        key={num}
                        type="button"
                        onClick={() => adjustPopupQty(num)}
                        className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 transition-colors"
                      >
                        +{num}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Action button */}
                <button
                  type="button"
                  onClick={() => setScannedPopup(null)}
                  className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm rounded-xl shadow-lg shadow-blue-600/30 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                >
                  <Check className="w-4 h-4" />
                  <span>Done / Scan Next</span>
                </button>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Quick Add Form Modal for Unregistered QR Codes */}
        <AnimatePresence>
          {unknownSku && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4"
            >
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl border border-slate-200"
              >
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                      <Sparkles className="w-5 h-5 text-amber-500" />
                      Register New Material
                    </h3>
                    <p className="text-xs text-slate-500 mt-1">
                      SKU barcode:{' '}
                      <span className="font-mono font-bold text-slate-800 bg-slate-100 px-1.5 py-0.5 rounded">
                        {unknownSku}
                      </span>
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setUnknownSku(null)}
                    className="p-1 rounded-lg text-slate-400 hover:bg-slate-100"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <form onSubmit={handleQuickAdd} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Material / Product Name *
                    </label>
                    <input
                      placeholder="e.g. Cotton T-Shirt White"
                      value={quickAdd.name}
                      onChange={(e) => setQuickAdd({ ...quickAdd, name: e.target.value })}
                      required
                      autoFocus
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Model / Variant (Optional)
                    </label>
                    <input
                      placeholder="e.g. Size L / SKU-01"
                      value={quickAdd.model}
                      onChange={(e) => setQuickAdd({ ...quickAdd, model: e.target.value })}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  </div>

                  <div className="flex gap-2 pt-2">
                    <button
                      type="submit"
                      disabled={addingMaterial}
                      className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm rounded-xl shadow-md shadow-blue-600/30 transition-all disabled:opacity-50"
                    >
                      {addingMaterial ? 'Registering...' : 'Register & Add to Queue'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setUnknownSku(null)}
                      className="px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-sm rounded-xl"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Scan Queue Section Header */}
        <div className="flex items-center justify-between mb-3 mt-6">
          <div className="flex items-center gap-2">
            <Package className="w-5 h-5 text-slate-700" />
            <h2 className="text-base sm:text-lg font-bold text-slate-900">Scan Queue</h2>
          </div>
          {queueItems.length > 0 && (
            <span className="px-2.5 py-0.5 bg-blue-100 text-blue-800 rounded-full text-xs font-bold">
              {queueItems.length} {queueItems.length === 1 ? 'item' : 'items'} ({validItemsCount} ready)
            </span>
          )}
        </div>

        {/* Queue List Cards */}
        <QueueList />

        {/* Floating/Sticky Submit Queue Action Bar */}
        {queueItems.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="sticky bottom-20 sm:bottom-6 z-30 pt-3"
          >
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting || validItemsCount === 0}
              className="w-full py-4 px-6 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold text-base rounded-2xl shadow-xl shadow-blue-600/30 active:scale-[0.99] transition-all disabled:opacity-50 flex items-center justify-center gap-2.5"
            >
              {submitting ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Syncing Queue to Cloud...</span>
                </>
              ) : (
                <>
                  <UploadCloud className="w-5 h-5" />
                  <span>
                    Submit Queue ({validItemsCount} of {queueItems.length} items ready)
                  </span>
                </>
              )}
            </button>
          </motion.div>
        )}
      </main>

      {/* Advance Search Modal */}
      <AdvanceSearchModal
        isOpen={isAdvanceSearchOpen}
        onClose={() => setIsAdvanceSearchOpen(false)}
        materials={materials}
        onSelectProductForReport={(pName) => {
          setReportProduct(pName)
          setIsReportOpen(true)
        }}
        onItemAddedToQueue={(m, dir) => {
          setStatusType('success')
          setStatus(`Added "${m.model || m.name}" to ${dir === 'in' ? 'Inward' : 'Outward'} queue`)
        }}
      />

      {/* Product Report Modal */}
      <ProductReportModal
        isOpen={isReportOpen}
        onClose={() => setIsReportOpen(false)}
        materials={materials}
        initialProductName={reportProduct}
      />
    </div>
  )
}
