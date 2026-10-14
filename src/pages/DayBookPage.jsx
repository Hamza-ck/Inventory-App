import { useEffect, useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import * as XLSX from 'xlsx'
import { 
  BookOpen, 
  Search, 
  Calendar, 
  Filter, 
  PlusCircle, 
  Edit3, 
  Trash2, 
  Eye, 
  Download, 
  ShieldCheck, 
  Layers,
  ArrowRightLeft,
  X
} from 'lucide-react'
import { accDb, deleteVoucher } from '../lib/accountingDb'
import { getLocalDateString, jsQuery } from '../lib/jsQuery'
import { useAuth } from '../context/AuthContext'
import Nav from '../components/Nav'
import VoucherModal from '../components/VoucherModal'
import InvoicePrintModal from '../components/InvoicePrintModal'

export default function DayBookPage() {
  const { isAdmin, isOwner } = useAuth()
  const [vouchers, setVouchers] = useState([])
  const [loading, setLoading] = useState(true)

  // Filters
  const [searchTerm, setSearchTerm] = useState('')
  const [voucherTypeFilter, setVoucherTypeFilter] = useState('all')
  const [dateRange, setDateRange] = useState('all') // 'today', 'yesterday', 'month', 'all', 'custom'
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  // Modals
  const [isVoucherModalOpen, setIsVoucherModalOpen] = useState(false)
  const [editingVoucher, setEditingVoucher] = useState(null)
  const [selectedInvoice, setSelectedInvoice] = useState(null)
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false)

  useEffect(() => {
    load()
    function handleUpdate() { load() }
    window.addEventListener('accounting-data-updated', handleUpdate)
    return () => window.removeEventListener('accounting-data-updated', handleUpdate)
  }, [])

  async function load() {
    setLoading(true)
    const list = await accDb.vouchers.toArray()
    // Sort descending by date
    list.sort((a, b) => new Date(b.date || b.createdAt) - new Date(a.date || a.createdAt))
    setVouchers(list)
    setLoading(false)
  }

  // Filtered list using JSquery
  const filteredVouchers = useMemo(() => {
    let q = jsQuery(vouchers)

    if (voucherTypeFilter !== 'all') {
      q = q.where({ voucher_type: voucherTypeFilter })
    }

    if (searchTerm.trim()) {
      q = q.search(searchTerm, ['voucher_no', 'party_name', 'party_uid', 'narration', 'payment_mode'])
    }

    const todayStr = getLocalDateString()
    if (dateRange === 'today') {
      q = q.where((v) => (v.date || '').slice(0, 10) === todayStr)
    } else if (dateRange === 'yesterday') {
      const yesterday = new Date()
      yesterday.setDate(yesterday.getDate() - 1)
      const y = getLocalDateString(yesterday)
      q = q.where((v) => (v.date || '').slice(0, 10) === y)
    } else if (dateRange === 'month') {
      const curMonth = todayStr.slice(0, 7)
      q = q.where((v) => (v.date || '').slice(0, 7) === curMonth)
    } else if (dateRange === 'custom') {
      q = q.dateRange(startDate, endDate, 'date')
    }

    return q.execute()
  }, [vouchers, voucherTypeFilter, searchTerm, dateRange, startDate, endDate])

  // Totals of filtered list
  const totalAmount = filteredVouchers.reduce((sum, v) => sum + (Number(v.amount) || 0), 0)
  const totalDue = filteredVouchers.reduce((sum, v) => sum + (Number(v.due_amount) || 0), 0)

  async function handleDelete(id) {
    if (!isAdmin) return
    if (!confirm('Are you sure you want to delete this voucher? All inventory movements and party balances will be cleanly reversed.')) return

    await deleteVoucher(id)
    load()
  }

  function exportToExcel() {
    const exportRows = filteredVouchers.map((v) => ({
      Date: v.date,
      'Voucher No': v.voucher_no,
      'Voucher Type': (v.voucher_type || '').toUpperCase(),
      Particulars: v.party_name || 'Cash',
      'Debtor UID': v.party_uid || '',
      'Total Amount': Number(v.amount || 0),
      'Paid Amount': Number(v.paid_amount || 0),
      'Due Balance': Number(v.due_amount || 0),
      'Payment Mode': v.payment_mode || '',
      Narration: v.narration || '',
    }))

    const ws = XLSX.utils.json_to_sheet(exportRows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Tally_DayBook')
    XLSX.writeFile(wb, `Tally_DayBook_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 font-sans pb-16">
      <Nav />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 pt-6 space-y-5">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-2">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight flex items-center gap-2.5">
                <BookOpen className="w-7 h-7 text-blue-500" />
                <span>Tally Day Book</span>
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-slate-800 text-blue-400 border border-slate-700">
                {filteredVouchers.length} Vouchers
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-400 mt-1">
              Chronological financial register developed with Tally methodology (every entry is customizable).
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={exportToExcel}
              className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5"
            >
              <Download className="w-4 h-4 text-emerald-400" />
              <span>Export Day Book (Excel)</span>
            </button>

            {isAdmin && (
              <button
                type="button"
                onClick={() => { setEditingVoucher(null); setIsVoucherModalOpen(true) }}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md shadow-blue-600/30 flex items-center gap-1.5 transition-all"
              >
                <PlusCircle className="w-4 h-4" />
                <span>+ New Voucher</span>
              </button>
            )}
          </div>
        </div>

        {/* Filter Toolbar */}
        <div className="bg-slate-800/90 p-4 rounded-2xl border border-slate-700/80 shadow-md space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search voucher, party, UID, narration..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs font-medium text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Voucher Type Filter */}
            <div>
              <select
                value={voucherTypeFilter}
                onChange={(e) => setVoucherTypeFilter(e.target.value)}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs font-semibold text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Voucher Types (F8, F9, F6, F5, F4, F7)</option>
                <option value="sales">Sales (F8)</option>
                <option value="purchase">Purchase (F9)</option>
                <option value="receipt">Receipt (F6)</option>
                <option value="payment">Payment (F5)</option>
                <option value="contra">Contra (F4)</option>
                <option value="journal">Journal (F7)</option>
              </select>
            </div>

            {/* Date Range Presets */}
            <div>
              <select
                value={dateRange}
                onChange={(e) => setDateRange(e.target.value)}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs font-semibold text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Dates</option>
                <option value="today">Today</option>
                <option value="yesterday">Yesterday</option>
                <option value="month">This Month</option>
                <option value="custom">Custom Date Range</option>
              </select>
            </div>

            {/* Summary Pill */}
            <div className="bg-slate-900 px-3.5 py-1.5 rounded-xl border border-slate-700 flex items-center justify-between text-xs font-bold">
              <span className="text-slate-400">Total Filtered:</span>
              <span className="text-white">₹{totalAmount.toLocaleString()}</span>
            </div>
          </div>

          {/* Custom Date Pickers */}
          {dateRange === 'custom' && (
            <div className="flex items-center gap-3 pt-2 border-t border-slate-700/60 text-xs">
              <span className="text-slate-400 font-semibold">From:</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-white"
              />
              <span className="text-slate-400 font-semibold">To:</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-white"
              />
            </div>
          )}
        </div>

        {/* Day Book Table */}
        <div className="bg-slate-800/90 rounded-2xl border border-slate-700/80 shadow-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-900/80 text-slate-400 font-bold uppercase text-[10px] border-b border-slate-700">
                <tr>
                  <th className="py-3 px-3">Date</th>
                  <th className="py-3 px-3">Vch No.</th>
                  <th className="py-3 px-3">Type</th>
                  <th className="py-3 px-3">Particulars / Party Name</th>
                  <th className="py-3 px-3">Customer UID</th>
                  <th className="py-3 px-3">Items / Narration</th>
                  <th className="py-3 px-3 text-right">Debit / Credit (₹)</th>
                  <th className="py-3 px-3 text-right">Closing Due (₹)</th>
                  <th className="py-3 px-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/60 font-medium">
                {filteredVouchers.length > 0 ? (
                  filteredVouchers.map((v) => {
                    const isSales = v.voucher_type === 'sales'
                    return (
                      <tr key={v.id} className="hover:bg-slate-700/40 transition-colors">
                        <td className="py-3 px-3 text-slate-300 font-mono whitespace-nowrap">{v.date}</td>
                        <td className="py-3 px-3 font-mono font-bold text-white whitespace-nowrap">{v.voucher_no}</td>
                        <td className="py-3 px-3 whitespace-nowrap">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            v.voucher_type === 'sales' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                            v.voucher_type === 'purchase' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' :
                            v.voucher_type === 'receipt' ? 'bg-teal-500/20 text-teal-400 border border-teal-500/30' :
                            v.voucher_type === 'contra' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' :
                            v.voucher_type === 'payment' ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' :
                            'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30'
                          }`}>
                            {(v.voucher_type || '').toUpperCase()}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-white font-semibold">
                          <div>{v.party_name || 'Cash'}</div>
                          {v.payment_mode && (
                            <span className="text-[10px] text-slate-400 font-normal">via {v.payment_mode}</span>
                          )}
                        </td>
                        <td className="py-3 px-3">
                          {v.party_uid ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-blue-500/20 text-blue-300 text-[10px] font-mono font-bold border border-blue-500/40">
                              <ShieldCheck className="w-3 h-3 text-blue-400" />
                              <span>{v.party_uid}</span>
                            </span>
                          ) : (
                            <span className="text-slate-500 text-[11px]">-</span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-slate-400 max-w-xs truncate">
                          {Array.isArray(v.items) && v.items.length > 0 ? (
                            <span>{v.items.map((i) => `${i.name} (${i.qty})`).join(', ')}</span>
                          ) : (
                            <span>{v.narration || '-'}</span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-right font-black text-white whitespace-nowrap">
                          ₹{Number(v.amount || 0).toLocaleString()}
                        </td>
                        <td className="py-3 px-3 text-right font-bold whitespace-nowrap">
                          {Number(v.due_amount || 0) > 0 ? (
                            <span className="text-rose-400">₹{Number(v.due_amount).toLocaleString()}</span>
                          ) : (
                            <span className="text-slate-500 font-normal">₹0</span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-center whitespace-nowrap">
                          <div className="flex items-center justify-center gap-1.5">
                            {isSales && (
                              <button
                                type="button"
                                onClick={() => { setSelectedInvoice(v); setIsInvoiceModalOpen(true) }}
                                className="p-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 transition-colors"
                                title="View & Print Tax Invoice"
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {isAdmin ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => { setEditingVoucher(v); setIsVoucherModalOpen(true) }}
                                  className="p-1.5 rounded-lg bg-blue-600/30 hover:bg-blue-600 text-blue-300 hover:text-white transition-colors"
                                  title="Modify Voucher (Tally edit)"
                                >
                                  <Edit3 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDelete(v.id)}
                                  className="p-1.5 rounded-lg bg-rose-600/20 hover:bg-rose-600 text-rose-400 hover:text-white transition-colors"
                                  title="Cancel / Delete Voucher"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </>
                            ) : (
                              <span className="text-[10px] text-slate-500 italic">Read-only</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })
                ) : (
                  <tr>
                    <td colSpan={9} className="py-8 text-center text-slate-500">
                      No vouchers match your current filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* Modals */}
      <VoucherModal
        isOpen={isVoucherModalOpen}
        onClose={() => setIsVoucherModalOpen(false)}
        editingVoucher={editingVoucher}
        onSuccess={load}
      />

      <InvoicePrintModal
        isOpen={isInvoiceModalOpen}
        onClose={() => setIsInvoiceModalOpen(false)}
        invoice={selectedInvoice}
      />
    </div>
  )
}
