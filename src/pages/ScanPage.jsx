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
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabaseClient'
import { db, addToQueue, updateQueueQty } from '../lib/db'
import { submitQueue } from '../lib/sync'
import { advancedFilterMaterials } from '../lib/searchUtils'
import { filterMaterialsByCanonicalModel, resolveModelAlias, resolveSupplierModelLabel, saveModelAlias, saveSupplierModelLabel, updateSupplierModelLabelMaterial } from '../lib/modelLabelResolver'
import { generateSkuForModel } from '../lib/modelMatcher'
import ScannerView from '../components/ScannerView'
import QueueList from '../components/QueueList'
import Nav from '../components/Nav'
import AdvanceSearchModal from '../components/AdvanceSearchModal'
import ProductReportModal from '../components/ProductReportModal'
import BatchModelAddModal from '../components/BatchModelAddModal'

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

  // Supplier-label intelligence states
  const [materialPicker, setMaterialPicker] = useState(null)
  const [unknownLabel, setUnknownLabel] = useState(null)
  const [unknownLabelModel, setUnknownLabelModel] = useState('')
  const [savingLabel, setSavingLabel] = useState(false)
  const [materialCreator, setMaterialCreator] = useState(null)
  const [creatingMaterial, setCreatingMaterial] = useState(false)
  const [linkLabelToMaterial, setLinkLabelToMaterial] = useState(true) // "Remember for this label" toggle

  // Materials state for live advanced search
  const [materials, setMaterials] = useState([])

  // Modal states for Advance Search and Product Report
  const [isAdvanceSearchOpen, setIsAdvanceSearchOpen] = useState(false)
  const [isReportOpen, setIsReportOpen] = useState(false)
  const [reportProduct, setReportProduct] = useState('')
  const [isBatchModalOpen, setIsBatchModalOpen] = useState(false)

  // Scanned item popup modal state
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

  const modelOptions = useMemo(() => {
    const seen = new Map()
    materials.forEach((m) => {
      const model = String(m.model || '').trim()
      if (!model) return
      const key = model.toLowerCase().replace(/[^a-z0-9]+/g, '')
      if (!seen.has(key)) seen.set(key, model)
    })
    return Array.from(seen.values()).sort((a, b) => a.localeCompare(b))
  }, [materials])

  function queueMaterial(material, currentDirection, rawLabel = null) {
    return addToQueue({
      sku: material.sku,
      name: material.name,
      model: material.model,
      direction: currentDirection,
    }).then((queueId) => {
      setScannedPopup({
        queueId,
        sku: material.sku,
        supplierLabel: rawLabel,
        name: material.name || 'Unregistered Product',
        model: material.model || 'Standard Model',
        unit: material.unit || 'pcs',
        direction: currentDirection,
        qty: 1,
      })
      setStatusType('success')
      setStatus(
        `Scanned: "${material.model || material.name}" ${
          rawLabel ? `(label ${rawLabel}) ` : ''
        }(${currentDirection === 'in' ? 'Inward' : 'Outward'})`
      )
    })
  }

  async function resolveModelToMaterials(rawLabel, canonicalModel, currentDirection, directMaterialSku = null) {
    // Fast path: if the label has a direct material_id, find and queue it immediately
    if (directMaterialSku) {
      const directMatch = materials.find((m) => m.sku === directMaterialSku)
      if (directMatch) {
        await queueMaterial(directMatch, currentDirection, rawLabel)
        return
      }
      // material_id was set but material not found in local list — fall through to picker
    }

    const candidates = filterMaterialsByCanonicalModel(materials, canonicalModel)

    if (candidates.length === 0) {
      if (isOwnerRef.current && currentDirection === 'in') {
        setMaterialCreator({ rawLabel, canonicalModel, direction: currentDirection, materialName: '' })
        setStatusType('info')
        setStatus(`Model "${canonicalModel}" is mapped. Create its first material now.`)
      } else {
        setStatusType('warning')
        setStatus(`Label "${rawLabel}" is linked to model "${canonicalModel}", but no material records exist for that model. Ask the owner to create one during inward entry.`)
      }
      return
    }

    if (candidates.length === 1) {
      // Only one material exists — auto-link it to the label so future scans skip the picker
      if (rawLabel) {
        updateSupplierModelLabelMaterial(supabase, rawLabel, candidates[0].id).catch(() => {})
      }
      await queueMaterial(candidates[0], currentDirection, rawLabel)
      return
    }

    setLinkLabelToMaterial(true) // Default the toggle on for each new picker
    setMaterialPicker({
      rawLabel,
      canonicalModel,
      candidates,
      direction: currentDirection,
    })
    setStatusType('info')
    setStatus(`Model "${canonicalModel}" found. Select the material for label "${rawLabel}".`)
  }

  // Stable scan handler
  const handleScan = useCallback(async (rawSku) => {
    const sku = rawSku.trim()
    if (!sku) return
    const currentDirection = directionRef.current
    const ownerStatus = isOwnerRef.current

    // First preserve the existing internal-SKU workflow.
    let materialData = null
    try {
      const { data } = await supabase
        .from('materials')
        .select('sku, name, model, unit, current_qty')
        .eq('sku', sku)
        .maybeSingle()
      materialData = data
      if (data?.name) {
        await db.materialsCache.put({
          sku,
          name: data.name,
          model: data.model || '',
          currentQty: data.current_qty,
          updatedAt: new Date().toISOString(),
        })
      }
    } catch {
      const cached = await db.materialsCache.get(sku)
      if (cached?.name) {
        materialData = { sku, name: cached.name, model: cached.model || '', unit: 'pcs' }
      }
    }

    if (materialData?.name) {
      await queueMaterial(materialData, currentDirection)
      return
    }

    // Then resolve a supplier label -> canonical model (and optionally a direct material).
    const labelMatch = await resolveSupplierModelLabel(supabase, sku)
    if (labelMatch?.canonicalModel) {
      await resolveModelToMaterials(sku, labelMatch.canonicalModel, currentDirection, labelMatch.materialSku)
      return
    }

    // Finally allow a saved alias such as "OP F31" -> "OPPO F31".
    const aliasMatch = await resolveModelAlias(supabase, sku)
    if (aliasMatch?.canonicalModel) {
      await resolveModelToMaterials(sku, aliasMatch.canonicalModel, currentDirection)
      return
    }

    // Unknown supplier label: only the owner in inward mode may teach the mapping.
    if (ownerStatus && currentDirection === 'in') {
      setUnknownLabel(sku)
      setUnknownLabelModel('')
      setStatusType('warning')
      setStatus(`Unknown supplier label: "${sku}". Link it to the correct model first.`)
      return
    }

    // Do not let outward scans create arbitrary mappings.
    setStatusType('warning')
    setStatus(
      currentDirection === 'out'
        ? `Unregistered supplier label "${sku}". Register/map it during inward stock entry first.`
        : `Unregistered label "${sku}".`
    )
  }, [materials])

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

  async function handleCreateMappedMaterial(e) {
    e.preventDefault()
    const draft = materialCreator
    const materialName = draft?.materialName?.trim()
    if (!draft || !materialName || creatingMaterial) return

    setCreatingMaterial(true)
    const generatedSku = generateSkuForModel(draft.canonicalModel, materials, materialName)
    const { data, error } = await supabase
      .from('materials')
      .insert({
        sku: generatedSku,
        name: materialName,
        model: draft.canonicalModel,
        unit: 'pcs',
      })
      .select('id, sku, name, model, unit, current_qty')
      .single()

    if (error || !data) {
      setCreatingMaterial(false)
      setStatusType('error')
      setStatus(`Could not create material: ${error?.message || 'Unknown error'}`)
      return
    }

    await db.materialsCache.put({
      sku: data.sku,
      name: data.name,
      model: data.model || '',
      currentQty: data.current_qty ?? 0,
      updatedAt: new Date().toISOString(),
    })

    // Auto-link the supplier label to this newly created material
    if (draft.rawLabel && data.id) {
      await updateSupplierModelLabelMaterial(supabase, draft.rawLabel, data.id).catch(() => {})
    }

    setMaterialCreator(null)
    setCreatingMaterial(false)
    await loadMaterials()
    await queueMaterial(data, draft.direction, draft.rawLabel)
  }

  async function handleUnknownLabelSave(e) {
    e.preventDefault()
    const label = unknownLabel?.trim()
    const canonicalModel = unknownLabelModel.trim()
    if (!label || !canonicalModel || savingLabel) return

    setSavingLabel(true)
    const { error: labelError } = await saveSupplierModelLabel(supabase, label, canonicalModel)
    if (labelError) {
      setSavingLabel(false)
      setStatusType('error')
      setStatus(`Could not save label mapping: ${labelError.message}`)
      return
    }

    // Also teach the normalized model alias so future manual terminology can resolve.
    await saveModelAlias(supabase, canonicalModel, canonicalModel)
    setUnknownLabel(null)
    setSavingLabel(false)
    setStatusType('success')
    setStatus(`Saved: "${label}" → "${canonicalModel}". Now select the material.`)
    await resolveModelToMaterials(label, canonicalModel, directionRef.current)
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
    const queueId = await addToQueue({
      sku: unknownSku,
      name: quickAdd.name.trim(),
      model: quickAdd.model.trim() || null,
      direction,
    })

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
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 flex items-center gap-2">
              <QrCode className="w-6 h-6 text-blue-600" />
              QR Scanner
            </h1>
            <p className="text-xs sm:text-sm text-slate-500">Scan supplier labels, barcodes or search models in real-time</p>
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

        <ScannerView onScan={handleScan} />

        <div ref={manualSearchRef} className="relative mb-4 z-20">
          <form onSubmit={handleManualSubmit} className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder='Search Model Name, Product or SKU (e.g. "2mm", "Vivo", "F31")...'
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

            <button
              type="button"
              onClick={() => setIsBatchModalOpen(true)}
              className="px-3 py-2.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 font-bold text-xs rounded-xl shadow-xs transition-colors shrink-0 flex items-center gap-1.5"
              title="Upload batch model quantities (e.g. A6PRO-15, OP F33-13)"
            >
              <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
              <span className="hidden sm:inline">Batch Models</span>
            </button>
          </form>

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

        {/* Material selection after a supplier label resolves to a model. */}
        <AnimatePresence>
          {materialPicker && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-md flex items-center justify-center p-4"
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.94, y: 16 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.94, y: 16 }}
                className="bg-white rounded-3xl p-5 sm:p-6 w-full max-w-md shadow-2xl border border-slate-200"
              >
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-wider text-blue-600 mb-1">Supplier label recognized</div>
                    <h3 className="text-xl font-black text-slate-900">{materialPicker.canonicalModel}</h3>
                    <p className="text-xs text-slate-500 mt-1">
                      Label <span className="font-mono font-bold text-slate-800">{materialPicker.rawLabel}</span> can represent multiple materials.
                    </p>
                  </div>
                  <button type="button" onClick={() => setMaterialPicker(null)} className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-xl">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="space-y-2 max-h-[55vh] overflow-y-auto pr-1">
                  {materialPicker.candidates.map((m) => {
                    const qty = Number(m.current_qty) || 0
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={async () => {
                          const picker = materialPicker
                          setMaterialPicker(null)
                          // Permanently link this label to the chosen material
                          if (linkLabelToMaterial && picker.rawLabel) {
                            updateSupplierModelLabelMaterial(supabase, picker.rawLabel, m.id).catch(() => {})
                          }
                          await queueMaterial(m, picker.direction, picker.rawLabel)
                        }}
                        className="w-full p-3.5 rounded-2xl border border-slate-200 hover:border-blue-300 hover:bg-blue-50 text-left transition-colors"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="font-extrabold text-slate-900">{m.name}</div>
                            <div className="text-xs text-slate-500 mt-0.5">SKU {m.sku}{m.unit ? ` • ${m.unit}` : ''}</div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="font-black text-slate-900">{qty.toLocaleString()}</div>
                            <div className="text-[10px] font-semibold text-slate-400">current stock</div>
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>

                {/* Remember for this label toggle */}
                {materialPicker.rawLabel && (
                  <label className="flex items-center gap-2.5 mt-3 px-3 py-2.5 rounded-xl bg-amber-50 border border-amber-200 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={linkLabelToMaterial}
                      onChange={(e) => setLinkLabelToMaterial(e.target.checked)}
                      className="w-4 h-4 rounded accent-amber-600"
                    />
                    <div>
                      <div className="text-xs font-bold text-amber-900">Remember for this label</div>
                      <div className="text-[10px] text-amber-700">Next time <span className="font-mono font-bold">{materialPicker.rawLabel}</span> is scanned, it will auto-select this material</div>
                    </div>
                  </label>
                )}

                {isOwner && materialPicker.direction === 'in' && (
                  <button
                    type="button"
                    onClick={() => {
                      setMaterialPicker(null)
                      setMaterialCreator({
                        rawLabel: materialPicker.rawLabel,
                        canonicalModel: materialPicker.canonicalModel,
                        direction: materialPicker.direction,
                        materialName: '',
                      })
                    }}
                    className="w-full mt-3 py-3 rounded-xl border border-dashed border-blue-300 bg-blue-50 text-blue-700 font-bold text-sm hover:bg-blue-100 transition-colors flex items-center justify-center gap-2"
                  >
                    <Plus className="w-4 h-4" />
                    Create New Material for {materialPicker.canonicalModel}
                  </button>
                )}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Create the first material after a new supplier label/model is mapped. */}
        <AnimatePresence>
          {materialCreator && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-md flex items-center justify-center p-4"
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.94, y: 16 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.94, y: 16 }}
                className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl border border-slate-200"
              >
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-600 mb-1">Model mapped</div>
                    <h3 className="text-xl font-black text-slate-900">{materialCreator.canonicalModel}</h3>
                    <p className="text-xs text-slate-500 mt-1">Supplier label <span className="font-mono font-bold text-slate-800">{materialCreator.rawLabel}</span> needs a material record.</p>
                  </div>
                  <button type="button" onClick={() => setMaterialCreator(null)} className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-xl"><X className="w-5 h-5" /></button>
                </div>

                <form onSubmit={handleCreateMappedMaterial} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Material name *</label>
                    <input
                      value={materialCreator.materialName}
                      onChange={(e) => setMaterialCreator({ ...materialCreator, materialName: e.target.value })}
                      placeholder="e.g. 2MM Silicon"
                      autoFocus
                      required
                      className="w-full px-3.5 py-3 bg-slate-50 border border-slate-300 rounded-xl text-sm font-semibold focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                    <p className="text-[11px] text-slate-500 mt-1.5">The model stays <strong>{materialCreator.canonicalModel}</strong>. Only the material changes.</p>
                  </div>

                  <div className="bg-slate-50 rounded-xl border border-slate-200 p-3">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Auto SKU</div>
                    <div className="font-mono font-bold text-slate-700 text-sm mt-1">{generateSkuForModel(materialCreator.canonicalModel, materials, materialCreator.materialName || 'Material')}</div>
                  </div>

                  <div className="flex gap-2 pt-1">
                    <button type="submit" disabled={!materialCreator.materialName.trim() || creatingMaterial} className="flex-1 py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl disabled:opacity-50">
                      {creatingMaterial ? 'Creating...' : 'Create & Add to Queue'}
                    </button>
                    <button type="button" onClick={() => setMaterialCreator(null)} className="px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-sm rounded-xl">Cancel</button>
                  </div>
                </form>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Teach a new supplier label during inward. */}
        <AnimatePresence>
          {unknownLabel && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-md flex items-center justify-center p-4"
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.94, y: 16 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.94, y: 16 }}
                className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl border border-slate-200"
              >
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                      <Sparkles className="w-5 h-5 text-amber-500" />
                      Teach Supplier Label
                    </h3>
                    <p className="text-xs text-slate-500 mt-1">
                      <span className="font-mono font-bold text-slate-800 bg-slate-100 px-1.5 py-0.5 rounded">{unknownLabel}</span>
                    </p>
                  </div>
                  <button type="button" onClick={() => setUnknownLabel(null)} className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-xl">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <form onSubmit={handleUnknownLabelSave} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Canonical model</label>
                    <input
                      list="supplier-model-options"
                      value={unknownLabelModel}
                      onChange={(e) => setUnknownLabelModel(e.target.value)}
                      placeholder="e.g. OPPO F31"
                      autoFocus
                      required
                      className="w-full px-3.5 py-3 bg-slate-50 border border-slate-300 rounded-xl text-sm font-semibold focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                    <datalist id="supplier-model-options">
                      {modelOptions.map((model) => <option key={model} value={model} />)}
                    </datalist>
                    <p className="text-[11px] text-slate-500 mt-1.5">Choose the phone/model identity, not the material. Material is selected next.</p>
                  </div>

                  <button
                    type="submit"
                    disabled={!unknownLabelModel.trim() || savingLabel}
                    className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl disabled:opacity-50"
                  >
                    {savingLabel ? 'Saving mapping...' : 'Save Model Mapping'}
                  </button>
                </form>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

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
                <button type="button" onClick={() => setScannedPopup(null)} className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 transition-colors">
                  <X className="w-5 h-5" />
                </button>

                <div className={`mx-auto w-14 h-14 rounded-2xl flex items-center justify-center mb-3 shadow-md ${
                  scannedPopup.direction === 'in'
                    ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                    : 'bg-rose-100 text-rose-700 border border-rose-200'
                }`}>
                  {scannedPopup.direction === 'in' ? <ArrowDownCircle className="w-8 h-8" /> : <ArrowUpCircle className="w-8 h-8" />}
                </div>

                <div className="mb-1">
                  <span className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider ${
                    scannedPopup.direction === 'in' ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800'
                  }`}>
                    {scannedPopup.direction === 'in' ? 'Stock Inward' : 'Stock Outward'}
                  </span>
                </div>

                <h3 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight leading-tight mt-1 mb-0.5">
                  {scannedPopup.model || 'Standard Variant / Model'}
                </h3>

                <h5 className="text-sm font-semibold text-slate-500 mb-4">
                  {scannedPopup.name}
                </h5>

                {scannedPopup.supplierLabel && (
                  <div className="text-[11px] text-slate-400 mb-3">Supplier label: <span className="font-mono font-semibold text-slate-600">{scannedPopup.supplierLabel}</span></div>
                )}

                <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200 mb-4">
                  <div className="text-[11px] font-bold text-slate-400 uppercase mb-2">Scanned Quantity ({scannedPopup.unit || 'pcs'})</div>
                  <div className="flex items-center justify-center gap-3">
                    <button type="button" onClick={() => adjustPopupQty(-1)} className="w-10 h-10 rounded-xl bg-white border border-slate-200 shadow-xs flex items-center justify-center text-slate-700 font-bold hover:bg-slate-100 active:scale-95 transition-all">
                      <Minus className="w-4 h-4" />
                    </button>
                    <div className="w-16 text-center font-black text-2xl text-slate-900">{scannedPopup.qty}</div>
                    <button type="button" onClick={() => adjustPopupQty(1)} className="w-10 h-10 rounded-xl bg-white border border-slate-200 shadow-xs flex items-center justify-center text-slate-700 font-bold hover:bg-slate-100 active:scale-95 transition-all">
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="flex items-center justify-center gap-2 mt-2.5">
                    {[5, 10, 25, 50].map((num) => (
                      <button key={num} type="button" onClick={() => adjustPopupQty(num)} className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 transition-colors">
                        +{num}
                      </button>
                    ))}
                  </div>
                </div>

                <button type="button" onClick={() => setScannedPopup(null)} className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm rounded-xl shadow-lg shadow-blue-600/30 active:scale-[0.98] transition-all flex items-center justify-center gap-2">
                  <Check className="w-4 h-4" />
                  <span>Done / Scan Next</span>
                </button>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Existing internal SKU quick-add flow, retained for normal barcode registration. */}
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
                      <span className="font-mono font-bold text-slate-800 bg-slate-100 px-1.5 py-0.5 rounded">{unknownSku}</span>
                    </p>
                  </div>
                  <button type="button" onClick={() => setUnknownSku(null)} className="p-1 rounded-lg text-slate-400 hover:bg-slate-100"><X className="w-5 h-5" /></button>
                </div>

                <form onSubmit={handleQuickAdd} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Material / Product Name *</label>
                    <input placeholder="e.g. Cotton T-Shirt White" value={quickAdd.name} onChange={(e) => setQuickAdd({ ...quickAdd, name: e.target.value })} required autoFocus className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Model / Variant (Optional)</label>
                    <input placeholder="e.g. Size L / SKU-01" value={quickAdd.model} onChange={(e) => setQuickAdd({ ...quickAdd, model: e.target.value })} className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600" />
                  </div>
                  <div className="flex gap-2 pt-2">
                    <button type="submit" disabled={addingMaterial} className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm rounded-xl shadow-md shadow-blue-600/30 transition-all disabled:opacity-50">{addingMaterial ? 'Registering...' : 'Register & Add to Queue'}</button>
                    <button type="button" onClick={() => setUnknownSku(null)} className="px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-sm rounded-xl">Cancel</button>
                  </div>
                </form>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

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

        <QueueList />

        {queueItems.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="sticky bottom-20 sm:bottom-6 z-30 pt-3">
            <button type="button" onClick={handleSubmit} disabled={submitting || validItemsCount === 0} className="w-full py-4 px-6 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold text-base rounded-2xl shadow-xl shadow-blue-600/30 active:scale-[0.99] transition-all disabled:opacity-50 flex items-center justify-center gap-2.5">
              {submitting ? (
                <><div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /><span>Syncing Queue to Cloud...</span></>
              ) : (
                <><UploadCloud className="w-5 h-5" /><span>Submit Queue ({validItemsCount} of {queueItems.length} items ready)</span></>
              )}
            </button>
          </motion.div>
        )}
      </main>

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

      <ProductReportModal
        isOpen={isReportOpen}
        onClose={() => setIsReportOpen(false)}
        materials={materials}
        initialProductName={reportProduct}
      />

      <BatchModelAddModal
        isOpen={isBatchModalOpen}
        onClose={() => setIsBatchModalOpen(false)}
        materials={materials}
        onSuccess={loadMaterials}
      />
    </div>
  )
}
