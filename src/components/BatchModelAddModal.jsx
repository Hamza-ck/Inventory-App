import { useState, useMemo, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Sparkles,
  X,
  Check,
  CheckCheck,
  AlertTriangle,
  ArrowRight,
  RotateCcw,
  Plus,
  Minus,
  Trash2,
  Boxes,
  ArrowDownCircle,
  ArrowUpCircle,
  Search,
  CheckCircle2,
  Copy,
  Layers,
  Tag,
  Hash
} from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { db } from '../lib/db'
import { useAuth } from '../context/AuthContext'
import {
  parseBatchInput,
  matchModelToMaterials,
  detectProductSkuPrefix,
  getNextSequentialSku,
} from '../lib/modelMatcher'

const SAMPLE_TEXT = `A6PRO-15\nOP F33-13\nREALME 14-32\nREALME 16T-7`

export default function BatchModelAddModal({ isOpen, onClose, materials = [], onSuccess }) {
  if (!isOpen) return null

  return (
    <BatchModelAddModalContent
      onClose={onClose}
      materials={materials}
      onSuccess={onSuccess}
    />
  )
}

function BatchModelAddModalContent({ onClose, materials = [], onSuccess }) {
  const { user } = useAuth()

  // Distinct existing product names and counts
  const productSummary = useMemo(() => {
    const map = new Map()
    materials.forEach((m) => {
      const name = (m.name || '').trim()
      if (!name) return
      map.set(name, (map.get(name) || 0) + 1)
    })
    const list = Array.from(map.entries()).map(([name, count]) => ({ name, count }))
    list.sort((a, b) => b.count - a.count)
    return list
  }, [materials])

  const distinctProductNames = useMemo(
    () => productSummary.map((p) => p.name),
    [productSummary]
  )

  // Step 1: Input & Configuration | Step 2: Link Verification | Step 3: Done
  const [step, setStep] = useState(1)
  const [rawText, setRawText] = useState('')
  const [direction, setDirection] = useState('in') // 'in' (Add Stock) | 'out' (Deduct Stock)

  // Target Material / Product Name
  const initialProduct = distinctProductNames.includes('2MM')
    ? '2MM'
    : distinctProductNames[0] || 'Clear maxsafe'
  const [selectedProduct, setSelectedProduct] = useState(initialProduct)
  const [customProductInput, setCustomProductInput] = useState('')
  const [isCustomProduct, setIsCustomProduct] = useState(false)

  // Active product name
  const effectiveProduct = (isCustomProduct ? customProductInput : selectedProduct).trim()

  // SKU Prefix (e.g. "mag-clear_mag-", "sil-2mm-")
  const [skuPrefix, setSkuPrefix] = useState(() =>
    detectProductSkuPrefix(initialProduct, materials)
  )

  // Update SKU Prefix whenever active product changes
  useEffect(() => {
    if (effectiveProduct) {
      const autoPrefix = detectProductSkuPrefix(effectiveProduct, materials)
      setSkuPrefix(autoPrefix)
    }
  }, [effectiveProduct, materials])

  // Sample SKU preview (e.g., sil-2mm-0001)
  const sampleNextSku = useMemo(() => {
    return getNextSequentialSku(skuPrefix, materials)
  }, [skuPrefix, materials])

  // Step 2 Review Items
  const [items, setItems] = useState([])
  const [searchingRowId, setSearchingRowId] = useState(null)
  const [rowSearchQuery, setRowSearchQuery] = useState('')

  // Step 3 Execution
  const [isProcessing, setIsProcessing] = useState(false)
  const [processError, setProcessError] = useState(null)
  const [summaryReport, setSummaryReport] = useState(null)
  const [copiedSummary, setCopiedSummary] = useState(false)

  // Quick helper to load user's sample data
  function handleLoadSample() {
    setRawText(SAMPLE_TEXT)
  }

  // Handle Analyzing Input
  function handleAnalyzeInput() {
    if (!effectiveProduct) {
      alert('Please select or enter which Material/Product these models belong to (e.g., 2MM, Clear maxsafe).')
      return
    }

    const parsed = parseBatchInput(rawText)
    if (parsed.length === 0) {
      alert('Please enter at least one model and quantity (e.g. A6PRO-15).')
      return
    }

    const usedSkusInBatch = new Set()

    const reviewed = parsed.map((item) => {
      // Scoped matching specifically for the selected product/material!
      const matchResult = matchModelToMaterials(item.rawModel, materials, effectiveProduct)
      const isMatched = !!matchResult.bestMatch
      const isNewSku = !isMatched

      // Generate sequential SKU if new model
      let assignedSku = ''
      if (isNewSku) {
        assignedSku = getNextSequentialSku(skuPrefix, materials, usedSkusInBatch)
        usedSkusInBatch.add(assignedSku.toLowerCase())
      } else {
        assignedSku = matchResult.bestMatch.sku
      }

      return {
        id: item.id,
        rawLine: item.rawLine,
        rawModel: item.rawModel,
        expandedModel: item.expandedModel,
        qty: item.qty,
        isNewSku,
        // Mark as verified if exact or high match; allow user to toggle/re-link
        isVerified: isMatched ? matchResult.confidence !== 'medium' : true,
        confidence: matchResult.confidence,
        matchedMaterial: matchResult.bestMatch,
        otherProductMatch: matchResult.otherProductMatch,
        suggestions: matchResult.suggestions || [],
        // SKU & Product details
        newSku: assignedSku,
        targetProductName: effectiveProduct,
        newModel: item.expandedModel || item.rawModel,
        newUnit: 'pcs',
        newThreshold: 5,
      }
    })

    setItems(reviewed)
    setStep(2)
  }

  // Update item field
  function updateItem(id, updater) {
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, ...updater } : it))
    )
  }

  // Toggle verification checkbox
  function toggleVerify(id) {
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, isVerified: !it.isVerified } : it))
    )
  }

  // Toggle between "Link Existing" and "Create New SKU"
  function toggleMode(id) {
    setItems((prev) => {
      const usedSkus = new Set(prev.filter((x) => x.id !== id && x.isNewSku).map((x) => x.newSku.toLowerCase()))
      return prev.map((it) => {
        if (it.id !== id) return it
        const nextIsNew = !it.isNewSku
        let nextSku = it.newSku
        if (nextIsNew && (!nextSku || !nextSku.startsWith(skuPrefix))) {
          nextSku = getNextSequentialSku(skuPrefix, materials, usedSkus)
        }
        return {
          ...it,
          isNewSku: nextIsNew,
          newSku: nextSku,
          isVerified: true,
        }
      })
    })
  }

  // Select a different material to link
  function selectMaterialForLink(itemId, material) {
    setItems((prev) =>
      prev.map((it) => {
        if (it.id !== itemId) return it
        return {
          ...it,
          isNewSku: false,
          matchedMaterial: material,
          targetProductName: material.name,
          confidence: 'exact',
          isVerified: true,
        }
      })
    )
    setSearchingRowId(null)
    setRowSearchQuery('')
  }

  // Quantity helpers
  function adjustQty(id, delta) {
    setItems((prev) =>
      prev.map((it) => {
        if (it.id !== id) return it
        const next = Math.max(1, (Number(it.qty) || 1) + delta)
        return { ...it, qty: next }
      })
    )
  }

  function setItemQty(id, val) {
    const num = Math.max(1, Number(val) || 1)
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, qty: num } : it))
    )
  }

  function removeItem(id) {
    setItems((prev) => prev.filter((it) => it.id !== id))
  }

  function handleVerifyAll() {
    setItems((prev) => prev.map((it) => ({ ...it, isVerified: true })))
  }

  // Summary statistics
  const stats = useMemo(() => {
    const total = items.length
    const matched = items.filter((i) => !i.isNewSku && i.matchedMaterial).length
    const newSkus = items.filter((i) => i.isNewSku).length
    const verified = items.filter((i) => i.isVerified).length
    const totalQty = items.reduce((acc, i) => acc + (Number(i.qty) || 0), 0)
    return { total, matched, newSkus, verified, totalQty }
  }, [items])

  // Filtered materials for inline link changer
  const inlineSearchMaterials = useMemo(() => {
    if (!rowSearchQuery.trim()) {
      return materials.filter((m) => m.name === effectiveProduct).slice(0, 10)
    }
    const q = rowSearchQuery.toLowerCase()
    return materials
      .filter(
        (m) =>
          (m.name || '').toLowerCase().includes(q) ||
          (m.model || '').toLowerCase().includes(q) ||
          (m.sku || '').toLowerCase().includes(q)
      )
      .slice(0, 10)
  }, [materials, rowSearchQuery, effectiveProduct])

  // Execution
  async function handleConfirmAndApply() {
    if (items.length === 0) return
    const readyItems = items.filter((i) => i.isVerified)
    if (readyItems.length === 0) {
      alert('Please check at least one product before submitting.')
      return
    }

    setIsProcessing(true)
    setProcessError(null)

    const updatedItems = []
    const createdSkus = []
    let failedCount = 0

    try {
      for (const item of readyItems) {
        let materialId = null
        let targetMaterial = item.matchedMaterial
        const qtyNum = Number(item.qty) || 1

        // Case 1: Create New SKU in `materials`
        if (item.isNewSku || !targetMaterial) {
          const skuCode = (item.newSku || getNextSequentialSku(skuPrefix, materials)).trim()
          const newPayload = {
            sku: skuCode,
            name: (item.targetProductName || effectiveProduct).trim(),
            model: (item.newModel || item.rawModel).trim(),
            unit: (item.newUnit || 'pcs').trim(),
            current_qty: 0, // Trigger trg_apply_transaction will update current_qty on transaction insert
            reorder_threshold: Number(item.newThreshold) || 5,
          }

          const { data: insertedData, error: insertError } = await supabase
            .from('materials')
            .insert(newPayload)
            .select()
            .single()

          if (insertError) {
            console.error('Failed to create SKU:', skuCode, insertError)
            failedCount++
            continue
          }

          materialId = insertedData.id
          targetMaterial = insertedData
          createdSkus.push(insertedData)

          await db.materialsCache.put({
            sku: insertedData.sku,
            name: insertedData.name,
            model: insertedData.model || '',
            updatedAt: new Date().toISOString(),
          })
        } else {
          materialId = targetMaterial.id
        }

        // Case 2: Log Inward/Outward transaction
        const { error: txError } = await supabase.from('transactions').insert({
          material_id: materialId,
          qty: qtyNum,
          direction,
          user_id: user?.id,
        })

        if (txError) {
          console.error('Failed to record transaction for:', targetMaterial.sku, txError)
          failedCount++
          continue
        }

        const oldQty = Number(targetMaterial.current_qty) || 0
        const newQty = direction === 'in' ? oldQty + qtyNum : Math.max(0, oldQty - qtyNum)

        updatedItems.push({
          sku: targetMaterial.sku,
          name: targetMaterial.name,
          model: targetMaterial.model || item.rawModel,
          addedQty: qtyNum,
          oldQty,
          newQty,
          isNew: item.isNewSku,
        })
      }

      setSummaryReport({
        totalProcessed: readyItems.length,
        succeeded: updatedItems.length,
        failed: failedCount,
        createdSkusCount: createdSkus.length,
        updatedStockCount: updatedItems.filter((u) => !u.isNew).length,
        totalQuantityAdded: updatedItems.reduce((a, b) => a + b.addedQty, 0),
        direction,
        targetProduct: effectiveProduct,
        details: updatedItems,
      })

      setStep(3)
      if (onSuccess) onSuccess()
    } catch (err) {
      setProcessError(err.message || 'An unexpected error occurred.')
    } finally {
      setIsProcessing(false)
    }
  }

  function handleCopySummary() {
    if (!summaryReport) return
    const lines = [
      `📦 INVENTORY BATCH UPDATE: ${summaryReport.targetProduct.toUpperCase()}`,
      `Movement: ${summaryReport.direction === 'in' ? 'INWARD (+)' : 'OUTWARD (-)'}`,
      `Date: ${new Date().toLocaleString()}`,
      `Total Items: ${summaryReport.succeeded} | Total Qty: ${summaryReport.totalQuantityAdded}`,
      `New SKUs Created: ${summaryReport.createdSkusCount}`,
      `Existing Models Updated: ${summaryReport.updatedStockCount}`,
      '----------------------------------------',
      ...summaryReport.details.map(
        (d) =>
          `• ${d.model || d.name} [${d.sku}]: ${summaryReport.direction === 'in' ? '+' : '-'}${d.addedQty} (Stock: ${d.oldQty} -> ${d.newQty})${d.isNew ? ' [NEW SKU]' : ''}`
      ),
    ]

    navigator.clipboard.writeText(lines.join('\n'))
    setCopiedSummary(true)
    setTimeout(() => setCopiedSummary(false), 2500)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-sm overflow-y-auto no-print">
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 10 }}
        className="bg-white rounded-3xl border border-slate-200/90 shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden my-auto"
      >
        {/* Modal Header */}
        <div className="px-5 py-4 sm:px-6 sm:py-5 border-b border-slate-100 bg-linear-to-r from-blue-50/70 via-indigo-50/50 to-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-md shadow-indigo-500/20">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-slate-900 flex items-center gap-2">
                Batch Model Upload & Stock Add
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 uppercase tracking-wider">
                  Model Recognition
                </span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Upload model lists (e.g. A6PRO-15), link to your selected material/product, and add stock
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {/* STEP 1: TARGET MATERIAL SELECTION & INPUT */}
          {step === 1 && (
            <div className="space-y-6">
              {/* SECTION 1: Which Material / Product are these models for? */}
              <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-br from-indigo-50/60 to-blue-50/40 border border-indigo-100/80 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Tag className="w-5 h-5 text-indigo-600" />
                    <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                      1. Which Material / Product are these model uploads for?
                    </h3>
                  </div>
                  <span className="text-xs font-semibold text-indigo-700 bg-white px-2.5 py-1 rounded-lg border border-indigo-200 shadow-2xs">
                    Required
                  </span>
                </div>

                {/* Quick Select Product Badges */}
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-2">
                    Select an existing catalog product, or enter a new product name:
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {productSummary.map((p) => {
                      const isSelected = !isCustomProduct && selectedProduct === p.name
                      return (
                        <button
                          key={p.name}
                          type="button"
                          onClick={() => {
                            setSelectedProduct(p.name)
                            setIsCustomProduct(false)
                          }}
                          className={`px-3 py-2 rounded-xl text-xs font-bold transition-all border flex items-center gap-1.5 ${
                            isSelected
                              ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                              : 'bg-white text-slate-700 border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/50'
                          }`}
                        >
                          <span>{p.name}</span>
                          <span
                            className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                              isSelected ? 'bg-indigo-700 text-indigo-100' : 'bg-slate-100 text-slate-500'
                            }`}
                          >
                            {p.count} models
                          </span>
                        </button>
                      )
                    })}

                    <button
                      type="button"
                      onClick={() => setIsCustomProduct(true)}
                      className={`px-3 py-2 rounded-xl text-xs font-bold transition-all border flex items-center gap-1.5 ${
                        isCustomProduct
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                          : 'bg-white text-slate-700 border-dashed border-slate-300 hover:border-indigo-400 hover:bg-indigo-50/50'
                      }`}
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>+ New Material / Product</span>
                    </button>
                  </div>
                </div>

                {/* Custom Product Input if clicked or active */}
                {isCustomProduct && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="pt-2"
                  >
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                      Type Material / Product Name:
                    </label>
                    <input
                      type="text"
                      value={customProductInput}
                      onChange={(e) => setCustomProductInput(e.target.value)}
                      placeholder="e.g. Clear maxsafe, 2MM, Privacy Glass, Smoke Case..."
                      className="w-full px-3.5 py-2.5 bg-white border border-indigo-300 rounded-xl text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-2xs"
                      autoFocus
                    />
                  </motion.div>
                )}

                {/* SKU Prefix & Sequencing Settings */}
                <div className="pt-3 border-t border-indigo-100/70 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <label className="block font-bold text-slate-700 uppercase tracking-wider mb-1 flex items-center gap-1">
                      <Hash className="w-3.5 h-3.5 text-indigo-600" />
                      <span>SKU Prefix for New Models</span>
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        value={skuPrefix}
                        onChange={(e) => setSkuPrefix(e.target.value)}
                        placeholder="e.g. sil-2mm- or mag-clear_mag-"
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl font-mono font-bold text-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1">
                      e.g. for 2MM: <code className="text-indigo-600 font-mono font-semibold">sil-2mm-</code>, Clear maxsafe: <code className="text-indigo-600 font-mono font-semibold">mag-clear_mag-</code>
                    </p>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 uppercase tracking-wider mb-1">
                      Next Auto-Generated SKU Preview
                    </label>
                    <div className="px-3 py-2 bg-white/80 border border-slate-200 rounded-xl font-mono font-bold text-slate-800 text-xs flex items-center justify-between">
                      <span>{sampleNextSku}</span>
                      <span className="text-[10px] bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded font-sans font-semibold">
                        Auto-incremented
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1">
                      Any new model not already in catalog gets the next sequential SKU.
                    </p>
                  </div>
                </div>
              </div>

              {/* SECTION 2: Movement Direction & Model Data Input */}
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                    <span>2. Paste Model & Quantity Data</span>
                    <span className="text-xs font-normal text-slate-400 lowercase">(for {effectiveProduct || 'selected product'})</span>
                  </h3>

                  <button
                    type="button"
                    onClick={handleLoadSample}
                    className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 hover:underline flex items-center gap-1 self-start sm:self-auto"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Load Example (A6PRO-15, OP F33-13, REALME 14-32...)</span>
                  </button>
                </div>

                {/* Stock Movement Direction Tabs */}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setDirection('in')}
                    className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-xl border text-xs sm:text-sm font-bold transition-all ${
                      direction === 'in'
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <ArrowDownCircle className="w-4 h-4" />
                    <span>Stock Inward (+Add Stock)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setDirection('out')}
                    className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-xl border text-xs sm:text-sm font-bold transition-all ${
                      direction === 'out'
                        ? 'bg-rose-600 text-white border-rose-600 shadow-sm'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <ArrowUpCircle className="w-4 h-4" />
                    <span>Stock Outward (-Deduct Stock)</span>
                  </button>
                </div>

                <textarea
                  rows={7}
                  value={rawText}
                  onChange={(e) => setRawText(e.target.value)}
                  placeholder={`A6PRO-15\nOP F33-13\nREALME 14-32\nREALME 16T-7`}
                  className="w-full p-4 bg-slate-900 text-emerald-400 font-mono text-sm sm:text-base rounded-2xl border border-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder:text-slate-600 shadow-inner"
                />
              </div>

              {/* Form Action Buttons */}
              <div className="pt-2 flex items-center justify-between">
                <div className="text-xs text-slate-500">
                  Adding to product: <strong className="text-indigo-700">{effectiveProduct || 'None selected'}</strong>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-5 py-2.5 rounded-xl border border-slate-300 text-slate-700 text-xs sm:text-sm font-semibold hover:bg-slate-50 transition-colors"
                  >
                    Cancel
                  </button>

                  <button
                    type="button"
                    onClick={handleAnalyzeInput}
                    disabled={!rawText.trim() || !effectiveProduct}
                    className="inline-flex items-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs sm:text-sm font-bold rounded-xl shadow-md shadow-indigo-600/20 transition-all cursor-pointer"
                  >
                    <Sparkles className="w-4 h-4 text-amber-300" />
                    <span>Analyze & Verify Links</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: VERIFICATION & REVIEW SCREEN ("ask user that each product is correctly linked?") */}
          {step === 2 && (
            <div className="space-y-4">
              {/* Summary Metrics Bar */}
              <div className="p-3 sm:p-4 rounded-2xl bg-slate-100/90 border border-slate-200/80 flex flex-wrap items-center justify-between gap-3 text-xs sm:text-sm">
                <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                  <span className="font-bold text-slate-900 flex items-center gap-1.5">
                    <Boxes className="w-4 h-4 text-indigo-600" />
                    Product: <span className="text-indigo-700 font-extrabold">{effectiveProduct}</span>
                  </span>

                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-semibold text-xs">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    {stats.matched} Matched in {effectiveProduct}
                  </span>

                  {stats.newSkus > 0 && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-purple-100 text-purple-800 font-semibold text-xs">
                      <Sparkles className="w-3.5 h-3.5" />
                      {stats.newSkus} New SKUs ({skuPrefix}...)
                    </span>
                  )}

                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-800 font-semibold text-xs">
                    Total Qty: {direction === 'in' ? `+${stats.totalQty}` : `-${stats.totalQty}`}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleVerifyAll}
                    className="inline-flex items-center gap-1 px-3 py-1.5 bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 text-xs font-semibold rounded-lg shadow-xs transition-colors"
                  >
                    <CheckCheck className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Approve All Links</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-slate-500 hover:text-slate-800 text-xs font-semibold rounded-lg hover:bg-slate-200/60 transition-colors"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Back to Config</span>
                  </button>
                </div>
              </div>

              {/* Notice / Instruction for the user */}
              <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>
                    <strong>Review & Confirm Links:</strong> Verify that each model is correctly matched to the intended SKU under <strong>{effectiveProduct}</strong> before updating stock.
                  </span>
                </div>
              </div>

              {/* Items List for User Verification */}
              <div className="space-y-3">
                {items.map((item, index) => {
                  const isLinked = !item.isNewSku && item.matchedMaterial
                  const currentStock = Number(item.matchedMaterial?.current_qty || 0)
                  const projectedStock =
                    direction === 'in'
                      ? currentStock + (Number(item.qty) || 0)
                      : Math.max(0, currentStock - (Number(item.qty) || 0))

                  return (
                    <motion.div
                      key={item.id}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`p-4 rounded-2xl border transition-all ${
                        !item.isVerified
                          ? 'border-amber-300 bg-amber-50/40 shadow-xs'
                          : item.isNewSku
                          ? 'border-purple-200 bg-purple-50/20'
                          : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}
                    >
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        {/* Left: Input string & Parsed Model / Qty */}
                        <div className="flex items-start gap-3 shrink-0">
                          {/* Verified Checkbox */}
                          <div className="pt-1">
                            <button
                              type="button"
                              onClick={() => toggleVerify(item.id)}
                              className={`w-6 h-6 rounded-lg flex items-center justify-center transition-colors border ${
                                item.isVerified
                                  ? 'bg-indigo-600 border-indigo-600 text-white'
                                  : 'bg-white border-slate-300 text-transparent hover:border-indigo-400'
                              }`}
                              title={item.isVerified ? 'Marked as verified' : 'Click to verify and approve'}
                            >
                              <Check className="w-4 h-4 stroke-[3]" />
                            </button>
                          </div>

                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                                #{index + 1}
                              </span>
                              <span className="font-mono text-sm font-bold text-slate-900">
                                {item.rawLine}
                              </span>

                              {/* Confidence Badge */}
                              {isLinked && (
                                <span
                                  className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full ${
                                    item.confidence === 'exact'
                                      ? 'bg-emerald-100 text-emerald-800'
                                      : item.confidence === 'high'
                                      ? 'bg-blue-100 text-blue-800'
                                      : 'bg-amber-100 text-amber-800'
                                  }`}
                                >
                                  {item.confidence === 'exact'
                                    ? '✓ Exact Match'
                                    : item.confidence === 'high'
                                    ? '✓ Auto-Matched'
                                    : '⚠️ Fuzzy Match'}
                                </span>
                              )}

                              {item.isNewSku && (
                                <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-800">
                                  <Sparkles className="w-3 h-3" />
                                  New SKU: {item.newSku}
                                </span>
                              )}
                            </div>

                            {/* Recognized Model & Other Product Note */}
                            <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-slate-500">
                              <span>
                                Recognized: <strong className="text-slate-800">{item.expandedModel || item.rawModel}</strong>
                              </span>
                              {item.otherProductMatch && item.isNewSku && (
                                <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-medium">
                                  Found in &quot;{item.otherProductMatch.name}&quot; &bull; creating new SKU for {effectiveProduct}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Middle: Linked Product Details or New SKU Configuration */}
                        <div className="flex-1 bg-slate-50 rounded-xl p-3 border border-slate-200/80">
                          {isLinked ? (
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                              <div>
                                <p className="text-[11px] font-bold text-indigo-700 uppercase tracking-wider">
                                  Linked To: {item.matchedMaterial.name}
                                </p>
                                <h4 className="text-sm font-bold text-slate-900 leading-tight">
                                  {item.matchedMaterial.model || item.matchedMaterial.name}
                                </h4>
                                <div className="flex items-center gap-2 mt-1 text-xs text-slate-500">
                                  <span className="font-mono bg-white px-1.5 py-0.5 rounded border border-slate-200 font-semibold text-slate-700">
                                    SKU: {item.matchedMaterial.sku}
                                  </span>
                                  <span className="font-medium text-slate-700">
                                    Stock:{' '}
                                    <span className="line-through text-slate-400">{currentStock}</span>{' '}
                                    <ArrowRight className="w-3 h-3 inline text-slate-400" />{' '}
                                    <strong className={direction === 'in' ? 'text-emerald-600 font-extrabold' : 'text-rose-600 font-extrabold'}>
                                      {projectedStock} pcs
                                    </strong>
                                  </span>
                                </div>
                              </div>

                              {/* Re-link or Switch to New SKU Button */}
                              <div className="flex items-center gap-1.5 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSearchingRowId(searchingRowId === item.id ? null : item.id)
                                    setRowSearchQuery('')
                                  }}
                                  className="px-2.5 py-1.5 bg-white hover:bg-slate-100 text-slate-700 font-semibold text-xs rounded-lg border border-slate-300 shadow-xs transition-colors flex items-center gap-1"
                                >
                                  <Search className="w-3 h-3 text-indigo-600" />
                                  <span>Change Link</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => toggleMode(item.id)}
                                  className="px-2.5 py-1.5 bg-white hover:bg-purple-50 text-purple-700 font-semibold text-xs rounded-lg border border-purple-200 shadow-xs transition-colors"
                                  title={`Create as a new SKU under ${effectiveProduct}`}
                                >
                                  <span>Make New SKU</span>
                                </button>
                              </div>
                            </div>
                          ) : (
                            /* New SKU Configuration */
                            <div className="space-y-2">
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-bold text-purple-800 flex items-center gap-1">
                                  <Sparkles className="w-3.5 h-3.5" />
                                  Register New SKU under {effectiveProduct}
                                </span>

                                <button
                                  type="button"
                                  onClick={() => {
                                    setSearchingRowId(searchingRowId === item.id ? null : item.id)
                                    setRowSearchQuery(item.rawModel)
                                  }}
                                  className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 underline"
                                >
                                  Or link to existing SKU
                                </button>
                              </div>

                              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                                <div>
                                  <label className="block text-[10px] font-bold text-slate-500 uppercase">Product Name</label>
                                  <input
                                    type="text"
                                    value={item.targetProductName}
                                    onChange={(e) => updateItem(item.id, { targetProductName: e.target.value })}
                                    className="w-full px-2 py-1 bg-white border border-slate-300 rounded-md font-medium text-slate-900"
                                  />
                                </div>
                                <div>
                                  <label className="block text-[10px] font-bold text-slate-500 uppercase">Model Name</label>
                                  <input
                                    type="text"
                                    value={item.newModel}
                                    onChange={(e) => updateItem(item.id, { newModel: e.target.value })}
                                    className="w-full px-2 py-1 bg-white border border-slate-300 rounded-md font-medium text-slate-900"
                                  />
                                </div>
                                <div className="col-span-2 sm:col-span-1">
                                  <label className="block text-[10px] font-bold text-slate-500 uppercase">New SKU Code</label>
                                  <input
                                    type="text"
                                    value={item.newSku}
                                    onChange={(e) => updateItem(item.id, { newSku: e.target.value })}
                                    className="w-full px-2 py-1 bg-white border border-purple-300 rounded-md font-mono font-bold text-purple-800"
                                  />
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Inline Search Picker for changing link */}
                          {searchingRowId === item.id && (
                            <div className="mt-3 pt-3 border-t border-slate-200">
                              <div className="relative mb-2">
                                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                                <input
                                  type="text"
                                  placeholder={`Search catalog in ${effectiveProduct} or by SKU...`}
                                  value={rowSearchQuery}
                                  onChange={(e) => setRowSearchQuery(e.target.value)}
                                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-indigo-400 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-600"
                                  autoFocus
                                />
                              </div>

                              <div className="max-h-40 overflow-y-auto space-y-1 pr-1">
                                {inlineSearchMaterials.length === 0 ? (
                                  <p className="text-xs text-slate-400 py-1">No matching products found.</p>
                                ) : (
                                  inlineSearchMaterials.map((cand) => (
                                    <button
                                      key={cand.id}
                                      type="button"
                                      onClick={() => selectMaterialForLink(item.id, cand)}
                                      className="w-full text-left p-2 rounded-lg hover:bg-indigo-50 border border-transparent hover:border-indigo-200 flex items-center justify-between text-xs transition-colors"
                                    >
                                      <div>
                                        <span className="font-bold text-slate-900">{cand.name}</span>{' '}
                                        <span className="text-indigo-700 font-medium">({cand.model || 'No model'})</span>
                                        <div className="font-mono text-[10px] text-slate-400">{cand.sku}</div>
                                      </div>
                                      <div className="text-right">
                                        <span className="font-semibold text-slate-700">{cand.current_qty} in stock</span>
                                      </div>
                                    </button>
                                  ))
                                )}
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Right: Quantity Adjuster & Row Delete */}
                        <div className="flex items-center gap-3 shrink-0">
                          <div className="flex items-center border border-slate-300 rounded-xl bg-white overflow-hidden shadow-2xs">
                            <button
                              type="button"
                              onClick={() => adjustQty(item.id, -1)}
                              className="p-1.5 text-slate-600 hover:bg-slate-100"
                            >
                              <Minus className="w-3.5 h-3.5" />
                            </button>
                            <input
                              type="number"
                              min="1"
                              value={item.qty}
                              onChange={(e) => setItemQty(item.id, e.target.value)}
                              className="w-14 text-center font-bold text-xs sm:text-sm text-slate-900 border-x border-slate-200 py-1 focus:outline-none"
                            />
                            <button
                              type="button"
                              onClick={() => adjustQty(item.id, 1)}
                              className="p-1.5 text-slate-600 hover:bg-slate-100"
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          <button
                            type="button"
                            onClick={() => removeItem(item.id)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                            title="Remove this item"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  )
                })}
              </div>

              {/* Error Alert */}
              {processError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs font-semibold flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{processError}</span>
                </div>
              )}

              {/* Footer Confirmation Actions */}
              <div className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="text-xs text-slate-500 text-center sm:text-left">
                  {stats.verified} of {stats.total} items approved to be updated in <strong>{effectiveProduct}</strong>.
                </div>

                <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 text-xs sm:text-sm font-semibold hover:bg-slate-50 transition-colors"
                  >
                    Back to Edit
                  </button>

                  <button
                    type="button"
                    onClick={handleConfirmAndApply}
                    disabled={isProcessing || stats.verified === 0}
                    className="inline-flex items-center justify-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs sm:text-sm font-bold rounded-xl shadow-md shadow-emerald-600/20 transition-all cursor-pointer flex-1 sm:flex-initial"
                  >
                    {isProcessing ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        <span>Updating Stock...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Confirm & Add Stock ({stats.verified} items)</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: SUCCESS SUMMARY REPORT */}
          {step === 3 && summaryReport && (
            <div className="space-y-6 py-2 text-center">
              <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto shadow-inner">
                <Check className="w-8 h-8 stroke-[3]" />
              </div>

              <div>
                <h3 className="text-xl sm:text-2xl font-bold text-slate-900">
                  Stock Successfully Updated!
                </h3>
                <p className="text-xs sm:text-sm text-slate-500 mt-1 max-w-md mx-auto">
                  Processed {summaryReport.succeeded} items in{' '}
                  <strong className="text-indigo-700">{summaryReport.targetProduct}</strong> (
                  {summaryReport.direction === 'in' ? 'Added' : 'Deducted'}{' '}
                  <strong>{summaryReport.totalQuantityAdded}</strong> units).
                </p>
              </div>

              {/* Statistics Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-w-lg mx-auto text-left">
                <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-100">
                  <p className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider">Total Quantity</p>
                  <p className="text-2xl font-extrabold text-emerald-900 mt-0.5">
                    {summaryReport.direction === 'in' ? `+${summaryReport.totalQuantityAdded}` : `-${summaryReport.totalQuantityAdded}`}
                  </p>
                </div>

                <div className="p-3.5 rounded-2xl bg-blue-50 border border-blue-100">
                  <p className="text-[11px] font-bold text-blue-800 uppercase tracking-wider">Models Updated</p>
                  <p className="text-2xl font-extrabold text-blue-900 mt-0.5">
                    {summaryReport.updatedStockCount}
                  </p>
                </div>

                <div className="p-3.5 rounded-2xl bg-purple-50 border border-purple-100 col-span-2 sm:col-span-1">
                  <p className="text-[11px] font-bold text-purple-800 uppercase tracking-wider">New SKUs Created</p>
                  <p className="text-2xl font-extrabold text-purple-900 mt-0.5">
                    {summaryReport.createdSkusCount}
                  </p>
                </div>
              </div>

              {/* Updated items preview */}
              <div className="max-w-lg mx-auto max-h-56 overflow-y-auto border border-slate-200 rounded-2xl p-3 bg-slate-50 text-left space-y-1.5">
                {summaryReport.details.map((d, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between text-xs py-1 border-b border-slate-200/60 last:border-b-0"
                  >
                    <div>
                      <span className="font-bold text-slate-800">{d.model || d.name}</span>{' '}
                      <span className="font-mono text-[10px] text-slate-500">[{d.sku}]</span>
                      {d.isNew && (
                        <span className="ml-1.5 text-[10px] bg-purple-100 text-purple-800 font-bold px-1.5 py-0.2 rounded">
                          NEW SKU
                        </span>
                      )}
                    </div>
                    <div className="font-bold text-emerald-700">
                      +{d.addedQty}{' '}
                      <span className="font-normal text-slate-400">({d.oldQty} → {d.newQty})</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Action Buttons */}
              <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={handleCopySummary}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs sm:text-sm font-semibold transition-colors shadow-xs"
                >
                  {copiedSummary ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                  <span>{copiedSummary ? 'Copied to Clipboard!' : 'Copy Summary Report'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setStep(1)
                    setRawText('')
                    setItems([])
                    setSummaryReport(null)
                  }}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs sm:text-sm font-semibold transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add Another Batch</span>
                </button>

                <button
                  type="button"
                  onClick={onClose}
                  className="px-6 py-2.5 rounded-xl bg-slate-900 hover:bg-black text-white text-xs sm:text-sm font-bold shadow-md transition-colors"
                >
                  Done & Close
                </button>
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  )
}
