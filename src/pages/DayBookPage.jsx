import { useState, useMemo } from 'react'
import * as XLSX from 'xlsx'
import { 
  BookOpen, 
  Search, 
  PlusCircle, 
  Edit3, 
  Trash2, 
  Eye, 
  Download, 
  ShieldCheck } from 'lucide-react'
import { deleteVoucher } from '../lib/accountingDb'
import { useTable } from '../lib/useTable'
import { useUI } from '../context/UIContext'
import { useVoucherEditor } from '../context/VoucherEditorContext'
import { todayISO, daysAgoISO } from '../lib/format'
import { jsQuery } from '../lib/jsQuery'
import { useAuth } from '../context/AuthContext'

const byDateDesc = (a, b) => (b.date || '').localeCompare(a.date || '') || (b.id || 0) - (a.id || 0)

export default function DayBookPage() {
  const { isAdmin } = useAuth()
  const ui = useUI()
  const { openVoucher, viewInvoice } = useVoucherEditor()
  const allVouchers = useTable('vouchers')
  const vouchers = useMemo(() => [...(allVouchers ?? [])].sort(byDateDesc), [allVouchers])

  // Filters
  const [searchTerm, setSearchTerm] = useState('')
  const [voucherTypeFilter, setVoucherTypeFilter] = useState('all')
  const [dateRange, setDateRange] = useState('all') // 'today', 'yesterday', 'month', 'all', 'custom'
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  // Filtered list using JSquery
  const filteredVouchers = useMemo(() => {
    let q = jsQuery(vouchers)

    if (voucherTypeFilter !== 'all') {
      q = q.where({ voucher_type: voucherTypeFilter })
    }

    if (searchTerm.trim()) {
      q = q.search(searchTerm, ['voucher_no', 'party_name', 'party_uid', 'narration', 'payment_mode'])
    }

    const todayStr = todayISO()
    if (dateRange === 'today') {
      q = q.where((v) => (v.date || '').slice(0, 10) === todayStr)
    } else if (dateRange === 'yesterday') {
      const y = daysAgoISO(1)
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

  async function handleDelete(id) {
    if (!isAdmin) return
    const ok = await ui.confirm('Delete this voucher? Stock, party balances and cash/bank are reversed automatically.', {
      confirmLabel: 'Delete',
      danger: true })
    if (!ok) return
    try {
      await deleteVoucher(id)
      ui.toast('Voucher deleted')
    } catch (err) {
      ui.toast(err.message || 'Could not delete voucher', 'error')
    }
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
      Narration: v.narration || '' }))

    const ws = XLSX.utils.json_to_sheet(exportRows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Tally_DayBook')
    XLSX.writeFile(wb, `Tally_DayBook_${todayISO()}.xlsx`)
  }

  if (!allVouchers) {
    return <div className="min-h-[60vh] bg-slate-50 flex items-center justify-center"><div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" /></div>
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans pb-16">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 pt-6 space-y-5">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-2">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight flex items-center gap-2.5">
                <BookOpen className="w-7 h-7 text-blue-600" />
                <span>Tally Day Book</span>
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-slate-100 text-blue-700 border border-slate-200">
                {filteredVouchers.length} Vouchers
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-600 mt-1">
              Chronological financial register developed with Tally methodology (every entry is customizable).
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={exportToExcel}
              className="px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 shadow-xs"
            >
              <Download className="w-4 h-4 text-emerald-600" />
              <span>Export Day Book (Excel)</span>
            </button>

            {isAdmin && (
              <button
                type="button"
                onClick={() => openVoucher()}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-xs flex items-center gap-1.5 transition-all"
              >
                <PlusCircle className="w-4 h-4" />
                <span>+ New Voucher</span>
              </button>
            )}
          </div>
        </div>

        {/* Filter Toolbar */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search voucher, party, UID, narration..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            {/* Voucher Type Filter */}
            <div>
              <select
                value={voucherTypeFilter}
                onChange={(e) => setVoucherTypeFilter(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
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
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                <option value="all">All Dates</option>
                <option value="today">Today</option>
                <option value="yesterday">Yesterday</option>
                <option value="month">This Month</option>
                <option value="custom">Custom Date Range</option>
              </select>
            </div>

            {/* Summary Pill */}
            <div className="bg-slate-50 px-3.5 py-1.5 rounded-xl border border-slate-200 flex items-center justify-between text-xs font-bold">
              <span className="text-slate-600">Total Filtered:</span>
              <span className="text-slate-900 font-black">₹{totalAmount.toLocaleString()}</span>
            </div>
          </div>

          {/* Custom Date Pickers */}
          {dateRange === 'custom' && (
            <div className="flex items-center gap-3 pt-2 border-t border-slate-200 text-xs">
              <span className="text-slate-600 font-bold">From:</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-slate-900 font-semibold"
              />
              <span className="text-slate-600 font-bold">To:</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-slate-900 font-semibold"
              />
            </div>
          )}
        </div>

        {/* Day Book Table */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100 text-slate-700 font-bold uppercase text-[10px] border-b border-slate-200">
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
              <tbody className="divide-y divide-slate-100 font-medium">
                {filteredVouchers.length > 0 ? (
                  filteredVouchers.map((v) => {
                    const isSales = v.voucher_type === 'sales'
                    return (
                      <tr key={v.id} className="hover:bg-slate-50 transition-colors">
                        <td className="py-3 px-3 text-slate-600 font-mono whitespace-nowrap">{v.date}</td>
                        <td className="py-3 px-3 font-mono font-black text-slate-900 whitespace-nowrap">{v.voucher_no}</td>
                        <td className="py-3 px-3 whitespace-nowrap">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            v.voucher_type === 'sales' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                            v.voucher_type === 'purchase' ? 'bg-blue-50 text-blue-700 border border-blue-200' :
                            v.voucher_type === 'receipt' ? 'bg-teal-50 text-teal-700 border border-teal-200' :
                            v.voucher_type === 'contra' ? 'bg-amber-50 text-amber-800 border border-amber-200' :
                            v.voucher_type === 'payment' ? 'bg-rose-50 text-rose-700 border border-rose-200' :
                            'bg-indigo-50 text-indigo-700 border border-indigo-200'
                          }`}>
                            {(v.voucher_type || '').toUpperCase()}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-slate-900 font-bold">
                          <div>{v.party_name || 'Cash'}</div>
                          {v.payment_mode && (
                            <span className="text-[10px] text-slate-500 font-medium">via {v.payment_mode}</span>
                          )}
                        </td>
                        <td className="py-3 px-3">
                          {v.party_uid ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 text-[10px] font-mono font-bold border border-blue-200">
                              <ShieldCheck className="w-3 h-3 text-blue-600" />
                              <span>{v.party_uid}</span>
                            </span>
                          ) : (
                            <span className="text-slate-400 text-[11px]">-</span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-slate-600 max-w-xs truncate font-medium">
                          {Array.isArray(v.items) && v.items.length > 0 ? (
                            <span>{v.items.map((i) => `${i.name} (${i.qty})`).join(', ')}</span>
                          ) : (
                            <span>{v.narration || '-'}</span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-right font-black text-slate-900 whitespace-nowrap">
                          ₹{Number(v.amount || 0).toLocaleString()}
                        </td>
                        <td className="py-3 px-3 text-right font-bold whitespace-nowrap">
                          {Number(v.due_amount || 0) > 0 ? (
                            <span className="text-rose-600 font-black">₹{Number(v.due_amount).toLocaleString()}</span>
                          ) : (
                            <span className="text-slate-400 font-medium">₹0</span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-center whitespace-nowrap">
                          <div className="flex items-center justify-center gap-1.5">
                            {isSales && (
                              <button
                                type="button"
                                onClick={() => viewInvoice(v)}
                                className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
                                title="View & Print Tax Invoice"
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {isAdmin ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => openVoucher(v)}
                                  className="p-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 transition-colors"
                                  title="Modify Voucher (Tally edit)"
                                >
                                  <Edit3 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDelete(v.id)}
                                  className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 transition-colors"
                                  title="Cancel / Delete Voucher"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </>
                            ) : (
                              <span className="text-[10px] text-slate-400 italic">Read-only</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })
                ) : (
                  <tr>
                    <td colSpan={9} className="py-8 text-center text-slate-500 font-medium">
                      No vouchers match your current filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  )
}
