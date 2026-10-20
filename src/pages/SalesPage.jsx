import { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ChevronLeft,
  ArrowDownToLine,
  Plus,
  Receipt,
  Search,
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
import Nav from '../components/Nav'
import InvoicePrintModal from '../components/InvoicePrintModal'
import VoucherModal from '../components/VoucherModal'
import { accDb } from '../lib/accountingDb'

// Baseline PDF invoices (Page 3) as fallback seed
const DEFAULT_PDF_INVOICES = [
  {
    id: 1,
    voucher_no: 'INV-0412',
    party_name: 'Rahul Mobile Hub',
    party_phone: '+919876543210',
    party_uid: 'UID-CUST-1001',
    date: '2026-10-17',
    displayDate: '17 Oct',
    amount: 48200,
    paid_amount: 0,
    due_amount: 48200,
    payment_mode: 'Credit',
    status: 'Due',
    statusTone: 'bg-[#fef3eb] text-[#c25e19]',
    items: [
      { sku: 'CC-IP15-CLR', name: 'iPhone 15 · Clear Case', qty: 120, rate: 350, amount: 42000 },
      { sku: 'TG-IP15-PRM', name: 'iPhone 15 Pro Max 9D Glass', qty: 80, rate: 199, amount: 6200 },
    ],
  },
  {
    id: 2,
    voucher_no: 'INV-0411',
    party_name: 'Walk-in customer',
    party_phone: '',
    party_uid: null,
    date: '2026-10-17',
    displayDate: '17 Oct',
    amount: 2350,
    paid_amount: 2350,
    due_amount: 0,
    payment_mode: 'Cash',
    status: 'Paid',
    statusTone: 'bg-[#e2f3ec] text-[#0d786d]',
    items: [
      { sku: 'SL-RN13-BLK', name: 'Redmi Note 13 · Silicone', qty: 5, rate: 250, amount: 1250 },
      { sku: 'CBL-BRD-TPE', name: 'Braided Type-C Fast Cable', qty: 5, rate: 199, amount: 995 },
    ],
  },
  {
    id: 3,
    voucher_no: 'INV-0410',
    party_name: 'Sen Telecom',
    party_phone: '+919830123456',
    party_uid: 'UID-CUST-1003',
    date: '2026-10-16',
    displayDate: '16 Oct',
    amount: 71900,
    paid_amount: 71900,
    due_amount: 0,
    payment_mode: 'UPI',
    status: 'Paid',
    statusTone: 'bg-[#e2f3ec] text-[#0d786d]',
    items: [
      { sku: 'CHG-65W-GAN', name: '65W Fast GaN Dual Charger', qty: 50, rate: 1299, amount: 64950 },
      { sku: 'TG-IP15-PRM', name: 'iPhone 15 Pro Max 9D Glass', qty: 35, rate: 199, amount: 6950 },
    ],
  },
  {
    id: 4,
    voucher_no: 'INV-0409',
    party_name: 'Mitra Cover House',
    party_phone: '+919845098765',
    party_uid: 'UID-CUST-1004',
    date: '2026-10-15',
    displayDate: '15 Oct',
    amount: 91450,
    paid_amount: 91450,
    due_amount: 0,
    payment_mode: 'HDFC Bank',
    status: 'Paid',
    statusTone: 'bg-[#e2f3ec] text-[#0d786d]',
    items: [
      { sku: 'AUD-TWS-AIR', name: 'ANC Pro True Wireless Earbuds', qty: 50, rate: 1699, amount: 84950 },
      { sku: 'CC-IP15-CLR', name: 'iPhone 15 · Clear Case', qty: 18, rate: 350, amount: 6500 },
    ],
  },
]

export default function SalesPage() {
  const navigate = useNavigate()
  const [selectedInvoice, setSelectedInvoice] = useState(null)
  const [newVoucherOpen, setNewVoucherOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [invoices, setInvoices] = useState(DEFAULT_PDF_INVOICES)

  // 7-day Sales Bar Chart data (PDF Page 3)
  const sales7Days = [
    { day: 'Mon', amount: 110000, display: '₹1.1L' },
    { day: 'Tue', amount: 140000, display: '₹1.4L' },
    { day: 'Wed', amount: 90000, display: '₹0.9L' },
    { day: 'Thu', amount: 160000, display: '₹1.6L' },
    { day: 'Fri', amount: 130000, display: '₹1.3L' },
    { day: 'Sat', amount: 210000, display: '₹2.1L', isPeak: true },
    { day: 'Sun', amount: 140000, display: '₹1.4L' },
  ]

  // Format date helper for invoice cards
  const formatInvoiceDate = (dateStr) => {
    if (!dateStr) return 'Today'
    try {
      const d = new Date(dateStr)
      if (isNaN(d.getTime())) return dateStr
      return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
    } catch {
      return dateStr
    }
  }

  // Load live invoices from Dexie DB
  const loadInvoices = useCallback(async () => {
    try {
      const dbVouchers = await accDb.vouchers
        .where('voucher_type')
        .equals('sales')
        .reverse()
        .sortBy('id')

      if (dbVouchers && dbVouchers.length > 0) {
        // Map db records with proper status colors and display dates
        const mapped = dbVouchers.map((v) => {
          const isDue = Number(v.due_amount) > 0 || v.status === 'Due'
          return {
            ...v,
            displayDate: v.displayDate || formatInvoiceDate(v.date),
            status: isDue ? 'Due' : 'Paid',
            statusTone: isDue
              ? 'bg-[#fef3eb] text-[#c25e19]'
              : 'bg-[#e2f3ec] text-[#0d786d]',
          }
        })

        // Merge with DEFAULT_PDF_INVOICES so baseline examples remain if not in db
        const existingNos = new Set(mapped.map((m) => m.voucher_no))
        const remainingDefaults = DEFAULT_PDF_INVOICES.filter((d) => !existingNos.has(d.voucher_no))
        setInvoices([...mapped, ...remainingDefaults])
      } else {
        setInvoices(DEFAULT_PDF_INVOICES)
      }
    } catch (err) {
      console.warn('Error fetching invoices from Dexie:', err)
      setInvoices(DEFAULT_PDF_INVOICES)
    }
  }, [])

  useEffect(() => {
    loadInvoices()

    const handleUpdate = () => {
      loadInvoices()
    }

    window.addEventListener('accounting-data-updated', handleUpdate)
    return () => {
      window.removeEventListener('accounting-data-updated', handleUpdate)
    }
  }, [loadInvoices])

  const filteredInvoices = useMemo(() => {
    if (!search.trim()) return invoices
    const q = search.toLowerCase()
    return invoices.filter(
      (inv) =>
        String(inv.voucher_no || '').toLowerCase().includes(q) ||
        String(inv.party_name || '').toLowerCase().includes(q) ||
        String(inv.party_uid || '').toLowerCase().includes(q)
    )
  }, [invoices, search])

  return (
    <div className="min-h-screen bg-[#f4f7f4] pb-28 lg:pl-64 lg:pb-10 font-sans">
      <Nav />

      <main className="mx-auto max-w-2xl px-4 pt-4 sm:px-6 sm:pt-6">
        {/* Top Header with Back button and "+ New invoice" button (PDF Page 3) */}
        <header className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => navigate('/')}
              className="grid h-9 w-9 place-items-center rounded-xl bg-white text-[#153e34] shadow-2xs hover:bg-[#ebf4ef] transition"
              aria-label="Back to dashboard"
            >
              <ChevronLeft size={20} />
            </button>
            <h1 className="text-[22px] font-extrabold tracking-tight text-[#11382f]">
              Sales
            </h1>
          </div>

          <button
            type="button"
            onClick={() => setNewVoucherOpen(true)}
            className="flex items-center gap-1.5 rounded-2xl bg-[#0e655d] px-3.5 py-2 text-xs font-extrabold text-white shadow-xs hover:bg-[#0a4f49] transition active:scale-95"
          >
            <Plus size={16} strokeWidth={2.5} />
            <span>New invoice</span>
          </button>
        </header>

        {/* 7 Days Performance & Bar Chart (PDF Page 3) */}
        <section className="mb-6 rounded-3xl border border-[#e1e9e3] bg-white p-5 shadow-xs">
          <div className="flex items-start justify-between">
            <div>
              <span className="text-xs font-bold text-[#6a847c]">Last 7 days</span>
              <strong className="mt-1 block text-[34px] font-extrabold tracking-tight text-[#11382f]">
                ₹9.8L
              </strong>
            </div>
            <span className="inline-flex items-center gap-1 rounded-full bg-[#e2f3ec] px-3 py-1 text-xs font-bold text-[#0d786d]">
              ▲ 12%
            </span>
          </div>

          {/* Interactive Bar Chart */}
          <div className="mt-5 h-44 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={sales7Days} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                <XAxis
                  dataKey="day"
                  stroke="#7c968e"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  stroke="#7c968e"
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => `₹${v / 100000}L`}
                />
                <Tooltip
                  cursor={{ fill: '#f0f6f3' }}
                  formatter={(val) => [`₹${(val / 100000).toFixed(1)}L`, 'Sales']}
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
                      fill={entry.isPeak ? '#0e655d' : '#8dc1b4'}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* Recent Invoices Section Header (PDF Page 3) */}
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[17px] font-extrabold text-[#11382f]">
            Recent invoices
          </h2>
          <span className="text-xs font-medium text-[#6e8a81]">
            {filteredInvoices.length} invoices
          </span>
        </div>

        {/* Search Bar */}
        <div className="mb-3 flex items-center gap-2 rounded-2xl border border-[#dbe6df] bg-white px-3.5 py-2.5 shadow-2xs focus-within:border-[#0e655d] transition">
          <Search size={16} className="text-[#7c978f] shrink-0" />
          <input
            type="text"
            className="w-full bg-transparent text-xs font-semibold text-[#11382f] outline-none placeholder:text-[#88a098]"
            placeholder="Search invoice number, customer or UID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Invoice Items List (PDF Page 3) */}
        <div className="space-y-3">
          {filteredInvoices.length > 0 ? (
            filteredInvoices.map((inv) => (
              <article
                key={inv.id || inv.voucher_no}
                onClick={() => setSelectedInvoice(inv)}
                className="flex items-center justify-between rounded-3xl border border-[#e1e9e3] bg-white p-4 sm:p-5 shadow-xs transition hover:shadow-md cursor-pointer hover:border-[#ccdcd2]"
              >
                {/* Left Column: Number, Customer & Date */}
                <div className="min-w-0 pr-3">
                  <h3 className="truncate text-sm font-extrabold text-[#11382f]">
                    {inv.voucher_no} · {inv.party_name}
                  </h3>
                  <div className="mt-1 flex items-center gap-2 text-xs text-[#708c83]">
                    <span>{inv.displayDate || inv.date}</span>
                    {inv.party_uid && (
                      <span className="font-mono text-[10px] text-[#0d786d] font-bold">
                        · {inv.party_uid}
                      </span>
                    )}
                  </div>
                </div>

                {/* Right Column: Amount, Status & Download Button (PDF Page 3) */}
                <div className="flex items-center gap-3 shrink-0">
                  <div className="text-right">
                    <strong className="block text-base font-extrabold text-[#11382f]">
                      ₹{Number(inv.amount || 0).toLocaleString('en-IN')}
                    </strong>
                    <span
                      className={`mt-0.5 inline-block rounded-md px-2 py-0.5 text-[11px] font-bold ${inv.statusTone}`}
                    >
                      {inv.status}
                    </span>
                  </div>

                  {/* Solid teal square download/arrow button matching PDF */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      setSelectedInvoice(inv)
                    }}
                    className="grid h-10 w-10 place-items-center rounded-2xl bg-[#0e655d] text-white shadow-xs hover:bg-[#095049] transition active:scale-95"
                    title="View and print invoice"
                  >
                    <ArrowDownToLine size={18} strokeWidth={2.5} />
                  </button>
                </div>
              </article>
            ))
          ) : (
            <div className="rounded-3xl border border-[#e1e9e3] bg-white p-8 text-center">
              <Receipt size={32} className="mx-auto text-[#88a39b] mb-2" />
              <p className="text-sm font-bold text-[#11382f]">No invoices found</p>
              <p className="text-xs text-[#6e8a81] mt-1">
                Try searching for a different customer name or invoice number.
              </p>
            </div>
          )}
        </div>

        {/* Tax Invoice Print & Share Modal */}
        <InvoicePrintModal
          isOpen={Boolean(selectedInvoice)}
          onClose={() => setSelectedInvoice(null)}
          invoice={selectedInvoice}
        />

        {/* Modern New Sales Invoice Modal */}
        <VoucherModal
          isOpen={newVoucherOpen}
          onClose={() => setNewVoucherOpen(false)}
          onSuccess={() => {
            loadInvoices()
            setNewVoucherOpen(false)
          }}
          onSaveAndPrint={(saved) => {
            loadInvoices()
            setNewVoucherOpen(false)
            setSelectedInvoice(saved)
          }}
        />
      </main>
    </div>
  )
}
