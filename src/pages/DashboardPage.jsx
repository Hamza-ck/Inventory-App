import { useState, useEffect, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Download,
  Eye,
  EyeOff,
  GripVertical,
  Plus,
  ArrowUpRight,
  TrendingUp,
  TrendingDown,
  Calendar,
  Share2,
  Check,
  Building2,
  Sliders,
  Send,
  MessageCircle,
  Clock,
  Sparkles,
} from 'lucide-react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts'
import { useAuth } from '../context/AuthContext'
import { accDb } from '../lib/accountingDb'
import Nav from '../components/Nav'

export default function DashboardPage() {
  const {
    role,
    isAdmin,
    isOwner,
    setRole,
    shopName,
    ownerPermissions,
    updateOwnerPermission,
    cardOrder,
    updateCardOrder,
  } = useAuth()

  const [period, setPeriod] = useState('Today') // 'Today' | 'Week' | 'Month'
  const [editLayout, setEditLayout] = useState(false)
  const [downloadSuccess, setDownloadSuccess] = useState(false)
  const [remindSent, setRemindSent] = useState(null)
  const navigate = useNavigate()

  // Format currency in Indian standard Lakhs/Crores
  const formatMoney = (val, compact = true) => {
    const num = Number(val) || 0
    if (compact) {
      if (Math.abs(num) >= 10000000) return `₹${(num / 10000000).toFixed(1)}Cr`
      if (Math.abs(num) >= 100000) return `₹${(num / 100000).toFixed(1)}L`
      if (Math.abs(num) >= 1000) return `₹${(num / 1000).toFixed(1)}K`
      return `₹${num}`
    }
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(num)
  }

  // Exact metrics as per PDF specification
  const metrics = useMemo(() => {
    if (period === 'Today') {
      return {
        sales: { value: '₹1.42L', diff: '▲ 12% vs yesterday', isPositive: true },
        profit: { value: '₹21.4K', diff: '▲ 8% vs yesterday', isPositive: true },
        expenses: { value: '₹9.8K', diff: '▼ 4% vs yesterday', isPositive: false },
        debtors: { value: '₹8.4L', detail: 'They owe you · 23' },
        creditors: { value: '₹5.1L', detail: 'You owe · 9' },
        inventory: { value: '₹22.6L', detail: 'Stock value' },
        loans: { value: '₹3.0L', detail: 'Net balance' },
      }
    } else if (period === 'Week') {
      return {
        sales: { value: '₹9.8L', diff: '▲ 14% vs last week', isPositive: true },
        profit: { value: '₹1.65L', diff: '▲ 10% vs last week', isPositive: true },
        expenses: { value: '₹68K', diff: '▼ 2% vs last week', isPositive: false },
        debtors: { value: '₹8.4L', detail: 'They owe you · 23' },
        creditors: { value: '₹5.1L', detail: 'You owe · 9' },
        inventory: { value: '₹22.6L', detail: 'Stock value' },
        loans: { value: '₹3.0L', detail: 'Net balance' },
      }
    } else {
      return {
        sales: { value: '₹41.2L', diff: '▲ 18% vs last month', isPositive: true },
        profit: { value: '₹6.8L', diff: '▲ 15% vs last month', isPositive: true },
        expenses: { value: '₹3.1L', diff: '▼ 4% vs last month', isPositive: false },
        debtors: { value: '₹8.4L', detail: 'They owe you · 23' },
        creditors: { value: '₹5.1L', detail: 'You owe · 9' },
        inventory: { value: '₹22.6L', detail: 'Stock value' },
        loans: { value: '₹3.0L', detail: 'Net balance' },
      }
    }
  }, [period])

  // 7-day Sales Bar Chart data (PDF Page 3 & 5)
  const sales7Days = [
    { day: 'Mon', amount: 110000, display: '₹1.1L' },
    { day: 'Tue', amount: 140000, display: '₹1.4L' },
    { day: 'Wed', amount: 90000, display: '₹0.9L' },
    { day: 'Thu', amount: 160000, display: '₹1.6L' },
    { day: 'Fri', amount: 130000, display: '₹1.3L' },
    { day: 'Sat', amount: 210000, display: '₹2.1L', isPeak: true },
    { day: 'Sun', amount: 140000, display: '₹1.4L' },
  ]

  // Money to collect list (PDF Page 5)
  const moneyToCollect = [
    {
      name: 'Rahul Mobile Hub',
      age: '60d+',
      ageTone: 'bg-[#fcebe6] text-[#ba3e29]',
      amount: '₹1,84,200',
      phone: '+919876543210',
    },
    {
      name: 'City Gadget Point',
      age: '31–60d',
      ageTone: 'bg-[#e2f3ec] text-[#0d786d]',
      amount: '₹96,500',
      phone: '+919811234567',
    },
    {
      name: 'Sen Telecom',
      age: '0–30d',
      ageTone: 'bg-[#e3f2ec] text-[#136b60]',
      amount: '₹71,900',
      phone: '+919830123456',
    },
    {
      name: 'Mitra Cover House',
      age: '0–30d',
      ageTone: 'bg-[#e3f2ec] text-[#136b60]',
      amount: '₹48,300',
      phone: '+919845098765',
    },
  ]

  const handleSendReminder = (customer) => {
    const text = encodeURIComponent(
      `Hello ${customer.name}, gentle payment reminder from ${shopName} for outstanding balance of ${customer.amount} (${customer.age}). Please arrange settlement at your earliest convenience. Thank you!`
    )
    window.open(`https://wa.me/${customer.phone.replace(/[^0-9]/g, '')}?text=${text}`, '_blank')
    setRemindSent(customer.name)
    setTimeout(() => setRemindSent(null), 3000)
  }

  const handleDownloadReport = () => {
    const rows = [
      ['MEEMX ERP / TallyFlow - Executive Summary Report'],
      ['Period', period],
      ['Generated On', new Date().toLocaleString()],
      [],
      ['Metric', 'Figure'],
      ['Sales', metrics.sales.value],
      ['Gross & Net Profit', metrics.profit.value],
      ['Expenses', metrics.expenses.value],
      ['Debtors (They owe you)', metrics.debtors.value],
      ['Creditors (You owe)', metrics.creditors.value],
      ['Inventory (Stock value)', metrics.inventory.value],
      ['Loans & Advances', metrics.loans.value],
      [],
      ['Customer', 'Aging', 'Amount', 'Phone'],
      ...moneyToCollect.map((c) => [c.name, c.age, c.amount, c.phone]),
    ]

    const csvContent = 'data:text/csv;charset=utf-8,' + rows.map((e) => e.join(',')).join('\n')
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute('download', `Executive_Summary_${period}_${new Date().toISOString().slice(0, 10)}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)

    setDownloadSuccess(true)
    setTimeout(() => setDownloadSuccess(false), 3000)
  }

  // Determine card definition dictionary
  const cardDefinitions = {
    sales: {
      id: 'sales',
      label: 'Sales today',
      to: '/sales',
      value: metrics.sales.value,
      badge: metrics.sales.diff,
      isFeatured: true,
    },
    profit: {
      id: 'profit',
      label: 'Profit',
      to: '/sales',
      value: metrics.profit.value,
      badge: metrics.profit.diff,
      accent: 'border-l-4 border-l-[#c25e19]',
    },
    expenses: {
      id: 'expenses',
      label: 'Expenses',
      to: '/expenses',
      value: metrics.expenses.value,
      badge: metrics.expenses.diff,
      accent: 'border-l-4 border-l-[#b07d3b]',
    },
    debtors: {
      id: 'debtors',
      label: 'Debtors',
      to: '/debtors',
      value: metrics.debtors.value,
      detail: metrics.debtors.detail,
      accent: 'border-l-4 border-l-[#0b786e]',
    },
    creditors: {
      id: 'creditors',
      label: 'Creditors',
      to: '/creditors',
      value: metrics.creditors.value,
      detail: metrics.creditors.detail,
      accent: 'border-l-4 border-l-[#c25e19]',
    },
    inventory: {
      id: 'inventory',
      label: 'Inventory',
      to: '/inventory',
      value: metrics.inventory.value,
      detail: metrics.inventory.detail,
      accent: 'border-l-4 border-l-[#0b3832]',
    },
    loans: {
      id: 'loans',
      label: 'Loans & Advances',
      to: '/loans',
      value: metrics.loans.value,
      detail: metrics.loans.detail,
      accent: 'border-l-4 border-l-[#2a4e58]',
    },
  }

  // Move card up or down in Admin Edit Layout mode
  const moveCard = (index, direction) => {
    const newOrder = [...cardOrder]
    const targetIndex = index + direction
    if (targetIndex < 0 || targetIndex >= newOrder.length) return
    const temp = newOrder[index]
    newOrder[index] = newOrder[targetIndex]
    newOrder[targetIndex] = temp
    updateCardOrder(newOrder)
  }

  // Filter cards: If in Owner view, ONLY show cards permitted by Admin!
  const visibleCardIds = cardOrder.filter((id) => {
    if (editLayout && isAdmin) return true
    if (isAdmin) return true
    return ownerPermissions[id] !== false
  })

  return (
    <div className="min-h-screen bg-[#f4f7f4] pb-24 lg:pl-64 lg:pb-10">
      <Nav />

      {/* Main Page Container */}
      <main className="mx-auto max-w-6xl px-4 pt-4 sm:px-6 sm:pt-6">
        {/* ================= TOP MOBILE HEADER (PDF Page 1 & 15) ================= */}
        <header className="mb-4 flex items-center justify-between lg:hidden">
          <div>
            <span className="text-[12px] font-medium text-[#5f7971]">Good evening</span>
            <h1 className="text-[20px] font-extrabold tracking-tight text-[#11352e]">
              {editLayout ? `${shopName} Dashboard` : shopName}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            {isAdmin && (
              <button
                type="button"
                onClick={() => setEditLayout(!editLayout)}
                className={`rounded-full px-3 py-1.5 text-xs font-extrabold transition shadow-xs ${
                  editLayout
                    ? 'bg-[#0d6e63] text-white'
                    : 'bg-[#e2f0ea] text-[#0d6e63] hover:bg-[#d6e9e1]'
                }`}
              >
                {editLayout ? 'Done' : 'Admin'}
              </button>
            )}
            <button
              type="button"
              onClick={() => setRole(isAdmin ? 'owner' : 'admin')}
              className="grid h-10 w-10 place-items-center rounded-full bg-[#0d6e63] text-white text-base font-extrabold shadow-sm active:scale-95 transition"
              title="Tap to toggle between Admin and Owner view"
            >
              {isAdmin ? 'A' : 'S'}
            </button>
          </div>
        </header>

        {/* ================= TOP DESKTOP HEADER (PDF Page 5 & 13) ================= */}
        <header className="hidden items-center justify-between pb-5 lg:flex">
          <div>
            <h1 className="text-[26px] font-extrabold tracking-tight text-[#0d342d]">
              {isAdmin && editLayout ? 'Dashboard' : 'Good evening'}
            </h1>
            <p className="mt-0.5 text-xs text-[#637d75]">
              {isAdmin && editLayout
                ? 'Same screen your owner sees, with edit controls'
                : 'Here is how your business is doing'}
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* View Mode Toggle Buttons (PDF Page 13) */}
            <div className="flex items-center rounded-2xl bg-white p-1 border border-[#e1e9e3] shadow-xs">
              <button
                type="button"
                onClick={() => setRole('admin')}
                className={`rounded-xl px-3.5 py-1.5 text-xs font-bold transition ${
                  isAdmin ? 'bg-[#0e655d] text-white shadow-xs' : 'text-[#5d776f] hover:text-[#0e655d]'
                }`}
              >
                Admin view
              </button>
              <button
                type="button"
                onClick={() => {
                  setRole('owner')
                  setEditLayout(false)
                }}
                className={`rounded-xl px-3.5 py-1.5 text-xs font-bold transition ${
                  isOwner ? 'bg-[#0e655d] text-white shadow-xs' : 'text-[#5d776f] hover:text-[#0e655d]'
                }`}
              >
                Owner view
              </button>
            </div>

            {/* Time Filter Pills: Today / Week / Month */}
            <div className="flex items-center rounded-2xl bg-white p-1 border border-[#e1e9e3] shadow-xs">
              {['Today', 'Week', 'Month'].map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPeriod(p)}
                  className={`rounded-xl px-3.5 py-1.5 text-xs font-bold transition ${
                    period === p ? 'bg-[#0e655d] text-white shadow-xs' : 'text-[#5d776f] hover:text-[#0e655d]'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>

            {/* Download Report Button */}
            <button
              type="button"
              onClick={handleDownloadReport}
              className="flex items-center gap-2 rounded-2xl bg-[#0e655d] px-4 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-[#0b544d] transition active:scale-95"
            >
              {downloadSuccess ? <Check size={15} /> : <Download size={15} />}
              {downloadSuccess ? 'Downloaded!' : 'Download report'}
            </button>
          </div>
        </header>

        {/* Mobile Period Filter (PDF Page 1) */}
        <div className="mb-4 flex items-center justify-between rounded-2xl bg-white p-1 border border-[#e1e9e3] shadow-xs lg:hidden">
          {['Today', 'Week', 'Month'].map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              className={`flex-1 rounded-xl py-2 text-xs font-bold text-center transition ${
                period === p
                  ? 'bg-white text-[#0e655d] shadow-sm'
                  : 'text-[#6e867f] hover:text-[#0e655d]'
              }`}
            >
              {p}
            </button>
          ))}
        </div>

        {/* ================= EDIT LAYOUT BANNER (PDF Page 13 Desktop & Page 15 Mobile) ================= */}
        {isAdmin && editLayout && (
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#cbe4d7] bg-[#eef7f2] p-3 sm:p-4 text-xs">
            <div className="flex items-center gap-2 text-[#185344] font-semibold">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-[#0e655d] text-white">
                <Eye size={15} />
              </span>
              <span>Edit layout is on. Drag to reorder, tap the eye to hide a card from the owner.</span>
            </div>
            <div className="flex items-center gap-2 ml-auto">
              <button
                type="button"
                onClick={() => navigate('/settings')}
                className="rounded-xl border border-[#b7dcce] bg-white px-3 py-1.5 font-bold text-[#115748] hover:bg-[#e4f3ed]"
              >
                Visibility settings
              </button>
              <button
                type="button"
                onClick={() => setEditLayout(false)}
                className="rounded-xl bg-[#0e655d] px-4 py-1.5 font-bold text-white hover:bg-[#095049]"
              >
                Done
              </button>
            </div>
          </div>
        )}

        {/* Admin Toggle button on Desktop when not in edit mode */}
        {isAdmin && !editLayout && (
          <div className="mb-4 hidden items-center justify-end lg:flex">
            <button
              type="button"
              onClick={() => setEditLayout(true)}
              className="flex items-center gap-1.5 text-xs font-bold text-[#0e655d] hover:underline"
            >
              <Sliders size={14} /> Customize owner layout
            </button>
          </div>
        )}

        {/* ================= KPI CARDS GRID (PDF Page 1, 5, 13, 15) ================= */}
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 sm:gap-4">
          {visibleCardIds.map((cardId, index) => {
            const card = cardDefinitions[cardId]
            if (!card) return null
            const isOwnerHidden = ownerPermissions[cardId] === false

            // 1. Featured Big Emerald Sales Card (PDF Page 1 & 5)
            if (card.isFeatured) {
              return (
                <div
                  key={card.id}
                  className={`relative col-span-1 sm:col-span-2 rounded-3xl p-6 text-white transition shadow-sm ${
                    editLayout
                      ? 'border-2 border-dashed border-white/60 bg-[#0e655d]'
                      : 'bg-[#0e655d] hover:shadow-md'
                  }`}
                >
                  {/* Eye toggle for Admin in Edit Mode */}
                  {editLayout && isAdmin && (
                    <div className="absolute top-4 right-4 flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          updateOwnerPermission(card.id, isOwnerHidden)
                        }}
                        className="grid h-8 w-8 place-items-center rounded-full bg-white text-[#0e655d] shadow-sm hover:scale-105"
                        title={isOwnerHidden ? 'Show to owner' : 'Hide from owner'}
                      >
                        {isOwnerHidden ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  )}

                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-[#a5dcd0]">
                      {card.label}
                    </span>
                    <Link
                      to={card.to}
                      className="rounded-full bg-white/10 p-1 text-[#bad4cc] hover:text-white"
                      title="View all sales"
                    >
                      <ArrowUpRight size={16} />
                    </Link>
                  </div>

                  <strong className="mt-4 block text-[38px] font-extrabold tracking-tight sm:text-[44px]">
                    {card.value}
                  </strong>

                  <div className="mt-3 flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1 text-xs font-bold text-[#0e655d] shadow-xs">
                      {card.badge}
                    </span>
                    {isOwnerHidden && (
                      <span className="rounded-full bg-[#fae8e5] px-2 py-0.5 text-[10px] font-bold text-[#ba3b2a]">
                        Hidden from Owner
                      </span>
                    )}
                  </div>
                </div>
              )
            }

            // 2. Standard Metric Cards with Left Accent Borders (PDF Page 1 & 5)
            return (
              <div
                key={card.id}
                className={`group relative flex min-h-[120px] flex-col justify-between rounded-2xl bg-white p-4 transition ${
                  editLayout
                    ? 'border-2 border-dashed border-[#b6d9cc]'
                    : `border border-[#e1e9e3] ${card.accent} shadow-xs hover:-translate-y-0.5 hover:shadow-md`
                }`}
              >
                {/* Admin edit controls */}
                {editLayout && isAdmin && (
                  <div className="absolute top-3 right-3 flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => moveCard(index, -1)}
                      disabled={index === 0}
                      className="p-1 text-[#658279] hover:text-[#0e655d] disabled:opacity-30"
                      title="Move card left/up"
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      onClick={() => moveCard(index, 1)}
                      disabled={index === visibleCardIds.length - 1}
                      className="p-1 text-[#658279] hover:text-[#0e655d] disabled:opacity-30"
                      title="Move card right/down"
                    >
                      ▼
                    </button>
                    <button
                      type="button"
                      onClick={() => updateOwnerPermission(card.id, isOwnerHidden)}
                      className={`grid h-7 w-7 place-items-center rounded-full shadow-xs ${
                        isOwnerHidden
                          ? 'bg-[#feeae6] text-[#b73725]'
                          : 'bg-[#e2f3ec] text-[#0e655d]'
                      }`}
                      title={isOwnerHidden ? 'Show to owner' : 'Hide from owner'}
                    >
                      {isOwnerHidden ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                )}

                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-[#657d75]">
                      {card.label}
                    </span>
                    {!editLayout && (
                      <Link
                        to={card.to}
                        className="opacity-0 group-hover:opacity-100 transition text-[#8fa79f] hover:text-[#0e655d]"
                      >
                        <ArrowUpRight size={15} />
                      </Link>
                    )}
                  </div>
                  <strong className="mt-2 block text-[24px] font-extrabold tracking-tight text-[#16362f]">
                    {card.value}
                  </strong>
                </div>

                <div className="mt-2 flex items-center justify-between text-[11px] text-[#6d857d]">
                  {card.badge && (
                    <span className="font-semibold text-[#526e66]">
                      {card.badge}
                    </span>
                  )}
                  {card.detail && (
                    <span className="font-medium text-[#7a938c]">
                      {card.detail}
                    </span>
                  )}
                  {isOwnerHidden && (
                    <span className="text-[10px] font-bold text-[#ba3b2a]">
                      Hidden from Owner
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </section>

        {/* ================= DESKTOP LOWER SECTION: SALES CHART & MONEY TO COLLECT (PDF Page 5) ================= */}
        <section className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-12">
          {/* 7-day Sales Bar Chart (PDF Page 5 Left Column) */}
          <div className="rounded-3xl border border-[#e1e9e3] bg-white p-5 lg:col-span-7 shadow-xs">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-extrabold text-[#143d35]">
                  Sales, last 7 days
                </h3>
                <span className="text-xs text-[#718b82]">Daily revenue trend</span>
              </div>
              <strong className="text-base font-extrabold text-[#0e655d]">
                ₹9.8L
              </strong>
            </div>

            <div className="h-52 w-full pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={sales7Days} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <XAxis
                    dataKey="day"
                    stroke="#8da39b"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    stroke="#8da39b"
                    fontSize={10}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => `₹${v / 100000}L`}
                  />
                  <Tooltip
                    cursor={{ fill: '#f0f6f3' }}
                    formatter={(val) => [`₹${(val / 100000).toFixed(1)}L`, 'Revenue']}
                    contentStyle={{
                      backgroundColor: '#0e655d',
                      borderRadius: '12px',
                      color: '#ffffff',
                      border: 'none',
                      fontSize: '12px',
                      fontWeight: 'bold',
                    }}
                  />
                  <Bar dataKey="amount" radius={[8, 8, 0, 0]}>
                    {sales7Days.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={entry.isPeak ? '#0e655d' : '#8cc0b3'}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Money to collect (PDF Page 5 Right Column) */}
          <div className="rounded-3xl border border-[#e1e9e3] bg-white p-5 lg:col-span-5 shadow-xs">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-extrabold text-[#143d35]">
                Money to collect
              </h3>
              <Link
                to="/debtors"
                className="text-xs font-bold text-[#0e655d] hover:underline"
              >
                View all debtors
              </Link>
            </div>

            <div className="space-y-3">
              {moneyToCollect.map((item) => (
                <div
                  key={item.name}
                  className="flex items-center justify-between rounded-2xl border border-[#edf3f0] bg-[#fafcfb] p-3 transition hover:bg-[#f3f8f5]"
                >
                  <div className="min-w-0 pr-2">
                    <div className="flex items-center gap-2">
                      <strong className="block truncate text-xs font-bold text-[#143d35]">
                        {item.name}
                      </strong>
                      <span className={`rounded-md px-2 py-0.5 text-[10px] font-bold ${item.ageTone}`}>
                        {item.age}
                      </span>
                    </div>
                    <span className="block text-[13px] font-extrabold text-[#173a32] mt-0.5">
                      {item.amount}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleSendReminder(item)}
                    className="flex items-center gap-1 rounded-xl border border-[#cbe3d9] bg-white px-3 py-1.5 text-xs font-bold text-[#0e655d] shadow-2xs hover:bg-[#0e655d] hover:text-white transition active:scale-95"
                  >
                    <MessageCircle size={13} />
                    {remindSent === item.name ? 'Opened!' : 'Remind'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Bottom Timestamp (PDF Page 1 & 5) */}
        <footer className="mt-8 mb-4 text-center text-xs text-[#78938a]">
          Updated 17 Oct, 6:40 PM
        </footer>
      </main>
    </div>
  )
}
