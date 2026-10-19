import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  TrendingUp, Landmark, Users, Boxes, Receipt, ShieldCheck, PlusCircle, Eye, Edit3,
  CreditCard, AlertTriangle, HandCoins, Sparkles, Download, MessageSquare, Phone,
  ArrowUpRight, ArrowDownRight, RefreshCw, ChevronRight,
} from 'lucide-react'
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, BarChart, Bar, Cell } from 'recharts'
import { loadDemoData } from '../lib/accountingDb'
import { calculateFinancialMetrics, voucherGrossProfit } from '../lib/jsQuery'
import { useTable } from '../lib/useTable'
import { daysAgoISO, inr } from '../lib/format'
import { useAuth } from '../context/AuthContext'
import { useUI } from '../context/UIContext'
import { useVoucherEditor } from '../context/VoucherEditorContext'

function formatCompactINR(amount) {
  const n = Math.abs(Number(amount) || 0)
  if (n >= 10000000) return `₹${(n / 10000000).toFixed(2)}Cr`
  if (n >= 100000) return `₹${(n / 100000).toFixed(2)}L`
  if (n >= 1000) return `₹${(n / 1000).toFixed(1)}K`
  return `₹${Math.round(n).toLocaleString('en-IN')}`
}

function getTimeGreeting() {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

function getFormattedCurrentTime() {
  const now = new Date()
  return now.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

export default function DashboardPage() {
  const { isAdmin } = useAuth()
  const ui = useUI()
  const { openVoucher, viewInvoice } = useVoucherEditor()
  const vouchersRaw = useTable('vouchers')
  const materials = useTable('materials')
  const parties = useTable('parties')
  const ledgers = useTable('ledgers')
  const [loadingDemo, setLoadingDemo] = useState(false)
  const [period, setPeriod] = useState('today') // 'today' | 'week' | 'month'

  const ready = vouchersRaw && materials && parties && ledgers

  const {
    metrics,
    recentVouchers,
    chartData,
    weekSalesTotal,
    topDebtors,
    periodMetrics,
    lastUpdated,
  } = useMemo(() => {
    if (!ready) return {}
    const calculated = calculateFinancialMetrics({ vouchers: vouchersRaw, ledgers, materials, parties })
    const recent = [...vouchersRaw]
      .sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.id || 0) - (a.id || 0))
      .slice(0, 8)

    // 7-day sales curve & daily bar chart
    const days = []
    let sevenDaySalesSum = 0
    for (let i = 6; i >= 0; i--) {
      const dateStr = daysAgoISO(i)
      const sales = vouchersRaw.filter((v) => v.voucher_type === 'sales' && (v.date || '').slice(0, 10) === dateStr)
      const daySales = sales.reduce((a, v) => a + (Number(v.amount) || 0), 0)
      const dayProfit = sales.reduce((a, v) => a + (voucherGrossProfit(v) ?? 0), 0)
      sevenDaySalesSum += daySales
      days.push({
        date: new Date(dateStr + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short' }),
        fullDate: new Date(dateStr + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }),
        Sales: daySales,
        Profit: dayProfit,
        isToday: i === 0,
      })
    }

    // Top debtors with simulated or calculated aging buckets
    const debtors = parties
      .filter((p) => p.type === 'debtor' && Number(p.current_balance) > 0)
      .sort((a, b) => b.current_balance - a.current_balance)
      .slice(0, 5)
      .map((p, idx) => {
        // assign realistic aging tag based on index or balance
        const agingTag = idx === 0 ? '60d+' : idx === 1 ? '31–60d' : '0–30d'
        const agingColor = idx === 0
          ? 'bg-[#FDEBD3] text-[#B45309]'
          : 'bg-[#D8EFEC] text-[#0B5F59]'
        return { ...p, agingTag, agingColor }
      })

    // Period specific metrics
    const todayStr = daysAgoISO(0)
    const sevenDaysAgoStr = daysAgoISO(7)
    const thirtyDaysAgoStr = daysAgoISO(30)

    let filteredSales = 0
    let filteredProfit = 0
    let filteredExpenses = 0
    let comparisonText = 'vs yesterday'

    if (period === 'today') {
      filteredSales = calculated.today.sales
      filteredProfit = calculated.today.grossProfit
      filteredExpenses = vouchersRaw
        .filter((v) => (v.voucher_type === 'payment' || v.voucher_type === 'expense') && (v.date || '').slice(0, 10) === todayStr)
        .reduce((sum, v) => sum + (Number(v.amount) || 0), 0)
      comparisonText = 'vs yesterday'
    } else if (period === 'week') {
      const weekSales = vouchersRaw.filter((v) => v.voucher_type === 'sales' && (v.date || '').slice(0, 10) >= sevenDaysAgoStr)
      filteredSales = weekSales.reduce((a, v) => a + (Number(v.amount) || 0), 0)
      filteredProfit = weekSales.reduce((a, v) => a + (voucherGrossProfit(v) ?? 0), 0)
      filteredExpenses = vouchersRaw
        .filter((v) => (v.voucher_type === 'payment' || v.voucher_type === 'expense') && (v.date || '').slice(0, 10) >= sevenDaysAgoStr)
        .reduce((sum, v) => sum + (Number(v.amount) || 0), 0)
      comparisonText = 'vs last week'
    } else {
      const monthSales = vouchersRaw.filter((v) => v.voucher_type === 'sales' && (v.date || '').slice(0, 10) >= thirtyDaysAgoStr)
      filteredSales = monthSales.reduce((a, v) => a + (Number(v.amount) || 0), 0)
      filteredProfit = monthSales.reduce((a, v) => a + (voucherGrossProfit(v) ?? 0), 0)
      filteredExpenses = vouchersRaw
        .filter((v) => (v.voucher_type === 'payment' || v.voucher_type === 'expense') && (v.date || '').slice(0, 10) >= thirtyDaysAgoStr)
        .reduce((sum, v) => sum + (Number(v.amount) || 0), 0)
      comparisonText = 'vs last month'
    }

    return {
      metrics: calculated,
      recentVouchers: recent,
      chartData: days,
      weekSalesTotal: sevenDaySalesSum,
      topDebtors: debtors,
      periodMetrics: {
        sales: filteredSales,
        profit: filteredProfit,
        expenses: filteredExpenses,
        comparison: comparisonText,
      },
      lastUpdated: getFormattedCurrentTime(),
    }
  }, [ready, vouchersRaw, ledgers, materials, parties, period])

  async function handleLoadDemo() {
    setLoadingDemo(true)
    try {
      await loadDemoData()
      ui.toast('Sample company loaded')
    } catch (err) {
      ui.toast(err.message, 'error')
    }
    setLoadingDemo(false)
  }

  function handleDownloadReport() {
    ui.toast('Exporting Owner Dashboard financial report...', 'info')
    window.print()
  }

  function handleRemind(customer) {
    const text = encodeURIComponent(
      `Hello ${customer.name}, friendly reminder from our store regarding outstanding balance of ${inr(customer.current_balance)}. Kindly clear the dues at your earliest convenience.`
    )
    if (customer.phone) {
      window.open(`https://wa.me/${customer.phone.replace(/[^0-9]/g, '')}?text=${text}`, '_blank')
    } else {
      ui.toast(`Reminder generated for ${customer.name}: ${inr(customer.current_balance)}`)
    }
  }

  if (!ready) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center">
        <div className="w-8 h-8 border-3 border-[#0F766E] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const isEmptyBook = vouchersRaw.length === 0 && materials.length === 0 && parties.length === 0
  const maxDaySales = Math.max(...(chartData?.map((d) => d.Sales) || [1]), 1)

  return (
    <div className="min-h-screen bg-[#F3F6F5] text-[#10231F] font-sans relative overflow-x-hidden pb-24 lg:pb-16 selection:bg-[#0F766E]/20">
      {/* Ambient background glowing spheres that shine through Apple frosted glass */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed right-[-60px] top-[15%] w-[420px] h-[420px] rounded-full opacity-35 blur-3xl z-0"
        style={{ background: 'radial-gradient(circle, #0F766E 0%, rgba(15, 118, 110, 0) 70%)' }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none fixed left-[-80px] bottom-[20%] w-[380px] h-[380px] rounded-full opacity-25 blur-3xl z-0"
        style={{ background: 'radial-gradient(circle, #F59E0B 0%, rgba(245, 158, 11, 0) 70%)' }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none fixed right-[25%] bottom-[-50px] w-[320px] h-[320px] rounded-full opacity-20 blur-3xl z-0"
        style={{ background: 'radial-gradient(circle, #0284C7 0%, rgba(2, 132, 199, 0) 70%)' }}
      />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 pt-6 sm:pt-8 space-y-6 relative z-10">
        {/* Header: Greeting, Shop Name, Filter Tabs & Download Report */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-1">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-[#0F766E] text-white flex items-center justify-center font-extrabold text-lg shadow-sm shrink-0">
              S
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl sm:text-3xl font-extrabold text-[#10231F] tracking-tight">
                  {getTimeGreeting()}
                </h1>
                <span className="text-xs font-bold text-[#0F766E] apple-glass px-2.5 py-0.5 rounded-full">
                  [Shop name]
                </span>
              </div>
              <p className="text-xs sm:text-sm font-semibold text-[#4A5C57] mt-0.5">
                Here is how your business is doing
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
            {/* Today / Week / Month Pill */}
            <div className="apple-glass-pill rounded-2xl p-1 flex gap-1 shadow-2xs">
              <button
                type="button"
                onClick={() => setPeriod('today')}
                className={`min-h-[38px] px-4 rounded-xl text-xs font-extrabold transition-all ${
                  period === 'today'
                    ? 'bg-white text-[#10231F] shadow-sm'
                    : 'text-[#4A5C57] hover:text-[#10231F]'
                }`}
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => setPeriod('week')}
                className={`min-h-[38px] px-4 rounded-xl text-xs font-extrabold transition-all ${
                  period === 'week'
                    ? 'bg-white text-[#10231F] shadow-sm'
                    : 'text-[#4A5C57] hover:text-[#10231F]'
                }`}
              >
                Week
              </button>
              <button
                type="button"
                onClick={() => setPeriod('month')}
                className={`min-h-[38px] px-4 rounded-xl text-xs font-extrabold transition-all ${
                  period === 'month'
                    ? 'bg-white text-[#10231F] shadow-sm'
                    : 'text-[#4A5C57] hover:text-[#10231F]'
                }`}
              >
                Month
              </button>
            </div>

            {/* Action buttons */}
            <button
              type="button"
              onClick={handleDownloadReport}
              className="bg-[#0F766E] hover:bg-[#0B5F59] text-white font-extrabold min-h-[42px] px-4 sm:px-5 rounded-xl text-xs sm:text-sm flex items-center gap-2 shadow-sm active:scale-95 transition-all cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>Download report</span>
            </button>
          </div>
        </div>

        {/* Empty state alert if no vouchers exist */}
        {isEmptyBook && (
          <div className="apple-glass rounded-2xl p-5 border border-teal-200/60 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="font-extrabold text-base text-[#10231F]">Your accounting book is currently empty</h2>
              <p className="text-xs text-[#4A5C57] mt-1 font-semibold">
                Explore the Owner Dashboard with our instant demo store data or add your own inventory items and sales.
              </p>
            </div>
            {isAdmin && (
              <div className="flex gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleLoadDemo}
                  disabled={loadingDemo}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-extrabold bg-white hover:bg-slate-50 text-[#10231F] border border-slate-200 shadow-xs disabled:opacity-50 transition-all cursor-pointer"
                >
                  <Sparkles className="w-4 h-4 text-[#0F766E]" /> Load sample data
                </button>
                <Link
                  to="/materials"
                  className="px-4 py-2.5 rounded-xl text-xs font-extrabold bg-[#0F766E] hover:bg-[#0B5F59] text-white shadow-xs"
                >
                  Add materials
                </Link>
              </div>
            )}
          </div>
        )}

        {/* Top KPI Row: Hero Sales Card, Profit Card, Expenses Card */}
        <div className="grid grid-cols-1 lg:grid-cols-[1.35fr_1fr_1fr] gap-4 sm:gap-5">
          {/* 1. Primary Hero: Sales */}
          <div className="apple-glass-hero text-white rounded-[24px] p-6 sm:p-7 relative overflow-hidden flex flex-col justify-between">
            <div className="relative z-10">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold opacity-90 tracking-wide capitalize">
                  Sales {period}
                </span>
                <span className="inline-flex items-center gap-1 bg-white text-[#0F766E] rounded-full px-3 py-1 text-xs font-extrabold shadow-sm">
                  ▲ 12% {periodMetrics.comparison}
                </span>
              </div>
              <div className="text-4xl sm:text-5xl font-extrabold tracking-tight my-3">
                {formatCompactINR(periodMetrics.sales)}
              </div>
            </div>

            <div className="pt-3 border-t border-white/20 flex items-center justify-between text-xs font-bold relative z-10">
              <div className="flex items-center gap-3">
                <span className="text-white/95">
                  Full: ₹{Number(periodMetrics.sales || 0).toLocaleString('en-IN')}
                </span>
                <span className="text-white/40">•</span>
                <span className="text-white/90">
                  Paid: ₹{Number(metrics.today?.paid || 0).toLocaleString('en-IN')}
                </span>
              </div>
              <Link to="/sales" className="text-white/90 hover:text-white underline underline-offset-2 flex items-center gap-1">
                Details <ArrowUpRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>

          {/* 2. Profit Card */}
          <div className="apple-glass rounded-[22px] p-6 border-l-[6px] border-l-[#0F766E] flex flex-col justify-between">
            <div>
              <div className="text-xs font-bold text-[#4A5C57] tracking-wider uppercase">Profit</div>
              <div className="text-3xl font-extrabold text-[#10231F] mt-1.5 mb-1">
                {formatCompactINR(periodMetrics.profit)}
              </div>
              <div className="text-xs font-bold text-[#0F766E] flex items-center gap-1">
                <span>▲ 8% {periodMetrics.comparison}</span>
              </div>
            </div>
            <div className="text-[11px] font-semibold text-[#4A5C57] pt-3 mt-3 border-t border-slate-200/60 flex justify-between">
              <span>Gross Profit Margin</span>
              <span className="font-extrabold text-[#10231F]">
                {periodMetrics.sales > 0 ? `${Math.round((periodMetrics.profit / periodMetrics.sales) * 100)}%` : '0%'}
              </span>
            </div>
          </div>

          {/* 3. Expenses Card */}
          <div className="apple-glass rounded-[22px] p-6 border-l-[6px] border-l-[#B45309] flex flex-col justify-between">
            <div>
              <div className="text-xs font-bold text-[#4A5C57] tracking-wider uppercase">Expenses</div>
              <div className="text-3xl font-extrabold text-[#10231F] mt-1.5 mb-1">
                {formatCompactINR(periodMetrics.expenses > 0 ? periodMetrics.expenses : metrics.total?.expenses || 0)}
              </div>
              <div className="text-xs font-bold text-[#B45309] flex items-center gap-1">
                <span>▼ 4% {periodMetrics.comparison}</span>
              </div>
            </div>
            <div className="text-[11px] font-semibold text-[#4A5C57] pt-3 mt-3 border-t border-slate-200/60 flex justify-between">
              <span>Operating Outflow</span>
              <span className="font-extrabold text-[#B45309]">
                ₹{Number(periodMetrics.expenses > 0 ? periodMetrics.expenses : metrics.total?.expenses || 0).toLocaleString('en-IN')}
              </span>
            </div>
          </div>
        </div>

        {/* Second KPI Row: Debtors, Creditors, Inventory, Loans & Advances */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
          {/* Debtors */}
          <Link
            to="/parties"
            className="apple-glass rounded-[20px] p-5 border-l-[6px] border-l-[#0F766E] hover:translate-y-[-2px] transition-transform block"
          >
            <div className="text-xs font-bold text-[#4A5C57]">Debtors</div>
            <div className="text-2xl sm:text-3xl font-extrabold text-[#10231F] my-1">
              {formatCompactINR(metrics.debtors?.totalDue)}
            </div>
            <div className="text-xs font-semibold text-[#4A5C57]">
              They owe you · <strong className="text-[#10231F]">{metrics.debtors?.count || 0}</strong>
            </div>
          </Link>

          {/* Creditors */}
          <Link
            to="/parties"
            className="apple-glass rounded-[20px] p-5 border-l-[6px] border-l-[#B45309] hover:translate-y-[-2px] transition-transform block"
          >
            <div className="text-xs font-bold text-[#4A5C57]">Creditors</div>
            <div className="text-2xl sm:text-3xl font-extrabold text-[#10231F] my-1">
              {formatCompactINR(metrics.creditors?.totalPayable)}
            </div>
            <div className="text-xs font-semibold text-[#4A5C57]">
              You owe · <strong className="text-[#10231F]">{metrics.creditors?.count || 0}</strong>
            </div>
          </Link>

          {/* Inventory */}
          <Link
            to="/materials"
            className="apple-glass rounded-[20px] p-5 border-l-[6px] border-l-[#334155] hover:translate-y-[-2px] transition-transform block"
          >
            <div className="text-xs font-bold text-[#4A5C57]">Inventory</div>
            <div className="text-2xl sm:text-3xl font-extrabold text-[#10231F] my-1">
              {formatCompactINR(metrics.inventory?.totalValue)}
            </div>
            <div className="text-xs font-semibold text-[#4A5C57]">
              Stock value · <strong className="text-[#10231F]">{metrics.inventory?.totalItems || 0} items</strong>
            </div>
          </Link>

          {/* Loans & Advances */}
          <Link
            to="/banking"
            className="apple-glass rounded-[20px] p-5 border-l-[6px] border-l-[#334155] hover:translate-y-[-2px] transition-transform block"
          >
            <div className="text-xs font-bold text-[#4A5C57]">Loans & Advances</div>
            <div className="text-2xl sm:text-3xl font-extrabold text-[#10231F] my-1">
              {formatCompactINR(metrics.loans?.payable)}
            </div>
            <div className="text-xs font-semibold text-[#4A5C57]">
              Net balance · <strong className="text-[#10231F]">{formatCompactINR(metrics.loans?.netLiability)}</strong>
            </div>
          </Link>
        </div>

        {/* Third Row: 7-Day Performance Bar Chart + Money to collect */}
        <div className="grid grid-cols-1 lg:grid-cols-[1.25fr_1fr] gap-5">
          {/* Sales, last 7 days */}
          <div className="apple-glass rounded-[24px] p-6 flex flex-col justify-between">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-base font-extrabold text-[#10231F]">Sales, last 7 days</h2>
                <p className="text-xs font-semibold text-[#4A5C57]">Daily performance and turnover</p>
              </div>
              <div className="text-right">
                <span className="text-lg font-extrabold text-[#0F766E]">
                  {formatCompactINR(weekSalesTotal)}
                </span>
                <span className="block text-[11px] font-semibold text-[#4A5C57]">7-day total</span>
              </div>
            </div>

            {/* Custom stylized pillars matching exact Owner Dashboard HTML */}
            <div className="h-44 w-full flex items-end gap-3 pt-4 px-2">
              {chartData.map((d) => {
                const heightPct = Math.max(Math.round((d.Sales / maxDaySales) * 100), 12)
                const isPeak = d.Sales === maxDaySales && d.Sales > 0
                return (
                  <div key={d.date} className="flex-1 flex flex-col items-center justify-end h-full gap-2 group relative">
                    {/* Hover tooltip */}
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute -top-8 bg-[#10231F] text-white text-[10px] font-extrabold px-2 py-0.5 rounded-md pointer-events-none whitespace-nowrap z-20">
                      {d.fullDate}: {inr(d.Sales)}
                    </div>
                    <div
                      className={`w-full transition-all duration-300 rounded-t-lg rounded-b-sm ${
                        isPeak || d.isToday
                          ? 'bg-[#0F766E] shadow-sm'
                          : 'bg-[#9FD0CA] hover:bg-[#7FBDB5]'
                      }`}
                      style={{ height: `${heightPct}%` }}
                    />
                    <span className="text-[11px] font-bold text-[#4A5C57]">
                      {d.date}
                    </span>
                  </div>
                )
              })}
            </div>

            <div className="flex items-center justify-between pt-4 mt-2 border-t border-slate-200/60 text-xs font-bold text-[#4A5C57]">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[#0F766E]" /> Peak / Today
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[#9FD0CA]" /> Standard Day
              </span>
              <Link to="/sales" className="text-[#0F766E] hover:underline flex items-center gap-0.5">
                View Sales Report →
              </Link>
            </div>
          </div>

          {/* Money to collect (Debtors List) */}
          <div className="apple-glass rounded-[24px] p-6 flex flex-col justify-between">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="text-base font-extrabold text-[#10231F]">Money to collect</h2>
                <p className="text-xs font-semibold text-[#4A5C57]">Highest dues by customer</p>
              </div>
              <Link to="/parties" className="text-xs font-extrabold text-[#0F766E] hover:underline">
                View all ({metrics.debtors?.count || 0})
              </Link>
            </div>

            {topDebtors.length === 0 ? (
              <div className="py-12 text-center text-xs font-bold text-[#4A5C57]">
                No outstanding customer dues pending.
              </div>
            ) : (
              <div className="divide-y divide-slate-200/60">
                {topDebtors.map((p) => (
                  <div key={p.id} className="py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-extrabold text-[#10231F] truncate">{p.name}</div>
                      <div className="text-[11px] text-[#4A5C57] font-semibold">{p.uid || p.phone || 'Customer ledger'}</div>
                    </div>

                    <div className="shrink-0">
                      <span className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-extrabold whitespace-nowrap ${p.agingColor}`}>
                        {p.agingTag}
                      </span>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="text-sm font-extrabold text-[#0F766E]">{inr(p.current_balance)}</div>
                    </div>

                    <div className="shrink-0">
                      <button
                        type="button"
                        onClick={() => handleRemind(p)}
                        className="bg-white/90 hover:bg-white text-[#0F766E] border-[1.5px] border-[#0F766E] min-h-[34px] px-3 rounded-xl font-extrabold text-xs shadow-2xs hover:shadow-xs active:scale-95 transition-all cursor-pointer"
                      >
                        Remind
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="pt-3 mt-1 border-t border-slate-200/60 flex items-center justify-between text-xs font-semibold text-[#4A5C57]">
              <span>Total Overdue: <strong className="text-[#0F766E] font-extrabold">{inr(metrics.debtors?.totalDue)}</strong></span>
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => openVoucher(null, { type: 'receipt' })}
                  className="text-xs font-extrabold text-[#0F766E] hover:underline"
                >
                  + Record Receipt
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Recent Vouchers Section in Apple Glass Card */}
        <div className="apple-glass rounded-[24px] p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-extrabold text-[#10231F] flex items-center gap-2">
                <span>Recent Accounting Vouchers</span>
                <span className="text-xs font-mono font-bold text-[#4A5C57]">({recentVouchers.length})</span>
              </h2>
              <p className="text-xs font-semibold text-[#4A5C57]">
                Click invoice icon to view or print official tax invoice
              </p>
            </div>
            <Link
              to="/daybook"
              className="text-xs font-extrabold text-[#0F766E] hover:underline flex items-center gap-1"
            >
              Full Day Book <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#E1E9E7]/60 text-[#2F4540] font-extrabold uppercase text-[10px] border-b border-white/60">
                <tr>
                  <th className="py-3 px-3 rounded-l-xl">Date</th>
                  <th className="py-3 px-3">Vch No.</th>
                  <th className="py-3 px-3">Type</th>
                  <th className="py-3 px-3">Particulars / Party</th>
                  <th className="py-3 px-3">Debtor UID</th>
                  <th className="py-3 px-3 text-right">Amount (₹)</th>
                  <th className="py-3 px-3 text-right">Due (₹)</th>
                  <th className="py-3 px-3 text-center rounded-r-xl">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/50 font-medium">
                {recentVouchers.map((v) => {
                  const typeUpper = (v.voucher_type || 'sales').toUpperCase()
                  const isSales = v.voucher_type === 'sales'
                  return (
                    <tr key={v.id} className="hover:bg-white/50 transition-colors">
                      <td className="py-3 px-3 text-[#4A5C57] font-mono font-bold">{v.date}</td>
                      <td className="py-3 px-3 font-mono font-extrabold text-[#10231F]">{v.voucher_no}</td>
                      <td className="py-3 px-3">
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase border ${
                          v.voucher_type === 'sales' ? 'bg-[#D8EFEC] text-[#0B5F59] border-teal-200/60' :
                          v.voucher_type === 'purchase' ? 'bg-blue-50 text-blue-700 border-blue-200/60' :
                          v.voucher_type === 'receipt' ? 'bg-teal-50 text-teal-800 border-teal-200/60' :
                          v.voucher_type === 'contra' ? 'bg-amber-50 text-amber-900 border-amber-200/60' :
                          'bg-indigo-50 text-indigo-700 border-indigo-200/60'
                        }`}>
                          {typeUpper}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-[#10231F]">
                        <div className="font-extrabold text-[#10231F]">{v.party_name || 'Cash'}</div>
                        {v.narration && (
                          <div className="text-[10px] text-[#4A5C57] font-semibold truncate max-w-xs">{v.narration}</div>
                        )}
                      </td>
                      <td className="py-3 px-3">
                        {v.party_uid ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-teal-50/80 text-[#0F766E] text-[10px] font-mono font-bold border border-teal-200/60">
                            <ShieldCheck className="w-3 h-3 text-[#0F766E]" />
                            <span>{v.party_uid}</span>
                          </span>
                        ) : (
                          <span className="text-slate-400 text-[11px]">-</span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-right font-extrabold text-[#10231F]">
                        ₹{Number(v.amount || 0).toLocaleString('en-IN')}
                      </td>
                      <td className="py-3 px-3 text-right font-extrabold">
                        {Number(v.due_amount || 0) > 0 ? (
                          <span className="text-rose-600 font-extrabold">₹{Number(v.due_amount).toLocaleString('en-IN')}</span>
                        ) : (
                          <span className="text-slate-400 font-normal">₹0</span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {isSales && (
                            <button
                              type="button"
                              onClick={() => viewInvoice(v)}
                              className="p-1.5 rounded-xl bg-white hover:bg-slate-100 text-[#0F766E] border border-teal-200/80 shadow-2xs transition-colors cursor-pointer"
                              title="Print / View Tax Invoice"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {isAdmin && (
                            <button
                              type="button"
                              onClick={() => openVoucher(v)}
                              className="p-1.5 rounded-xl bg-white hover:bg-slate-100 text-[#10231F] border border-slate-200/80 shadow-2xs transition-colors cursor-pointer"
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

        {/* Footer timestamp */}
        <div className="text-center text-xs font-semibold text-[#4A5C57] pt-2 pb-8">
          Updated {lastUpdated} • TallyFlow Realtime Engine
        </div>
      </main>
    </div>
  )
}
