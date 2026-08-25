import { useLiveQuery } from 'dexie-react-hooks'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowDown, ArrowUp, Trash2, Plus, Minus, Inbox } from 'lucide-react'
import { db, updateQueueQty, removeFromQueue } from '../lib/db'

export default function QueueList() {
  const items = useLiveQuery(() => db.queue.orderBy('createdAt').reverse().toArray(), [])

  if (!items) return null

  if (items.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex flex-col items-center justify-center p-8 bg-white border border-dashed border-slate-300 rounded-2xl text-center mb-6 shadow-sm"
      >
        <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400 mb-3">
          <Inbox className="w-6 h-6" />
        </div>
        <p className="font-semibold text-slate-800 text-sm mb-1">Scan Queue is Empty</p>
        <p className="text-xs text-slate-500 max-w-xs">
          Scan a QR code or enter a SKU above to queue inward or outward items.
        </p>
      </motion.div>
    )
  }

  function adjustQty(id, currentQty, delta) {
    const current = Number(currentQty) || 0
    const next = Math.max(0, current + delta)
    updateQueueQty(id, next === 0 ? '' : String(next))
  }

  return (
    <div className="space-y-3 mb-6">
      <AnimatePresence>
        {items.map((item) => {
          const isIn = item.direction === 'in'
          return (
            <motion.div
              key={item.id}
              layout
              initial={{ opacity: 0, y: 10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.15 } }}
              className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-sm hover:shadow-md transition-shadow"
            >
              {/* Card Top */}
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="min-w-0 flex-1">
                  <h4 className="font-bold text-slate-900 text-sm sm:text-base leading-tight truncate">
                    {item.name || 'Unregistered Material'}
                  </h4>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="font-mono text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200">
                      {item.sku}
                    </span>
                  </div>
                </div>

                <span
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold shrink-0 ${
                    isIn
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : 'bg-rose-50 text-rose-700 border border-rose-200'
                  }`}
                >
                  {isIn ? (
                    <>
                      <ArrowDown className="w-3.5 h-3.5" /> Inward
                    </>
                  ) : (
                    <>
                      <ArrowUp className="w-3.5 h-3.5" /> Outward
                    </>
                  )}
                </span>
              </div>

              {/* Card Bottom: Stepper and Presets */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-100">
                {/* Stepper Input */}
                <div className="flex items-center bg-slate-100 rounded-xl p-1 border border-slate-200">
                  <button
                    type="button"
                    onClick={() => adjustQty(item.id, item.qty, -1)}
                    className="w-8 h-8 rounded-lg bg-white shadow-xs border border-slate-200 flex items-center justify-center text-slate-700 hover:bg-slate-50 active:scale-95 transition-all"
                    aria-label="Decrease quantity"
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>

                  <input
                    type="number"
                    min="0"
                    inputMode="numeric"
                    placeholder="Qty"
                    value={item.qty}
                    onChange={(e) => updateQueueQty(item.id, e.target.value)}
                    className="w-14 text-center font-bold text-slate-900 bg-transparent text-sm focus:outline-none"
                  />

                  <button
                    type="button"
                    onClick={() => adjustQty(item.id, item.qty, 1)}
                    className="w-8 h-8 rounded-lg bg-white shadow-xs border border-slate-200 flex items-center justify-center text-slate-700 hover:bg-slate-50 active:scale-95 transition-all"
                    aria-label="Increase quantity"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Quick Add Presets */}
                <div className="flex items-center gap-1.5">
                  {[5, 10, 50].map((amount) => (
                    <button
                      key={amount}
                      type="button"
                      onClick={() => adjustQty(item.id, item.qty, amount)}
                      className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-slate-100 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 border border-slate-200 text-slate-600 active:scale-95 transition-all"
                    >
                      +{amount}
                    </button>
                  ))}
                </div>

                {/* Remove button */}
                <button
                  type="button"
                  onClick={() => removeFromQueue(item.id)}
                  className="p-2 text-rose-500 hover:bg-rose-50 rounded-xl transition-colors ml-auto"
                  title="Remove from queue"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}
