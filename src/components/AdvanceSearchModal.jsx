import { useState, useMemo, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Search, 
  X, 
  Package, 
  ArrowDownCircle, 
  ArrowUpCircle, 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  FileText,
  SlidersHorizontal
} from 'lucide-react'
import { advancedFilterMaterials } from '../lib/searchUtils'
import { addToQueue } from '../lib/db'

export default function AdvanceSearchModal({ 
  isOpen, 
  onClose, 
  materials = [], 
  onSelectProductForReport,
  onItemAddedToQueue 
}) {
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all') // 'all' | 'low' | 'out'
  const inputRef = useRef(null)

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50)
    } else {
      setQuery('')
      setStatusFilter('all')
    }
  }, [isOpen])

  // Keyboard shortcut support
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape' && isOpen) {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  const filteredResults = useMemo(() => {
    return advancedFilterMaterials(materials, query, { statusFilter })
  }, [materials, query, statusFilter])

  if (!isOpen) return null

  async function handleQuickQueue(material, direction) {
    await addToQueue({
      sku: material.sku,
      name: material.name,
      direction: direction,
    })
    if (onItemAddedToQueue) {
      onItemAddedToQueue(material, direction)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-md flex items-start justify-center p-4 pt-12 sm:pt-20">
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: -15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: -15 }}
        transition={{ duration: 0.18 }}
        className="bg-white rounded-3xl w-full max-w-3xl shadow-2xl border border-slate-200 flex flex-col max-h-[85vh] overflow-hidden"
      >
        {/* Search Header Bar */}
        <div className="p-4 sm:p-5 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <Search className="w-5 h-5 text-blue-600 shrink-0" />
            <input
              ref={inputRef}
              type="text"
              placeholder="Search across all models, products, or SKUs (e.g. 'Vivo 2mm', 'Cotton L')..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full text-base font-semibold text-slate-900 placeholder:text-slate-400 placeholder:font-normal focus:outline-none bg-transparent"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl shrink-0 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Filter Pills */}
          <div className="flex items-center gap-1.5 mt-3 pt-3 border-t border-slate-100 text-xs">
            <span className="text-slate-400 font-semibold mr-1 flex items-center gap-1">
              <SlidersHorizontal className="w-3 h-3" /> Filter:
            </span>
            <button
              type="button"
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-1 rounded-lg font-bold transition-colors ${
                statusFilter === 'all'
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              All Items ({materials.length})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('low')}
              className={`px-3 py-1 rounded-lg font-bold transition-colors ${
                statusFilter === 'low'
                  ? 'bg-amber-500 text-white'
                  : 'bg-amber-50 text-amber-800 hover:bg-amber-100'
              }`}
            >
              Low Stock
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('out')}
              className={`px-3 py-1 rounded-lg font-bold transition-colors ${
                statusFilter === 'out'
                  ? 'bg-rose-600 text-white'
                  : 'bg-rose-50 text-rose-800 hover:bg-rose-100'
              }`}
            >
              Out of Stock
            </button>
          </div>
        </div>

        {/* Results List */}
        <div className="overflow-y-auto p-4 sm:p-5 flex-1 divide-y divide-slate-100">
          {filteredResults.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <Package className="w-10 h-10 mx-auto mb-2 text-slate-300" />
              <p className="font-semibold text-slate-700 text-sm">No matching inventory items found</p>
              <p className="text-xs text-slate-400 mt-1">Try typing a model name, origin product or SKU code.</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider px-1">
                Showing {filteredResults.length} matches (ranked by relevance)
              </div>

              {filteredResults.map((m) => {
                const qty = Number(m.current_qty) || 0
                const threshold = Number(m.reorder_threshold ?? 0)
                const isOut = qty <= 0
                const isLow = !isOut && qty <= threshold

                return (
                  <div
                    key={m.id}
                    className="p-3.5 rounded-2xl bg-slate-50 hover:bg-blue-50/50 border border-slate-200/80 hover:border-blue-300 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 group"
                  >
                    {/* Item Information */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-extrabold text-slate-900 text-sm sm:text-base group-hover:text-blue-700 transition-colors">
                          {m.model || m.name}
                        </h4>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 ${
                            isOut
                              ? 'bg-rose-100 text-rose-800'
                              : isLow
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-emerald-100 text-emerald-800'
                          }`}
                        >
                          {isOut ? 'Out of stock' : isLow ? 'Low stock' : 'In stock'}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500 mt-1">
                        <span className="font-medium text-slate-700">{m.name}</span>
                        <span className="text-slate-300">•</span>
                        <span className="font-mono bg-white px-1.5 py-0.2 rounded border border-slate-200 text-slate-600">
                          {m.sku}
                        </span>
                        <span className="text-slate-300">•</span>
                        <span className="font-bold text-slate-900">
                          {qty.toLocaleString()} {m.unit || 'pcs'} available
                        </span>
                      </div>
                    </div>

                    {/* Action Tools */}
                    <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                      {/* Report button */}
                      {onSelectProductForReport && (
                        <button
                          type="button"
                          onClick={() => {
                            onSelectProductForReport(m.name)
                            onClose()
                          }}
                          className="px-2.5 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold flex items-center gap-1 transition-colors"
                          title="Generate Report for this product"
                        >
                          <FileText className="w-3.5 h-3.5 text-blue-600" />
                          <span>Report</span>
                        </button>
                      )}

                      {/* Quick Queue Buttons */}
                      <button
                        type="button"
                        onClick={() => handleQuickQueue(m, 'in')}
                        className="px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-bold flex items-center gap-1 transition-colors"
                        title="Add 1 to Inward Scan Queue"
                      >
                        <ArrowDownCircle className="w-3.5 h-3.5" />
                        <span>+ In</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleQuickQueue(m, 'out')}
                        className="px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200 rounded-xl text-xs font-bold flex items-center gap-1 transition-colors"
                        title="Add 1 to Outward Scan Queue"
                      >
                        <ArrowUpCircle className="w-3.5 h-3.5" />
                        <span>- Out</span>
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  )
}
