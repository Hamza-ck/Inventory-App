import { useState, useMemo } from 'react'
import { 
  Receipt, 
  Search, 
  PlusCircle, 
  Printer, 
  ShieldCheck, 
  Edit3 } from 'lucide-react'
import { useTable } from '../lib/useTable'
import { useVoucherEditor } from '../context/VoucherEditorContext'
import { todayISO } from '../lib/format'
import { jsQuery } from '../lib/jsQuery'
import { useAuth } from '../context/AuthContext'

const byDateDesc = (a, b) => (b.date || '').localeCompare(a.date || '') || (b.id || 0) - (a.id || 0)

export default function SalesPage() {
  const { isAdmin } = useAuth()
  const { openVoucher, viewInvoice } = useVoucherEditor()
  const allVouchers = useTable('vouchers')
  const salesVouchers = useMemo(
    () => (allVouchers ?? []).filter((v) => v.voucher_type === 'sales').sort(byDateDesc),
    [allVouchers]
  )

  // Filters
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('all') // 'all', 'paid', 'due'
  const [dateFilter, setDateFilter] = useState('all') // 'today', 'month', 'all'

  // Filtered sales
  const filteredSales = useMemo(() => {
    let q = jsQuery(salesVouchers)

    if (statusFilter === 'paid') {
      q = q.where((v) => Number(v.due_amount || 0) === 0)
    } else if (statusFilter === 'due') {
      q = q.where((v) => Number(v.due_amount || 0) > 0)
    }

    const todayStr = todayISO()
    if (dateFilter === 'today') {
      q = q.where((v) => (v.date || '').slice(0, 10) === todayStr)
    } else if (dateFilter === 'month') {
      const curMonth = todayStr.slice(0, 7)
      q = q.where((v) => (v.date || '').slice(0, 7) === curMonth)
    }

    if (searchTerm.trim()) {
      q = q.search(searchTerm, ['voucher_no', 'party_name', 'party_uid', 'narration'])
    }

    return q.execute()
  }, [salesVouchers, statusFilter, dateFilter, searchTerm])

  // Aggregations
  const totalSalesAmount = filteredSales.reduce((acc, v) => acc + (Number(v.amount) || 0), 0)
  const totalPaidAmount = filteredSales.reduce((acc, v) => acc + (Number(v.paid_amount) || 0), 0)
  const totalDueAmount = filteredSales.reduce((acc, v) => acc + (Number(v.due_amount) || 0), 0)
  const totalUidAccounts = filteredSales.filter((v) => Boolean(v.party_uid)).length

  if (!allVouchers) {
    return <div className="min-h-[60vh] bg-slate-50 flex items-center justify-center"><div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" /></div>
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans pb-16">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 pt-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-2">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight flex items-center gap-2.5">
                <Receipt className="w-7 h-7 text-emerald-600" />
                <span>Daily Sales & Invoicing</span>
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                F8 Sales
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-600 mt-1">
              Invoices with closing due balance automatically receive permanent Customer UIDs.
            </p>
          </div>

          {isAdmin && (
            <button
              type="button"
              onClick={() => openVoucher()}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs flex items-center gap-2 transition-all active:scale-95"
            >
              <PlusCircle className="w-4 h-4" />
              <span>+ New Sales Invoice</span>
            </button>
          )}
        </div>

        {/* UID Logic Informational Banner */}
        <div className="p-4 rounded-xl bg-blue-50 border border-blue-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center shrink-0 border border-blue-200">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <span className="font-bold text-blue-950 block">TallyFlow Permanent Customer UID Engine</span>
              <span className="text-blue-900/80 font-medium">
                Invoices with closing due balance get permanent UID (e.g. <code>UID-CUST-1001</code>). If paid upfront, settled directly into sales.
              </span>
            </div>
          </div>
          <div className="shrink-0 bg-white px-3 py-1.5 rounded-lg border border-blue-200 font-mono text-blue-700 font-bold shadow-xs">
            {totalUidAccounts} Invoices Linked via UID
          </div>
        </div>

        {/* Summary Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
            <span className="text-xs font-bold text-slate-600 uppercase tracking-wider block mb-1">Total Sales Revenue</span>
            <div className="text-2xl font-black text-slate-900">₹{totalSalesAmount.toLocaleString()}</div>
            <div className="text-[11px] text-slate-500 mt-1 font-medium">From {filteredSales.length} invoices</div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
            <span className="text-xs font-bold text-emerald-700 uppercase tracking-wider block mb-1">Settled / Paid Amount</span>
            <div className="text-2xl font-black text-emerald-700">₹{totalPaidAmount.toLocaleString()}</div>
            <div className="text-[11px] text-slate-500 mt-1 font-medium">Cash & Bank Collections</div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
            <span className="text-xs font-bold text-rose-700 uppercase tracking-wider block mb-1">Closing Due (Credit Debtors)</span>
            <div className="text-2xl font-black text-rose-700">₹{totalDueAmount.toLocaleString()}</div>
            <div className="text-[11px] text-slate-500 mt-1 font-medium">Circulating through Customer UIDs</div>
          </div>
        </div>

        {/* Filter Toolbar */}
        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5 flex-1 max-w-xl">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search invoice #, customer name, permanent UID..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-1.5 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
            >
              <option value="all">All Settlements</option>
              <option value="paid">Fully Settled (Cash)</option>
              <option value="due">Has Closing Due (Debtor UID)</option>
            </select>

            <select
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="px-3 py-1.5 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
            >
              <option value="all">All Dates</option>
              <option value="today">Today</option>
              <option value="month">This Month</option>
            </select>
          </div>

          <div className="text-xs text-slate-600 font-bold">
            Showing {filteredSales.length} Invoices
          </div>
        </div>

        {/* Sales Table */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100 text-slate-700 font-bold uppercase text-[10px] border-b border-slate-200">
                <tr>
                  <th className="py-3 px-3">Date</th>
                  <th className="py-3 px-3">Invoice No.</th>
                  <th className="py-3 px-3">Customer Party</th>
                  <th className="py-3 px-3">Permanent UID</th>
                  <th className="py-3 px-3">Materials / Items</th>
                  <th className="py-3 px-3 text-right">Invoice Total (₹)</th>
                  <th className="py-3 px-3 text-right">Paid (₹)</th>
                  <th className="py-3 px-3 text-right">Closing Due (₹)</th>
                  <th className="py-3 px-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {filteredSales.length > 0 ? (
                  filteredSales.map((v) => {
                    const hasDue = Number(v.due_amount || 0) > 0
                    return (
                      <tr key={v.id} className="hover:bg-slate-50 transition-colors">
                        <td className="py-3 px-3 text-slate-600 font-mono whitespace-nowrap">{v.date}</td>
                        <td className="py-3 px-3 font-mono font-black text-slate-900 whitespace-nowrap">{v.voucher_no}</td>
                        <td className="py-3 px-3 font-bold text-slate-900">
                          <div>{v.party_name || 'Cash Customer'}</div>
                          {v.payment_mode && (
                            <span className="text-[10px] text-slate-500 font-medium">via {v.payment_mode}</span>
                          )}
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap">
                          {v.party_uid ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 text-[10px] font-mono font-bold border border-blue-200">
                              <ShieldCheck className="w-3 h-3 text-blue-600" />
                              <span>{v.party_uid}</span>
                            </span>
                          ) : (
                            <span className="text-slate-400 text-[10px] italic">Walk-in Direct</span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-slate-600 max-w-xs truncate font-medium">
                          {Array.isArray(v.items) && v.items.length > 0 ? (
                            <span>{v.items.map((i) => `${i.name} (${i.qty})`).join(', ')}</span>
                          ) : (
                            <span>Direct Sales</span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-right font-black text-slate-900 whitespace-nowrap">
                          ₹{Number(v.amount || 0).toLocaleString()}
                        </td>
                        <td className="py-3 px-3 text-right text-emerald-700 font-black whitespace-nowrap">
                          ₹{Number(v.paid_amount || 0).toLocaleString()}
                        </td>
                        <td className="py-3 px-3 text-right font-bold whitespace-nowrap">
                          {hasDue ? (
                            <span className="text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200 font-bold">
                              ₹{Number(v.due_amount).toLocaleString()}
                            </span>
                          ) : (
                            <span className="text-emerald-700 font-bold text-[11px]">Fully Paid</span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-center whitespace-nowrap">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => viewInvoice(v)}
                              className="p-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 transition-colors"
                              title="Print / View Tax Invoice"
                            >
                              <Printer className="w-3.5 h-3.5" />
                            </button>
                            {isAdmin && (
                              <button
                                type="button"
                                onClick={() => openVoucher(v)}
                                className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
                                title="Modify Invoice (Tally edit)"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })
                ) : (
                  <tr>
                    <td colSpan={9} className="py-8 text-center text-slate-500 font-medium">
                      No sales invoices found matching your filter criteria.
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
