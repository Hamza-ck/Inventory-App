import { useEffect, useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Package, 
  TrendingUp, 
  ArrowDownCircle, 
  ArrowUpCircle, 
  AlertTriangle, 
  Search, 
  Calendar, 
  UserPlus, 
  RefreshCw, 
  Award, 
  Boxes, 
  Layers,
  Filter,
  CheckCircle2,
  XCircle,
  Clock,
  X
} from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import Nav from '../components/Nav'
import AddUserModal from '../components/AddUserModal'

export default function OwnerDashboard() {
  const [materials, setMaterials] = useState([])
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(true)
  const [isAddUserOpen, setIsAddUserOpen] = useState(false)

  // Search & Filter States
  const [searchQuery, setSearchQuery] = useState('')
  const [dateFilter, setDateFilter] = useState('all') // 'today' | 'yesterday' | '7days' | '30days' | 'all' | 'custom'
  const [customDate, setCustomDate] = useState(new Date().toISOString().slice(0, 10))
  const [directionFilter, setDirectionFilter] = useState('all') // 'all' | 'in' | 'out'
  const [stockStatusFilter, setStockStatusFilter] = useState('all') // 'all' | 'low' | 'out'

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)
    try {
      const { data: materialsData } = await supabase
        .from('materials')
        .select('*')
        .order('name', { ascending: true })

      const { data: txData } = await supabase
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
        .order('created_at', { ascending: false })

      setMaterials(materialsData || [])
      setTransactions(txData || [])
    } catch (err) {
      console.error('Error loading dashboard data:', err)
    } finally {
      setLoading(false)
    }
  }

  // --- Calculations ---

  // 1. Total Stock Units
  const totalStockUnits = useMemo(() => {
    return materials.reduce((acc, m) => acc + (Number(m.current_qty) || 0), 0)
  }, [materials])

  // 2. Low Stock & Out of Stock items
  const lowStockItems = useMemo(() => {
    return materials.filter(
      (m) => Number(m.current_qty) > 0 && Number(m.current_qty) <= Number(m.reorder_threshold ?? 0)
    )
  }, [materials])

  const outOfStockItems = useMemo(() => {
    return materials.filter((m) => Number(m.current_qty) <= 0)
  }, [materials])

  // 3. Date Filtering for Transactions
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
      const matName = tx.materials?.name?.toLowerCase() || ''
      const matModel = tx.materials?.model?.toLowerCase() || ''
      const matSku = tx.materials?.sku?.toLowerCase() || ''
      const matchesSearch = !q || matName.includes(q) || matModel.includes(q) || matSku.includes(q)

      return matchesDate && matchesDirection && matchesSearch
    })
  }, [transactions, dateFilter, customDate, directionFilter, searchQuery])

  // Daily movement summary numbers
  const dailySummary = useMemo(() => {
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

  // 4. Calculate Top Products (by movement volume / transaction activity)
  const topProducts = useMemo(() => {
    const productStats = {}

    transactions.forEach((tx) => {
      const mat = tx.materials
      if (!mat) return
      const id = mat.id || tx.material_id
      if (!productStats[id]) {
        productStats[id] = {
          id,
          name: mat.name,
          model: mat.model,
          sku: mat.sku,
          unit: mat.unit || 'pcs',
          totalMoved: 0,
          inward: 0,
          outward: 0,
          txCount: 0,
        }
      }
      const qty = Number(tx.qty) || 0
      productStats[id].totalMoved += qty
      productStats[id].txCount += 1
      if (tx.direction === 'in') productStats[id].inward += qty
      else productStats[id].outward += qty
    })

    return Object.values(productStats).sort((a, b) => b.totalMoved - a.totalMoved)
  }, [transactions])

  const topProduct = topProducts[0] || null

  // 5. Search & Filter Products List
  const filteredProducts = useMemo(() => {
    const q = searchQuery.toLowerCase().trim()
    return materials.filter((m) => {
      const nameMatch = m.name?.toLowerCase().includes(q)
      const modelMatch = m.model?.toLowerCase().includes(q)
      const skuMatch = m.sku?.toLowerCase().includes(q)
      const matchesSearch = !q || nameMatch || modelMatch || skuMatch

      let matchesStock = true
      if (stockStatusFilter === 'low') {
        matchesStock = Number(m.current_qty) > 0 && Number(m.current_qty) <= Number(m.reorder_threshold ?? 0)
      } else if (stockStatusFilter === 'out') {
        matchesStock = Number(m.current_qty) <= 0
      }

      return matchesSearch && matchesStock
    })
  }, [materials, searchQuery, stockStatusFilter])

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      <Nav />

      <main className="w-full max-w-6xl mx-auto px-4 sm:px-6 pt-6 pb-24 flex-1">
        {/* Dashboard Title & Actions */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
              Inventory Dashboard
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
              Real-time daily stock movements, top products & inventory levels
            </p>
          </div>

          <div className="flex items-center gap-2.5 self-start sm:self-auto">
            <button
              type="button"
              onClick={() => setIsAddUserOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs sm:text-sm rounded-xl shadow-sm transition-all"
            >
              <UserPlus className="w-4 h-4" />
              <span>Add New User</span>
            </button>

            <button
              type="button"
              onClick={load}
              className="p-2 bg-white hover:bg-slate-100 text-slate-600 rounded-xl border border-slate-200 shadow-xs transition-all"
              title="Refresh Data"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-blue-600' : ''}`} />
            </button>
          </div>
        </div>

        {/* Global Search Bar */}
        <div className="relative mb-6">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          <input
            type="text"
            placeholder='Search products or logs (e.g. "Model Name", "Product Name", "SKU")...'
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-10 py-2.5 sm:py-3 bg-white border border-slate-300 rounded-xl text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600 shadow-xs"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
          {/* Total SKUs */}
          <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/90 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between text-slate-500 mb-2">
              <span className="text-[11px] font-bold uppercase tracking-wider">Total SKUs</span>
              <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                <Boxes className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-bold text-slate-900">{materials.length}</div>
          </div>

          {/* Total Units */}
          <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/90 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between text-slate-500 mb-2">
              <span className="text-[11px] font-bold uppercase tracking-wider">Total Units</span>
              <div className="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                <Package className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-bold text-slate-900">
              {totalStockUnits.toLocaleString()}
            </div>
          </div>

          {/* Low Stock Alert */}
          <div
            className={`rounded-2xl p-4 sm:p-5 border shadow-xs flex flex-col justify-between transition-colors ${
              lowStockItems.length > 0
                ? 'bg-amber-50/70 border-amber-200 text-amber-900'
                : 'bg-white border-slate-200/90'
            }`}
          >
            <div className="flex items-center justify-between text-slate-500 mb-2">
              <span className="text-[11px] font-bold uppercase tracking-wider">Low Stock</span>
              <div
                className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                  lowStockItems.length > 0 ? 'bg-amber-200/70 text-amber-800' : 'bg-slate-100 text-slate-500'
                }`}
              >
                <AlertTriangle className="w-4 h-4" />
              </div>
            </div>
            <div
              className={`text-2xl font-bold ${
                lowStockItems.length > 0 ? 'text-amber-800' : 'text-slate-900'
              }`}
            >
              {lowStockItems.length}
            </div>
          </div>

          {/* Total Moves */}
          <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/90 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between text-slate-500 mb-2">
              <span className="text-[11px] font-bold uppercase tracking-wider">Total Moves</span>
              <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <TrendingUp className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-bold text-slate-900">{transactions.length}</div>
          </div>
        </div>

        {/* Top Product Section & Leaderboard */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 mb-6">
          {/* #1 Top Product Card */}
          <div className="lg:col-span-5 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-950 text-white rounded-2xl p-5 sm:p-6 shadow-md flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="px-2.5 py-1 bg-amber-400 text-slate-950 font-bold text-xs rounded-full flex items-center gap-1 shadow-sm">
                  <Award className="w-3.5 h-3.5 fill-current" />
                  #1 Top Product
                </span>
                <span className="text-xs text-slate-400">Most Active Volume</span>
              </div>

              {topProduct ? (
                <div>
                  <h3 className="text-lg sm:text-xl font-bold text-white mb-1.5 leading-snug">
                    {topProduct.name}
                  </h3>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300 mb-4">
                    <span className="font-mono bg-white/10 px-2 py-0.5 rounded border border-white/10">
                      {topProduct.sku}
                    </span>
                    {topProduct.model && (
                      <span className="text-slate-300 font-medium">• {topProduct.model}</span>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3 p-3 bg-white/10 rounded-xl border border-white/10 mb-4">
                    <div>
                      <div className="text-[10px] text-slate-300 uppercase font-semibold">Total Moved</div>
                      <div className="text-base sm:text-lg font-bold text-emerald-400">
                        {topProduct.totalMoved.toLocaleString()} {topProduct.unit}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-300 uppercase font-semibold">Activity Logs</div>
                      <div className="text-base sm:text-lg font-bold text-sky-300">
                        {topProduct.txCount} times
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-slate-400 text-xs py-8 text-center">
                  No movement activity recorded yet.
                </div>
              )}
            </div>

            {topProduct && (
              <div className="flex items-center justify-between text-xs text-slate-300 pt-3 border-t border-white/10">
                <span className="flex items-center gap-1 text-emerald-300">
                  <ArrowDownCircle className="w-3.5 h-3.5" /> +{topProduct.inward} In
                </span>
                <span className="flex items-center gap-1 text-rose-300">
                  <ArrowUpCircle className="w-3.5 h-3.5" /> -{topProduct.outward} Out
                </span>
              </div>
            )}
          </div>

          {/* Top Products Leaderboard */}
          <div className="lg:col-span-7 bg-white rounded-2xl p-5 sm:p-6 border border-slate-200/90 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-blue-600" />
                <h3 className="font-bold text-slate-900 text-sm sm:text-base">Top Products Leaderboard</h3>
              </div>
              <span className="text-xs text-slate-400 font-medium">Ranked by turnover</span>
            </div>

            {topProducts.length === 0 ? (
              <p className="text-slate-400 text-xs py-6 text-center">No transaction records found.</p>
            ) : (
              <div className="space-y-2.5">
                {topProducts.slice(0, 4).map((p, idx) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between p-3 rounded-xl bg-slate-50 hover:bg-slate-100/70 border border-slate-200/60 transition-all"
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <span
                        className={`w-6 h-6 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 ${
                          idx === 0
                            ? 'bg-amber-400 text-slate-900 shadow-xs'
                            : idx === 1
                            ? 'bg-slate-200 text-slate-800'
                            : idx === 2
                            ? 'bg-amber-600 text-white'
                            : 'bg-slate-200 text-slate-600'
                        }`}
                      >
                        #{idx + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-slate-900 text-xs sm:text-sm truncate">
                          {p.name}
                        </div>
                        <div className="text-[11px] text-slate-500 font-mono flex items-center gap-1.5 mt-0.5">
                          <span>{p.sku}</span>
                          {p.model && <span className="font-sans text-slate-400">• {p.model}</span>}
                        </div>
                      </div>
                    </div>

                    <div className="text-right shrink-0 pl-3">
                      <div className="font-bold text-slate-900 text-xs sm:text-sm">
                        {p.totalMoved} {p.unit}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        +{p.inward} / -{p.outward}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Section 1: Total Quantity of Each Product */}
        <div className="bg-white rounded-2xl p-5 sm:p-6 border border-slate-200/90 shadow-xs mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
            <div>
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-blue-600" />
                <h2 className="text-base sm:text-lg font-bold text-slate-900">Total Quantity of Each Product</h2>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Complete list of registered inventory stock quantities & thresholds
              </p>
            </div>

            {/* Filter Badges */}
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl self-start sm:self-auto">
              <button
                type="button"
                onClick={() => setStockStatusFilter('all')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  stockStatusFilter === 'all'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                All ({materials.length})
              </button>
              <button
                type="button"
                onClick={() => setStockStatusFilter('low')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  stockStatusFilter === 'low'
                    ? 'bg-amber-500 text-white shadow-xs'
                    : 'text-amber-700 hover:bg-amber-100/50'
                }`}
              >
                Low ({lowStockItems.length})
              </button>
              <button
                type="button"
                onClick={() => setStockStatusFilter('out')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  stockStatusFilter === 'out'
                    ? 'bg-rose-600 text-white shadow-xs'
                    : 'text-rose-700 hover:bg-rose-100/50'
                }`}
              >
                Out ({outOfStockItems.length})
              </button>
            </div>
          </div>

          {/* Product Items Grid */}
          {loading ? (
            <div className="py-10 text-center text-slate-400">
              <div className="w-7 h-7 border-2 border-slate-300 border-t-blue-600 rounded-full animate-spin mx-auto mb-2" />
              <p className="text-xs">Loading inventory products...</p>
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="py-10 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200 p-6">
              <p className="font-semibold text-slate-700 text-sm">No products found</p>
              <p className="text-xs text-slate-400 mt-1">
                {searchQuery ? 'Try adjusting your search keyword.' : 'Add items from the Materials section.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {filteredProducts.map((m) => {
                const qty = Number(m.current_qty) || 0
                const threshold = Number(m.reorder_threshold ?? 0)
                const isOut = qty <= 0
                const isLow = !isOut && qty <= threshold

                return (
                  <div
                    key={m.id}
                    className="p-4 rounded-xl bg-slate-50 hover:bg-white border border-slate-200 hover:border-slate-300 hover:shadow-xs transition-all flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <h4 className="font-bold text-slate-900 text-sm leading-snug truncate flex-1">
                          {m.name}
                        </h4>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 flex items-center gap-1 ${
                            isOut
                              ? 'bg-rose-100 text-rose-800 border border-rose-200'
                              : isLow
                              ? 'bg-amber-100 text-amber-800 border border-amber-200'
                              : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                          }`}
                        >
                          {isOut ? (
                            <>
                              <XCircle className="w-3 h-3 text-rose-600" /> Out
                            </>
                          ) : isLow ? (
                            <>
                              <AlertTriangle className="w-3 h-3 text-amber-600" /> Low stock
                            </>
                          ) : (
                            <>
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" /> In stock
                            </>
                          )}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500 mb-3">
                        <span className="font-mono bg-white px-1.5 py-0.5 rounded border border-slate-200 text-slate-700">
                          {m.sku}
                        </span>
                        {m.model && (
                          <span className="text-slate-500 font-medium">
                            • {m.model}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-end justify-between pt-2.5 border-t border-slate-200/70">
                      <div>
                        <div className="text-[10px] uppercase font-bold text-slate-400">Total Quantity</div>
                        <div className="text-lg font-bold text-slate-900">
                          {qty.toLocaleString()}{' '}
                          <span className="text-xs font-medium text-slate-500">{m.unit || 'pcs'}</span>
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="text-[10px] uppercase font-bold text-slate-400">Alert Min</div>
                        <div className="text-xs font-semibold text-slate-600">
                          ≤ {threshold} {m.unit || 'pcs'}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Section 2: Daily Log Movement with Date Filtration */}
        <div className="bg-white rounded-2xl p-5 sm:p-6 border border-slate-200/90 shadow-xs">
          {/* Header & Date Controls */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-5">
            <div>
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-blue-600" />
                <h2 className="text-base sm:text-lg font-bold text-slate-900">Daily Log Movements</h2>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Complete audit trail of inward & outward stock transactions
              </p>
            </div>

            {/* Date Filtration Controls */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center bg-slate-100 p-1 rounded-xl text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setDateFilter('today')}
                  className={`px-3 py-1.5 rounded-lg transition-all ${
                    dateFilter === 'today' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                  }`}
                >
                  Today
                </button>
                <button
                  type="button"
                  onClick={() => setDateFilter('yesterday')}
                  className={`px-3 py-1.5 rounded-lg transition-all ${
                    dateFilter === 'yesterday' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                  }`}
                >
                  Yesterday
                </button>
                <button
                  type="button"
                  onClick={() => setDateFilter('7days')}
                  className={`px-3 py-1.5 rounded-lg transition-all ${
                    dateFilter === '7days' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                  }`}
                >
                  7 Days
                </button>
                <button
                  type="button"
                  onClick={() => setDateFilter('all')}
                  className={`px-3 py-1.5 rounded-lg transition-all ${
                    dateFilter === 'all' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                  }`}
                >
                  All
                </button>
              </div>

              {/* Custom Date Picker */}
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
          </div>

          {/* Daily Movement Summary Row */}
          <div className="grid grid-cols-3 gap-2 sm:gap-3 p-3 sm:p-4 bg-slate-50 rounded-xl border border-slate-200 mb-5">
            <div className="text-center">
              <div className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase flex items-center justify-center gap-1">
                <ArrowDownCircle className="w-3.5 h-3.5 text-emerald-600" /> Total Inward
              </div>
              <div className="text-sm sm:text-lg font-bold text-emerald-600 mt-1">
                +{dailySummary.inwardUnits.toLocaleString()}
              </div>
            </div>

            <div className="text-center border-x border-slate-200">
              <div className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase flex items-center justify-center gap-1">
                <ArrowUpCircle className="w-3.5 h-3.5 text-rose-600" /> Total Outward
              </div>
              <div className="text-sm sm:text-lg font-bold text-rose-600 mt-1">
                -{dailySummary.outwardUnits.toLocaleString()}
              </div>
            </div>

            <div className="text-center">
              <div className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase">Net Stock Flow</div>
              <div
                className={`text-sm sm:text-lg font-bold mt-1 ${
                  dailySummary.netChange >= 0 ? 'text-blue-600' : 'text-amber-600'
                }`}
              >
                {dailySummary.netChange >= 0 ? `+${dailySummary.netChange}` : dailySummary.netChange}
              </div>
            </div>
          </div>

          {/* Direction Filter Tabs */}
          <div className="flex items-center gap-2 mb-4">
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
                {dir === 'all' ? 'All Movements' : dir === 'in' ? 'Inward Only' : 'Outward Only'}
              </button>
            ))}
          </div>

          {/* Movement Logs Timeline Feed */}
          {filteredTransactions.length === 0 ? (
            <div className="text-center py-10 bg-slate-50/60 rounded-xl border border-dashed border-slate-200 p-6">
              <p className="font-semibold text-slate-700 text-sm">No transaction movements match your filter</p>
              <p className="text-xs text-slate-400 mt-1">
                Try selecting "All" dates or clearing the search query.
              </p>
            </div>
          ) : (
            <div className="space-y-2 max-h-[460px] overflow-y-auto pr-1">
              {filteredTransactions.map((tx) => {
                const isIn = tx.direction === 'in'
                const dateObj = new Date(tx.created_at)
                const formattedTime = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                const formattedDate = dateObj.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
                const mat = tx.materials

                return (
                  <div
                    key={tx.id}
                    className="flex items-center justify-between p-3 bg-slate-50 hover:bg-slate-100/80 rounded-xl border border-slate-200/80 transition-colors"
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
                          {mat?.name || 'Unknown Product'}
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500 mt-0.5">
                          <span className="font-mono bg-white px-1.5 py-0.2 rounded border border-slate-200 text-slate-700">
                            {mat?.sku || 'N/A'}
                          </span>
                          {mat?.model && <span>• {mat.model}</span>}
                          <span className="text-slate-400">• {formattedDate} at {formattedTime}</span>
                        </div>
                      </div>
                    </div>

                    <div className="text-right shrink-0 pl-3">
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
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </main>

      {/* Add New User Modal */}
      <AddUserModal
        isOpen={isAddUserOpen}
        onClose={() => setIsAddUserOpen(false)}
        onUserAdded={() => {
          // reload if needed
        }}
      />
    </div>
  )
}
