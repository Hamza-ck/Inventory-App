import { useCallback, useState, useRef, useEffect } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  ArrowDownCircle, 
  ArrowUpCircle, 
  Plus, 
  UploadCloud, 
  CheckCircle2, 
  AlertTriangle, 
  X, 
  QrCode, 
  Package, 
  Search,
  Sparkles
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabaseClient'
import { db, addToQueue } from '../lib/db'
import { submitQueue } from '../lib/sync'
import ScannerView from '../components/ScannerView'
import QueueList from '../components/QueueList'
import Nav from '../components/Nav'

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

  useEffect(() => {
    directionRef.current = direction
  }, [direction])

  useEffect(() => {
    isOwnerRef.current = isOwner
  }, [isOwner])

  const queueItems = useLiveQuery(() => db.queue.toArray(), []) || []
  const validItemsCount = queueItems.filter((i) => Number(i.qty) > 0).length

  // Stable scan handler that doesn't need to be recreated on direction change
  const handleScan = useCallback(async (rawSku) => {
    const sku = rawSku.trim()
    if (!sku) return
    const currentDirection = directionRef.current
    const ownerStatus = isOwnerRef.current

    let name = null
    try {
      const { data } = await supabase.from('materials').select('name').eq('sku', sku).single()
      name = data?.name ?? null
      if (name) await db.materialsCache.put({ sku, name, updatedAt: new Date().toISOString() })
    } catch {
      const cached = await db.materialsCache.get(sku)
      name = cached?.name ?? null
    }

    if (!name && ownerStatus) {
      setUnknownSku(sku)
      setQuickAdd({ name: '', model: '' })
      setStatusType('warning')
      setStatus(`Unregistered SKU: "${sku}". Register material details below.`)
      return
    }

    await addToQueue({ sku, name, direction: currentDirection })
    if (name) {
      setStatusType('success')
      setStatus(`Added "${name}" to queue (${currentDirection === 'in' ? 'Inward / Stock In' : 'Outward / Stock Out'})`)
    } else {
      setStatusType('warning')
      setStatus(`Added unregistered SKU (${sku}) — ask owner to register before syncing`)
    }
  }, [])

  function handleManualSubmit(e) {
    e.preventDefault()
    if (!manualSku.trim()) return
    handleScan(manualSku.trim())
    setManualSku('')
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
      updatedAt: new Date().toISOString(),
    })
    await addToQueue({ sku: unknownSku, name: quickAdd.name.trim(), direction })
    setStatusType('success')
    setStatus(`✓ Registered "${quickAdd.name.trim()}" and added to queue`)
    setUnknownSku(null)
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
            <p className="text-xs sm:text-sm text-slate-500">Scan shelf barcodes or items in real-time</p>
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
        <div className="grid grid-cols-2 gap-2 p-1.5 bg-slate-200/80 rounded-2xl border border-slate-300/60 mb-5 shadow-inner">
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

        {/* Manual SKU Input Form */}
        <form onSubmit={handleManualSubmit} className="flex gap-2 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Or type/paste SKU manually..."
              value={manualSku}
              onChange={(e) => setManualSku(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-white rounded-xl border border-slate-300 text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent shadow-sm"
            />
          </div>
          <button
            type="submit"
            disabled={!manualSku.trim()}
            className="px-5 py-2.5 bg-white hover:bg-slate-50 text-slate-800 font-semibold text-sm rounded-xl border border-slate-300 shadow-sm active:scale-95 transition-all disabled:opacity-50 disabled:pointer-events-none flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" /> Add
          </button>
        </form>

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
    </div>
  )
}
