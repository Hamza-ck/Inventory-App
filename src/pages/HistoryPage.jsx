import { useEffect, useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Clock,
  ArrowDownCircle,
  ArrowUpCircle,
  Search,
  Calendar,
  Filter,
  X,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  History,
  Undo2,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabaseClient'
import Nav from '../components/Nav'

export default function HistoryPage() {
  const { user } = useAuth()
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(true)

  // Filters
  const [searchQuery, setSearchQuery] = useState('')
  const [dateFilter, setDateFilter] = useState('all')
  const [customDate, setCustomDate] = useState(new Date().toISOString().slice(0, 10))
  const [directionFilter, setDirectionFilter] = useState('all')

  // Delete modal state
  const [deletingTx, setDeletingTx] = useState(null)
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // Toast
  const [toastMessage, setToastMessage] = useState(null)

  useEffect(() => {
    if (user) load()
  }, [user])

  async function load() {
    setLoading(true)
    try {
      const { data } = await supabase
        .from('transactions')
        .select(`
          id,
          qty,
          direction,
          created_at,
          material_id,
          user_id,
          materials (
            id,
            sku,
            name,
            model,
            unit
          )
        `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })

      setTransactions(data || [])
    } catch (err) {
      console.error('Error loading history:', err)
    } finally {
      setLoading(false)
    }
  }

  // Filtered transactions
  const filteredTransactions = useMemo(() => {
    const now = new Date()
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
    const oneDayMs = 24 * 60 * 60 * 1000

    return transactions.filter((tx) => {
      const txTime = new Date(tx.created_at).getTime()
      const txDateStr = new Date(tx.created_at).toISOString().slice(0, 10)

      let matchesDate = true
      if (dateFilter === 'today') {
        matchesDate = txTime >= startOfToday
      } else if (dateFilter === 'yesterday') {
        matchesDate = txTime >= startOfToday - oneDayMs && txTime < startOfToday
      } else if (dateFilter === '7days') {
        matchesDate = txTime >= startOfToday - 7 * oneDayMs
      } else if (dateFilter === '30days') {
        matchesDate = txTime >= startOfToday - 30 * oneDayMs
      } else if (dateFilter === 'custom') {
        matchesDate = txDateStr === customDate
      }

      const matchesDirection = directionFilter === 'all' || tx.direction === directionFilter

      const q = searchQuery.toLowerCase().trim()
      const rawMat = tx.materials
      const mat = Array.isArray(rawMat) ? rawMat[0] : rawMat
      const matName = mat?.name?.toLowerCase() || ''
      const matModel = mat?.model?.toLowerCase() || ''
      const matSku = mat?.sku?.toLowerCase() || ''
      const matchesSearch = !q || matName.includes(q) || matModel.includes(q) || matSku.includes(q)

      return matchesDate && matchesDirection && matchesSearch
    })
  }, [transactions, dateFilter, customDate, directionFilter, searchQuery])

  // Summary
  const summary = useMemo(() => {
    let inwardUnits = 0
    let outwardUnits = 0
    filteredTransactions.forEach((tx) => {
      const qty = Number(tx.qty) || 0
      if (tx.direction === 'in') inwardUnits += qty
      else outwardUnits += qty
    })
    return {
      inwardUnits,
      outwardUnits,
      netChange: inwardUnits - outwardUnits,
      count: filteredTransactions.length,
    }
  }, [filteredTransactions])

  // Delete / Undo a transaction
  function openDeleteModal(tx) {
    setDeletingTx(tx)
    setIsDeleteModalOpen(true)
  }

  function closeDeleteModal() {
    setIsDeleteModalOpen(false)
    setDeletingTx(null)
  }

  async function handleDeleteTransaction() {
    if (!deletingTx) return
    setDeleting(true)
    try {
      const { error } = await supabase
        .from('transactions')
        .delete()
        .eq('id', deletingTx.id)

      if (error) throw error

      const rawMat = deletingTx.materials
      const mat = Array.isArray(rawMat) ? rawMat[0] : rawMat
      const productName = mat?.model || mat?.name || 'Item'
      const dirLabel = deletingTx.direction === 'in' ? 'Inward' : 'Outward'

      closeDeleteModal()
      setToastMessage(`\u2713 Undone: ${dirLabel} of ${deletingTx.qty} ${mat?.unit || 'pcs'} "${productName}" \u2014 stock restored`)
      setTimeout(() => setToastMessage(null), 5000)
      load()
    } catch (err) {
      alert(`Could not undo transaction: ${err.message}`)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      <Nav />

      <main className="w-full max-w-4xl mx-auto px-4 sm:px-6 pt-6 pb-24 flex-1">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
              <History className="w-7 h-7 text-blue-600" />
              My History
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
              View your past transactions and undo accidental entries
            </p>
          </div>

          <button
            type="button"
            onClick={load}
            className="self-start sm:self-auto p-2 bg-white hover:bg-slate-100 text-slate-600 rounded-xl border border-slate-200 shadow-xs transition-all"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-blue-600' : ''}`} />
          </button>
        </div>

        {/* Success Toast */}
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

        {/* Search Bar */}
        <div className="relative mb-4">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          <input
            type="text"
            placeholder='Search by product name, model, or SKU...'
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-10 py-2.5 sm:py-3 bg-white border border-slate-300 rounded-xl text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600 shadow-xs"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 rounded-lg"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Filters */}
        <div className="bg-white rounded-2xl p-5 sm:p-6 border border-slate-200/90 shadow-xs mb-6">
          {/* Date Controls */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-5">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center bg-slate-100 p-1 rounded-xl text-xs font-semibold">
                {['today', 'yesterday', '7days', '30days', 'all'].map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setDateFilter(f)}
                    className={`px-3 py-1.5 rounded-lg transition-all capitalize ${
                      dateFilter === f ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                    }`}
                  >
                    {f === '7days' ? '7 Days' : f === '30days' ? '30 Days' : f.charAt(0).toUpperCase() + f.slice(1)}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-1.5 bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-200">
                <Calendar className="w-3.5 h-3.5 text-slate-500" />
                <input
                  type="date"
                  value={customDate}
                  onChange={(e) => {
                    setCustomDate(e.target.value)
                    setDateFilter('custom')
                  }}
                  className="bg-transparent text-xs font-medium text-slate-800 focus:outline-none cursor-pointer"
                />
              </div>
            </div>

            {/* Direction Filter */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-500 flex items-center gap-1">
                <Filter className="w-3.5 h-3.5" /> Direction:
              </span>
              {['all', 'in', 'out'].map((dir) => (
                <button
                  key={dir}
                  type="button"
                  onClick={() => setDirectionFilter(dir)}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold capitalize transition-all ${
                    directionFilter === dir
                      ? dir === 'in'
                        ? 'bg-emerald-600 text-white'
                        : dir === 'out'
                        ? 'bg-rose-600 text-white'
                        : 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {dir === 'all' ? 'All' : dir === 'in' ? 'Inward' : 'Outward'}
                </button>
              ))}
            </div>
          </div>

          {/* Summary Row */}
          <div className="grid grid-cols-3 gap-2 sm:gap-3 p-3 sm:p-4 bg-slate-50 rounded-xl border border-slate-200 mb-5">
            <div className="text-center">
              <div className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase flex items-center justify-center gap-1">
                <ArrowDownCircle className="w-3.5 h-3.5 text-emerald-600" /> Total Inward
              </div>
              <div className="text-sm sm:text-lg font-bold text-emerald-600 mt-1">
                +{summary.inwardUnits.toLocaleString()}
              </div>
            </div>

            <div className="text-center border-x border-slate-200">
              <div className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase flex items-center justify-center gap-1">
                <ArrowUpCircle className="w-3.5 h-3.5 text-rose-600" /> Total Outward
              </div>
              <div className="text-sm sm:text-lg font-bold text-rose-600 mt-1">
                -{summary.outwardUnits.toLocaleString()}
              </div>
            </div>

            <div className="text-center">
              <div className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase">Net Flow</div>
              <div
                className={`text-sm sm:text-lg font-bold mt-1 ${
                  summary.netChange >= 0 ? 'text-blue-600' : 'text-amber-600'
                }`}
              >
                {summary.netChange >= 0 ? `+${summary.netChange}` : summary.netChange}
              </div>
            </div>
          </div>

          {/* Transaction List */}
          {loading ? (
            <div className="py-16 text-center text-slate-400">
              <div className="w-8 h-8 border-3 border-slate-300 border-t-blue-600 rounded-full animate-spin mx-auto mb-2" />
              <p className="text-xs font-medium">Loading your transaction history...</p>
            </div>
          ) : filteredTransactions.length === 0 ? (
            <div className="text-center py-12 bg-slate-50/60 rounded-xl border border-dashed border-slate-200 p-6">
              <Clock className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <p className="font-semibold text-slate-700 text-sm">No transactions found</p>
              <p className="text-xs text-slate-400 mt-1">
                {searchQuery
                  ? 'Try a different search keyword or adjust your filters.'
                  : 'Your scanned transactions will appear here after syncing.'}
              </p>
            </div>
          ) : (
            <div className="space-y-2 max-h-[520px] overflow-y-auto pr-1">
              {filteredTransactions.map((tx) => {
                const isIn = tx.direction === 'in'
                const dateObj = new Date(tx.created_at)
                const formattedDate = dateObj.toLocaleDateString([], {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })
                const formattedTime = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                const rawMat = tx.materials
                const mat = Array.isArray(rawMat) ? rawMat[0] : rawMat

                return (
                  <motion.div
                    key={tx.id}
                    layout
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center justify-between p-3 rounded-xl bg-slate-50 hover:bg-slate-100/80 border border-slate-200/80 transition-all group"
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div
                        className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                          isIn
                            ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                            : 'bg-rose-100 text-rose-700 border border-rose-200'
                        }`}
                      >
                        {isIn ? (
                          <ArrowDownCircle className="w-4 h-4" />
                        ) : (
                          <ArrowUpCircle className="w-4 h-4" />
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-slate-900 text-xs sm:text-sm truncate">
                          {mat?.model || mat?.name || 'Unknown Product'}
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500 mt-0.5">
                          <span className="font-medium text-slate-700">{mat?.name || 'N/A'}</span>
                          <span>&bull;</span>
                          <span className="font-mono bg-white px-1.5 py-0.2 rounded border border-slate-200 text-slate-700">
                            {mat?.sku || 'N/A'}
                          </span>
                          <span className="text-slate-400">&bull; {formattedDate} at {formattedTime}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2.5 shrink-0 pl-3">
                      <div className="text-right">
                        <div
                          className={`text-sm font-bold ${
                            isIn ? 'text-emerald-600' : 'text-rose-600'
                          }`}
                        >
                          {isIn ? `+${tx.qty}` : `-${tx.qty}`}{' '}
                          <span className="text-xs font-normal text-slate-500">
                            {mat?.unit || 'pcs'}
                          </span>
                        </div>
                        <span
                          className={`inline-block text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full ${
                            isIn
                              ? 'bg-emerald-50 text-emerald-700'
                              : 'bg-rose-50 text-rose-700'
                          }`}
                        >
                          {isIn ? 'Inward' : 'Outward'}
                        </span>
                      </div>

                      {/* Undo / Delete Button */}
                      <button
                        type="button"
                        onClick={() => openDeleteModal(tx)}
                        className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all opacity-60 group-hover:opacity-100"
                        title="Undo this transaction"
                      >
                        <Undo2 className="w-4 h-4" />
                      </button>
                    </div>
                  </motion.div>
                )
              })}
            </div>
          )}
        </div>
      </main>

      {/* Delete / Undo Confirmation Modal */}
      <AnimatePresence>
        {isDeleteModalOpen && deletingTx && (() => {
          const rawMat = deletingTx.materials
          const mat = Array.isArray(rawMat) ? rawMat[0] : rawMat
          const isIn = deletingTx.direction === 'in'

          return (
            <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 10 }}
                className="bg-white rounded-3xl p-6 sm:p-7 w-full max-w-md shadow-2xl border border-rose-200 text-center"
              >
                <div className="w-14 h-14 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto mb-4 border border-rose-100 shadow-sm">
                  <Undo2 className="w-7 h-7" />
                </div>

                <h3 className="text-lg font-bold text-slate-900 mb-2">
                  Undo This Transaction?
                </h3>

                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 text-left mb-4 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500 font-semibold">Product</span>
                    <span className="font-bold text-slate-900">{mat?.model || mat?.name || 'Unknown'}</span>
                  </div>
                  {mat?.model && (
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-500 font-semibold">Category</span>
                      <span className="font-medium text-slate-700">{mat?.name}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500 font-semibold">SKU</span>
                    <span className="font-mono text-slate-700">{mat?.sku || 'N/A'}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500 font-semibold">Direction</span>
                    <span className={`font-bold ${isIn ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {isIn ? '\u2193 Inward' : '\u2191 Outward'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500 font-semibold">Quantity</span>
                    <span className="font-bold text-slate-900">{deletingTx.qty} {mat?.unit || 'pcs'}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500 font-semibold">Date</span>
                    <span className="text-slate-700">
                      {new Date(deletingTx.created_at).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}{' '}
                      {new Date(deletingTx.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>

                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 font-medium mb-5 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <span>
                    This will <strong>delete</strong> this transaction and <strong>reverse</strong> the stock change.
                    {isIn
                      ? ` ${deletingTx.qty} ${mat?.unit || 'pcs'} will be subtracted from current stock.`
                      : ` ${deletingTx.qty} ${mat?.unit || 'pcs'} will be added back to current stock.`}
                  </span>
                </div>

                <div className="flex gap-2.5">
                  <button
                    type="button"
                    onClick={handleDeleteTransaction}
                    disabled={deleting}
                    className="flex-1 py-3 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs sm:text-sm rounded-xl shadow-md shadow-rose-600/30 active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {deleting ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        <span>Undoing...</span>
                      </>
                    ) : (
                      <>
                        <Undo2 className="w-4 h-4" />
                        <span>Yes, Undo Transaction</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={closeDeleteModal}
                    className="px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs sm:text-sm rounded-xl transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </motion.div>
            </div>
          )
        })()}
      </AnimatePresence>
    </div>
  )
}
