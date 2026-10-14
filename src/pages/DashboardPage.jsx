import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { 
  TrendingUp, 
  ArrowUpRight, 
  ArrowDownRight, 
  DollarSign, 
  CreditCard, 
  Landmark, 
  Users, 
  Package, 
  Boxes, 
  Receipt, 
  AlertTriangle, 
  ShieldCheck, 
  Eye, 
  Edit3, 
  Clock, 
  CheckCircle2,
  Calendar,
  Layers
} from 'lucide-react'
import { 
  ResponsiveContainer, 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  Tooltip, 
  CartesianGrid, 
  BarChart, 
  Bar 
} from 'recharts'
import { accDb } from '../lib/accountingDb'
import { calculateFinancialMetrics, calculateVoucherGrossProfit, getLocalDateString } from '../lib/jsQuery'
import { useAuth } from '../context/AuthContext'
import Nav from '../components/Nav'
import VoucherModal from '../components/VoucherModal'
import InvoicePrintModal from '../components/InvoicePrintModal'

export default function DashboardPage() {
  const { isAdmin } = useAuth()
  const [metrics, setMetrics] = useState(null)
  const [recentVouchers, setRecentVouchers] = useState([])
  const [chartData, setChartData] = useState([])
  const [loading, setLoading] = useState(true)

  // Voucher creation / modification state
  const [isVoucherModalOpen, setIsVoucherModalOpen] = useState(false)
  const [editingVoucher, setEditingVoucher] = useState(null)

  // Invoice print modal state
  const [selectedInvoice, setSelectedInvoice] = useState(null)
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false)

  useEffect(() => {
    loadData()

    function handleDataUpdate() {
      loadData()
    }
    window.addEventListener('accounting-data-updated', handleDataUpdate)
    return () => window.removeEventListener('accounting-data-updated', handleDataUpdate)
  }, [])

  async function loadData() {
    setLoading(true)
    const vouchers = await accDb.vouchers.toArray()
    const materials = await accDb.materials.toArray()
    const parties = await accDb.parties.toArray()
    const ledgers = await accDb.ledgers.toArray()

    const calculated = calculateFinancialMetrics({ vouchers, ledgers, materials, parties })
    setMetrics(calculated)

    // Sort recent vouchers descending by date
    const sortedVouchers = [...vouchers].sort((a, b) => {
      const da = new Date(a.date || a.createdAt).getTime()
      const db = new Date(b.date || b.createdAt).getTime()
      return db - da
    })
    setRecentVouchers(sortedVouchers.slice(0, 8))

    // Prepare seven local-business-date buckets, then aggregate vouchers in one pass.
    const chartDaysByDate = new Map()
    for (let i = 6; i >= 0; i--) {
      const d = new Date()
      d.setHours(0, 0, 0, 0)
      d.setDate(d.getDate() - i)
      chartDaysByDate.set(getLocalDateString(d), {
        date: d.toLocaleDateString('en-IN', { weekday: 'short', month: 'numeric', day: 'numeric' }),
        Sales: 0,
        Profit: 0,
      })
    }

    for (const voucher of vouchers) {
      if (voucher.voucher_type !== 'sales') continue
      const day = chartDaysByDate.get((voucher.date || '').slice(0, 10))
      if (!day) continue
      day.Sales += Number(voucher.amount) || 0
      day.Profit += calculateVoucherGrossProfit(voucher)
    }

    setChartData([...chartDaysByDate.values()])
    setLoading(false)
  }

  function handleOpenVoucher(voucher = null) {
    setEditingVoucher(voucher)
    setIsVoucherModalOpen(true)
  }

  function handleViewInvoice(voucher) {
    setSelectedInvoice(voucher)
    setIsInvoiceModalOpen(true)
  }

  if (loading || !metrics) {
    return (
      <div className="min-h-screen bg-slate-950 text-white">
        <Nav />
        <div className="flex items-center justify-center h-[70vh]">
          <div className="flex items-center gap-3">
            <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm font-semibold text-slate-300">Loading Tally Accounting Metrics...</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 font-sans pb-16">
      <Nav />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 pt-6 space-y-6">
        {/* Top Header Bar */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-2">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                Accounting Executive Dashboard
              </h1>
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                isAdmin 
                  ? 'bg-blue-500/20 text-blue-300 border-blue-500/40' 
                  : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
              }`}>
                {isAdmin ? 'Admin: Full Data Entry' : 'Owner: Read & Track Mode'}
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-400 mt-1">
              Real-time daily sales, profit metrics, cash/bank position, debtor UIDs, and material inventory.
            </p>
          </div>

          {/* New voucher is available from the persistent navigation action. */}
        </div>

        {/* 7 Core Financial Metric Cards (User Requirement 1) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* 1. Daily Sales */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-slate-800/90 rounded-2xl p-5 border border-slate-700/80 shadow-lg relative overflow-hidden"
          >
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs font-bold uppercase tracking-wider">1. Daily Sales</span>
              <div className="p-2 rounded-xl bg-blue-500/20 text-blue-400">
                <Receipt className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-black text-white">
              ₹{metrics.today.sales.toLocaleString()}
            </div>
            <div className="flex items-center gap-2 mt-2 text-xs">
              <span className="text-emerald-400 font-bold">
                Paid: ₹{metrics.today.paid.toLocaleString()}
              </span>
              <span className="text-slate-500">•</span>
              <span className="text-rose-400 font-bold">
                Due: ₹{metrics.today.due.toLocaleString()}
              </span>
            </div>
            <div className="mt-3 text-[11px] text-slate-400 pt-2 border-t border-slate-700/60">
              Total Invoices Today: <strong>{metrics.today.invoiceCount}</strong>
            </div>
          </motion.div>

          {/* 2. Profits (Gross & Net) */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="bg-slate-800/90 rounded-2xl p-5 border border-slate-700/80 shadow-lg relative overflow-hidden"
          >
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs font-bold uppercase tracking-wider">2. Profits & Margins</span>
              <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400">
                <TrendingUp className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-black text-emerald-400">
              ₹{metrics.total.grossProfit.toLocaleString()}
            </div>
            <div className="flex items-center gap-2 mt-2 text-xs">
              <span className="text-emerald-300 font-semibold">
                Today: ₹{metrics.today.grossProfit.toLocaleString()}
              </span>
              <span className="text-slate-500">•</span>
              <span className="text-slate-400">
                Net: ₹{metrics.total.netProfit.toLocaleString()}
              </span>
            </div>
            <div className="mt-3 text-[11px] text-slate-400 pt-2 border-t border-slate-700/60">
              Operating Expenses: ₹{metrics.total.expenses.toLocaleString()}
            </div>
          </motion.div>

          {/* 3. Cash & Bank */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-slate-800/90 rounded-2xl p-5 border border-slate-700/80 shadow-lg relative overflow-hidden"
          >
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs font-bold uppercase tracking-wider">3. Cash & Bank</span>
              <div className="p-2 rounded-xl bg-teal-500/20 text-teal-400">
                <Landmark className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-black text-white">
              ₹{metrics.cashAndBank.total.toLocaleString()}
            </div>
            <div className="flex items-center gap-2 mt-2 text-xs">
              <span className="text-teal-300 font-bold">
                Bank: ₹{metrics.cashAndBank.bank.toLocaleString()}
              </span>
              <span className="text-slate-500">•</span>
              <span className="text-slate-300">
                Cash: ₹{metrics.cashAndBank.cash.toLocaleString()}
              </span>
            </div>
            <div className="mt-3 text-[11px] text-slate-400 pt-2 border-t border-slate-700/60">
              Active Liquid Accounts: <strong>{metrics.cashAndBank.accounts.length}</strong>
            </div>
          </motion.div>

          {/* 4. Loans */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="bg-slate-800/90 rounded-2xl p-5 border border-slate-700/80 shadow-lg relative overflow-hidden"
          >
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs font-bold uppercase tracking-wider">4. Loans & Borrowings</span>
              <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400">
                <CreditCard className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-black text-amber-400">
              ₹{metrics.loans.payable.toLocaleString()}
            </div>
            <div className="flex items-center gap-2 mt-2 text-xs">
              <span className="text-slate-400">
                Advances Given: ₹{metrics.loans.receivable.toLocaleString()}
              </span>
            </div>
            <div className="mt-3 text-[11px] text-slate-400 pt-2 border-t border-slate-700/60">
              Net Liability: ₹{metrics.loans.netLiability.toLocaleString()}
            </div>
          </motion.div>

          {/* 5. Debtors (with UID Logic) */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-slate-800/90 rounded-2xl p-5 border border-slate-700/80 shadow-lg relative overflow-hidden"
          >
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs font-bold uppercase tracking-wider">5. Sundry Debtors</span>
              <div className="p-2 rounded-xl bg-indigo-500/20 text-indigo-400">
                <Users className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-black text-rose-400">
              ₹{metrics.debtors.totalDue.toLocaleString()}
            </div>
            <div className="flex items-center gap-1.5 mt-2 text-xs">
              <ShieldCheck className="w-3.5 h-3.5 text-blue-400" />
              <span className="text-blue-300 font-bold">
                {metrics.debtors.withUidCount} Permanent UID Linked
              </span>
            </div>
            <div className="mt-3 text-[11px] text-slate-400 pt-2 border-t border-slate-700/60">
              Total Customer Ledgers: <strong>{metrics.debtors.count}</strong>
            </div>
          </motion.div>

          {/* 6. Inventory (Pure Material-wise) */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
            className="bg-slate-800/90 rounded-2xl p-5 border border-slate-700/80 shadow-lg relative overflow-hidden"
          >
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs font-bold uppercase tracking-wider">6. Material Inventory</span>
              <div className="p-2 rounded-xl bg-purple-500/20 text-purple-400">
                <Boxes className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-black text-white">
              ₹{metrics.inventory.totalValue.toLocaleString()}
            </div>
            <div className="flex items-center gap-2 mt-2 text-xs">
              <span className="text-purple-300 font-bold">
                {metrics.inventory.totalItems} Materials Tracked
              </span>
            </div>
            <div className="mt-3 text-[11px] text-slate-400 pt-2 border-t border-slate-700/60 flex items-center justify-between">
              <span>Low Stock Alerts:</span>
              <span className={`font-bold ${metrics.inventory.lowStockCount > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                {metrics.inventory.lowStockCount} items
              </span>
            </div>
          </motion.div>

          {/* 7. Creditors */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="bg-slate-800/90 rounded-2xl p-5 border border-slate-700/80 shadow-lg relative overflow-hidden sm:col-span-2 lg:col-span-2"
          >
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs font-bold uppercase tracking-wider">7. Sundry Creditors (Suppliers)</span>
              <div className="p-2 rounded-xl bg-rose-500/20 text-rose-400">
                <Users className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-black text-white">
              ₹{metrics.creditors.totalPayable.toLocaleString()}
            </div>
            <div className="flex items-center gap-2 mt-2 text-xs">
              <span className="text-rose-400 font-semibold">
                Total Payables Owed to Suppliers
              </span>
              <span className="text-slate-500">•</span>
              <span className="text-slate-400">
                {metrics.creditors.count} Suppliers
              </span>
            </div>
            <div className="mt-3 text-[11px] text-slate-400 pt-2 border-t border-slate-700/60">
              Purchase Ledgers & Bill Balances in Sync
            </div>
          </motion.div>
        </div>

        {/* 7-Day Performance Chart */}
        <div className="bg-slate-800/90 rounded-2xl p-5 border border-slate-700/80 shadow-lg">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-bold text-white">7-Day Sales & Gross Profit</h2>
              <p className="text-xs text-slate-400">Profit is estimated at 20% when item cost rates are missing.</p>
            </div>
            <div className="flex items-center gap-3 text-xs font-semibold">
              <span className="flex items-center gap-1.5 text-blue-400">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                Sales
              </span>
              <span className="flex items-center gap-1.5 text-emerald-400">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                Profit
              </span>
            </div>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.0} />
                  </linearGradient>
                  <linearGradient id="profitGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.5} />
                <XAxis dataKey="date" stroke="#94a3b8" fontSize={11} />
                <YAxis stroke="#94a3b8" fontSize={11} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px', fontSize: '12px' }}
                />
                <Area type="monotone" dataKey="Sales" stroke="#3b82f6" strokeWidth={2} fillOpacity={1} fill="url(#salesGrad)" />
                <Area type="monotone" dataKey="Profit" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#profitGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Recent Vouchers (Tally Day Book Snippet) */}
        <div className="bg-slate-800/90 rounded-2xl p-5 border border-slate-700/80 shadow-lg space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <span>Recent Accounting Vouchers</span>
                <span className="text-xs font-mono font-normal text-slate-400">({recentVouchers.length})</span>
              </h2>
              <p className="text-xs text-slate-400">
                Click any voucher to view tax invoice or modify (Tally customizable methodology)
              </p>
            </div>
            <a
              href="/daybook"
              className="text-xs font-bold text-blue-400 hover:text-blue-300 transition-colors"
            >
              View Full Day Book →
            </a>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-900/60 text-slate-400 font-bold uppercase text-[10px] border-b border-slate-700">
                <tr>
                  <th className="py-2.5 px-3">Date</th>
                  <th className="py-2.5 px-3">Vch No.</th>
                  <th className="py-2.5 px-3">Type</th>
                  <th className="py-2.5 px-3">Particulars / Party</th>
                  <th className="py-2.5 px-3">Debtor UID</th>
                  <th className="py-2.5 px-3 text-right">Amount (₹)</th>
                  <th className="py-2.5 px-3 text-right">Closing Due (₹)</th>
                  <th className="py-2.5 px-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/60 font-medium">
                {recentVouchers.map((v) => {
                  const typeUpper = (v.voucher_type || 'sales').toUpperCase()
                  const isSales = v.voucher_type === 'sales'
                  return (
                    <tr key={v.id} className="hover:bg-slate-700/40 transition-colors">
                      <td className="py-3 px-3 text-slate-300 font-mono">{v.date}</td>
                      <td className="py-3 px-3 font-mono font-bold text-white">{v.voucher_no}</td>
                      <td className="py-3 px-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                          v.voucher_type === 'sales' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                          v.voucher_type === 'purchase' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' :
                          v.voucher_type === 'receipt' ? 'bg-teal-500/20 text-teal-400 border border-teal-500/30' :
                          v.voucher_type === 'contra' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' :
                          'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30'
                        }`}>
                          {typeUpper}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-slate-200">
                        <div className="font-semibold">{v.party_name || 'Cash'}</div>
                        {v.narration && (
                          <div className="text-[10px] text-slate-400 truncate max-w-xs">{v.narration}</div>
                        )}
                      </td>
                      <td className="py-3 px-3">
                        {v.party_uid ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 text-[10px] font-mono font-bold border border-blue-500/40">
                            <ShieldCheck className="w-3 h-3 text-blue-400" />
                            <span>{v.party_uid}</span>
                          </span>
                        ) : (
                          <span className="text-slate-500 text-[11px]">-</span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-right font-bold text-white">
                        ₹{Number(v.amount || 0).toLocaleString()}
                      </td>
                      <td className="py-3 px-3 text-right font-bold">
                        {Number(v.due_amount || 0) > 0 ? (
                          <span className="text-rose-400">₹{Number(v.due_amount).toLocaleString()}</span>
                        ) : (
                          <span className="text-slate-500 font-normal">₹0</span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {isSales && (
                            <button
                              type="button"
                              onClick={() => handleViewInvoice(v)}
                              className="p-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white transition-colors"
                              title="Print / View Tax Invoice"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {isAdmin && (
                            <button
                              type="button"
                              onClick={() => handleOpenVoucher(v)}
                              className="p-1.5 rounded-lg bg-blue-600/30 hover:bg-blue-600 text-blue-300 hover:text-white transition-colors"
                              title="Modify Voucher (Tally edit)"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* Voucher Modal */}
      <VoucherModal
        isOpen={isVoucherModalOpen}
        onClose={() => setIsVoucherModalOpen(false)}
        editingVoucher={editingVoucher}
        onSuccess={loadData}
      />

      {/* Invoice Print Modal */}
      <InvoicePrintModal
        isOpen={isInvoiceModalOpen}
        onClose={() => setIsInvoiceModalOpen(false)}
        invoice={selectedInvoice}
      />
    </div>
  )
}
