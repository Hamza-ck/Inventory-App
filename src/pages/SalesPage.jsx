import { useEffect, useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import { 
  Receipt, 
  Search, 
  PlusCircle, 
  Printer, 
  ShieldCheck, 
  CheckCircle2, 
  AlertCircle, 
  Calendar, 
  Eye, 
  Edit3, 
  TrendingUp, 
  DollarSign, 
  User, 
  FileText 
} from 'lucide-react'
import { accDb } from '../lib/accountingDb'
import { jsQuery } from '../lib/jsQuery'
import { useAuth } from '../context/AuthContext'
import Nav from '../components/Nav'
import VoucherModal from '../components/VoucherModal'
import InvoicePrintModal from '../components/InvoicePrintModal'

export default function SalesPage() {
  const { isAdmin, isOwner } = useAuth()
  const [salesVouchers, setSalesVouchers] = useState([])
  const [loading, setLoading] = useState(true)

  // Filters
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('all') // 'all', 'paid', 'due'
  const [dateFilter, setDateFilter] = useState('all') // 'today', 'month', 'all'

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
    const list = await accDb.vouchers.where('voucher_type').equals('sales').toArray()
    list.sort((a, b) => new Date(b.date || b.createdAt) - new Date(a.date || a.createdAt))
    setSalesVouchers(list)
    setLoading(false)
  }

  // Filtered sales
  const filteredSales = useMemo(() => {
    let q = jsQuery(salesVouchers)

    if (statusFilter === 'paid') {
      q = q.where((v) => Number(v.due_amount || 0) === 0)
    } else if (statusFilter === 'due') {
      q = q.where((v) => Number(v.due_amount || 0) > 0)
    }

    const todayStr = new Date().toISOString().slice(0, 10)
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

  return (
    <div className="min-h-screen bg-[#f4f7f4] text-[#172f2c] font-sans pb-28 lg:pb-0">
      <Nav />

      <main className="min-h-screen bg-[#f4f7f4] px-4 pb-28 pt-5 text-[#172f2c] sm:px-6 lg:ml-64 lg:w-[calc(100%-16rem)] lg:px-9 lg:pb-8 lg:pt-8 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-2">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl sm:text-3xl font-black text-[#172f2c] tracking-tight flex items-center gap-2.5">
                <Receipt className="w-7 h-7 text-[#0e7a70]" />
                <span>Daily Sales & Invoicing</span>
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-[#e6f4ee] text-[#0e7a70] border border-[#c6e5d9]">
                F8 Sales
              </span>
            </div>
            <p className="text-xs sm:text-sm text-[#71827a] mt-1">
              Invoices with closing due balance automatically receive permanent Customer UIDs.
            </p>
          </div>

          {isAdmin && (
            <button
              type="button"
              onClick={() => { setEditingVoucher(null); setIsVoucherModalOpen(true) }}
              className="px-4 py-2 bg-gradient-to-r from-[#0e7a70] to-[#07675e] hover:from-emerald-700 hover:to-teal-700 text-white rounded-xl text-xs font-bold shadow-lg shadow-[#0e7a70]/15 flex items-center gap-2 transition-all active:scale-95"
            >
              <PlusCircle className="w-4 h-4" />
              <span>+ New Sales Invoice</span>
            </button>
          )}
        </div>

        {/* UID Logic Informational Banner */}
        <div className="p-4 rounded-2xl bg-gradient-to-r from-[#e7f5ef] to-[#f4faf6] border border-[#c6e5d9] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#0e7a70]/30 text-[#0e7a70] flex items-center justify-center shrink-0 border border-[#c6e5d9]">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <span className="font-bold text-[#172f2c] block">TallyFlow Permanent Customer UID Engine</span>
              <span className="text-[#52685e]">
                Invoices with closing due balance get permanent UID (e.g. <code>UID-CUST-1001</code>). If paid upfront, settled directly into sales.
              </span>
            </div>
          </div>
          <div className="shrink-0 bg-blue-900/60 px-3 py-1.5 rounded-lg border border-[#b8ddd0] font-mono text-[#0e7669] font-bold">
            {totalUidAccounts} Invoices Linked via UID
          </div>
        </div>

        {/* Summary Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white p-4 rounded-2xl border border-[#e1e8e3] shadow-md">
            <span className="text-xs font-bold text-[#71827a] uppercase tracking-wider block mb-1">Total Sales Revenue</span>
            <div className="text-2xl font-black text-[#172f2c]">₹{totalSalesAmount.toLocaleString()}</div>
            <div className="text-[11px] text-[#71827a] mt-1">From {filteredSales.length} invoices</div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-[#e1e8e3] shadow-md">
            <span className="text-xs font-bold text-[#0e7a70] uppercase tracking-wider block mb-1">Settled / Paid Amount</span>
            <div className="text-2xl font-black text-[#0e7a70]">₹{totalPaidAmount.toLocaleString()}</div>
            <div className="text-[11px] text-[#71827a] mt-1">Cash & Bank Collections</div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-[#e1e8e3] shadow-md">
            <span className="text-xs font-bold text-[#ad5545] uppercase tracking-wider block mb-1">Closing Due (Credit Debtors)</span>
            <div className="text-2xl font-black text-[#ad5545]">₹{totalDueAmount.toLocaleString()}</div>
            <div className="text-[11px] text-[#71827a] mt-1">Circulating through Customer UIDs</div>
          </div>
        </div>

        {/* Filter Toolbar */}
        <div className="bg-white p-3.5 rounded-2xl border border-[#e1e8e3] flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5 flex-1 max-w-xl">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#71827a]" />
              <input
                type="text"
                placeholder="Search invoice #, customer name, permanent UID..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 bg-[#f4f7f4] border border-[#e1e8e3] rounded-xl text-xs font-medium text-[#172f2c] placeholder:text-[#8a9991] focus:outline-none focus:ring-2 focus:ring-[#0e7a70]"
              />
            </div>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-1.5 bg-[#f4f7f4] border border-[#e1e8e3] rounded-xl text-xs font-semibold text-[#172f2c] focus:outline-none focus:ring-2 focus:ring-[#0e7a70]"
            >
              <option value="all">All Settlements</option>
              <option value="paid">Fully Settled (Cash)</option>
              <option value="due">Has Closing Due (Debtor UID)</option>
            </select>

            <select
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="px-3 py-1.5 bg-[#f4f7f4] border border-[#e1e8e3] rounded-xl text-xs font-semibold text-[#172f2c] focus:outline-none focus:ring-2 focus:ring-[#0e7a70]"
            >
              <option value="all">All Dates</option>
              <option value="today">Today</option>
              <option value="month">This Month</option>
            </select>
          </div>

          <div className="text-xs text-[#71827a] font-semibold">
            Showing {filteredSales.length} Invoices
          </div>
        </div>

        {/* Sales Table */}
        <section className="grid gap-3 lg:hidden" aria-label="Recent invoices">
          {loading ? <div className="rounded-2xl border border-[#e1e8e3] bg-white p-6 text-center text-xs text-[#71827a]">Loading invoices…</div> : filteredSales.length ? filteredSales.map((v) => (
            <article key={v.id} className="rounded-2xl border border-[#e1e8e3] bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-[10px] font-semibold text-[#82908a]">{v.date || 'Date not recorded'}</p><h2 className="mt-1 truncate text-sm font-extrabold text-[#203a31]">{v.voucher_no || 'Sales invoice'}</h2><p className="mt-1 truncate text-xs text-[#61756d]">{v.party_name || 'Walk-in customer'}</p></div><strong className="whitespace-nowrap text-sm font-extrabold text-[#203a31]">₹{Number(v.amount || 0).toLocaleString('en-IN')}</strong></div>
              <div className="mt-3 flex items-center justify-between border-t border-[#edf1ed] pt-3"><div className="text-[10px] text-[#82908a]">Due <strong className="ml-1 text-[#a9563b]">₹{Number(v.due_amount || 0).toLocaleString('en-IN')}</strong></div><span className={'rounded-md px-2 py-1 text-[9px] font-extrabold ' + (Number(v.due_amount) > 0 ? 'bg-[#fff2df] text-[#a65d0d]' : 'bg-[#e5f7ee] text-[#0d7864]')}>{Number(v.due_amount) > 0 ? 'Due' : 'Paid'}</span></div>
              <div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => { setSelectedInvoice(v); setIsInvoiceModalOpen(true) }} className="flex-1 rounded-lg border border-[#dce6df] bg-[#f8fbf9] px-3 py-2 text-xs font-bold text-[#36564b]">View invoice</button>{isAdmin && <button type="button" onClick={() => { setEditingVoucher(v); setIsVoucherModalOpen(true) }} className="flex-1 rounded-lg bg-[#0d7c71] px-3 py-2 text-xs font-bold text-white">Edit</button>}</div>
            </article>
          )) : <div className="rounded-2xl border border-[#e1e8e3] bg-white p-7 text-center text-xs text-[#82908a]">No invoices match these filters.</div>}
        </section>
        <div className="hidden lg:block bg-white rounded-2xl border border-[#e1e8e3] shadow-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#f8fbf9] text-[#71827a] font-bold uppercase text-[10px] border-b border-[#e1e8e3]">
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
              <tbody className="divide-y divide-[#e8eee9] font-medium">
                {filteredSales.length > 0 ? (
                  filteredSales.map((v) => {
                    const hasDue = Number(v.due_amount || 0) > 0
                    return (
                      <tr key={v.id} className="hover:bg-[#f3f8f5] transition-colors">
                        <td className="py-3 px-3 text-[#52685e] font-mono whitespace-nowrap">{v.date}</td>
                        <td className="py-3 px-3 font-mono font-bold text-[#172f2c] whitespace-nowrap">{v.voucher_no}</td>
                        <td className="py-3 px-3 font-semibold text-[#172f2c]">
                          <div>{v.party_name || 'Cash Customer'}</div>
                          {v.payment_mode && (
                            <span className="text-[10px] text-[#71827a] font-normal">via {v.payment_mode}</span>
                          )}
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap">
                          {v.party_uid ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#e6f4ee] text-[#0e7669] text-[10px] font-mono font-bold border border-[#b8ddd0]">
                              <ShieldCheck className="w-3 h-3 text-[#0e7a70]" />
                              <span>{v.party_uid}</span>
                            </span>
                          ) : (
                            <span className="text-[#8a9991] text-[10px] italic">Walk-in Direct</span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-[#71827a] max-w-xs truncate">
                          {Array.isArray(v.items) && v.items.length > 0 ? (
                            <span>{v.items.map((i) => `${i.name} (${i.qty})`).join(', ')}</span>
                          ) : (
                            <span>Direct Sales</span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-right font-black text-[#172f2c] whitespace-nowrap">
                          ₹{Number(v.amount || 0).toLocaleString()}
                        </td>
                        <td className="py-3 px-3 text-right text-[#0e7a70] font-bold whitespace-nowrap">
                          ₹{Number(v.paid_amount || 0).toLocaleString()}
                        </td>
                        <td className="py-3 px-3 text-right font-bold whitespace-nowrap">
                          {hasDue ? (
                            <span className="text-[#ad5545] bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20">
                              ₹{Number(v.due_amount).toLocaleString()}
                            </span>
                          ) : (
                            <span className="text-[#0e7a70] font-normal text-[11px]">Fully Paid</span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-center whitespace-nowrap">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => { setSelectedInvoice(v); setIsInvoiceModalOpen(true) }}
                              className="p-1.5 rounded-lg bg-[#0e7a70]/20 hover:bg-[#0e7a70] text-[#0e7669] hover:text-white transition-colors"
                              title="Print / View Tax Invoice"
                            >
                              <Printer className="w-3.5 h-3.5" />
                            </button>
                            {isAdmin && (
                              <button
                                type="button"
                                onClick={() => { setEditingVoucher(v); setIsVoucherModalOpen(true) }}
                                className="p-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-[#52685e] hover:text-[#172f2c] transition-colors"
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
                    <td colSpan={9} className="py-8 text-center text-[#8a9991]">
                      No sales invoices found matching your filter criteria.
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
