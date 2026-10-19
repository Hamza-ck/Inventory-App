import { useCallback, useEffect, useMemo, useState } from 'react'
import { CalendarDays, Download, ReceiptText, TrendingDown, WalletCards } from 'lucide-react'
import Nav from '../components/Nav'
import VoucherModal from '../components/VoucherModal'
import { accDb } from '../lib/accountingDb'
import { useAuth } from '../context/AuthContext'

const money = (value) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(value) || 0)

function expenseCategory(voucher) {
  const raw = voucher.expense_category || voucher.debit_ledger_name || voucher.ledger_name || voucher.narration || ''
  const text = String(raw).toLowerCase()
  if (text.includes('rent')) return 'Rent'
  if (text.includes('salary') || text.includes('payroll') || text.includes('wage')) return 'Salaries'
  if (text.includes('electric')) return 'Electricity'
  if (text.includes('transport') || text.includes('delivery') || text.includes('courier')) return 'Transport'
  if (text.includes('internet') || text.includes('mobile') || text.includes('phone')) return 'Communication'
  if (text.includes('repair') || text.includes('maintenance')) return 'Repairs & maintenance'
  return voucher.expense_category || voucher.debit_ledger_name || 'Other payments'
}

function isExpense(voucher) {
  if (voucher.voucher_type !== 'payment') return false
  const descriptor = [voucher.expense_category, voucher.debit_ledger_name, voucher.ledger_name, voucher.narration].filter(Boolean).join(' ').toLowerCase()
  return Boolean(voucher.expense_category) || /expense|rent|salary|payroll|wage|electric|transport|delivery|courier|internet|mobile|phone|repair|maintenance|utility|office|stationery|advertis|marketing|travel/i.test(descriptor)
}

function exportExpenses(rows) {
  const csvRows = [['Date', 'Voucher', 'Category', 'Paid to', 'Amount', 'Payment mode', 'Narration'],
    ...rows.map((v) => [v.date || '', v.voucher_no || '', expenseCategory(v), v.party_name || '', Number(v.amount) || 0, v.payment_mode || '', v.narration || ''])]
  const csv = csvRows.map((row) => row.map((value) => '"' + String(value ?? '').replaceAll('"', '""') + '"').join(',')).join('\r\n')
  const link = document.createElement('a')
  link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
  link.download = 'expenses-' + new Date().toISOString().slice(0, 10) + '.csv'
  link.click()
  URL.revokeObjectURL(link.href)
}

export default function ExpensesPage() {
  const { isAdmin } = useAuth()
  const [vouchers, setVouchers] = useState([])
  const [period, setPeriod] = useState('month')
  const [search, setSearch] = useState('')
  const [showVoucher, setShowVoucher] = useState(false)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const all = await accDb.vouchers.toArray()
    setVouchers(all.filter(isExpense).sort((a, b) => new Date(b.date || b.created_at || 0) - new Date(a.date || a.created_at || 0)))
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
    window.addEventListener('accounting-data-updated', load)
    return () => window.removeEventListener('accounting-data-updated', load)
  }, [load])

  const filtered = useMemo(() => {
    const now = new Date()
    const start = new Date(now.getFullYear(), now.getMonth(), 1)
    if (period === 'last') start.setMonth(start.getMonth() - 1)
    return vouchers.filter((v) => {
      const date = new Date(v.date || v.created_at || 0)
      const periodMatch = period === 'all' || (period === 'last'
        ? date >= start && date < new Date(now.getFullYear(), now.getMonth(), 1)
        : date >= start && date <= now)
      const q = search.trim().toLowerCase()
      const matches = !q || [v.voucher_no, v.party_name, v.narration, expenseCategory(v)].some((value) => String(value || '').toLowerCase().includes(q))
      return periodMatch && matches
    })
  }, [vouchers, period, search])

  const total = filtered.reduce((sum, v) => sum + (Number(v.amount) || 0), 0)
  const groups = useMemo(() => {
    const map = new Map()
    filtered.forEach((v) => {
      const key = expenseCategory(v)
      map.set(key, (map.get(key) || 0) + (Number(v.amount) || 0))
    })
    return [...map.entries()].sort((a, b) => b[1] - a[1])
  }, [filtered])
  const categoryColors = ['bg-[#0e7a70]', 'bg-[#d98d3d]', 'bg-[#719a83]', 'bg-[#8a9ea8]', 'bg-[#9b88ba]']
  const maxCategory = Math.max(1, ...groups.map((entry) => entry[1]))

  return <>
    <Nav />
    <main className="min-h-screen bg-[#f4f7f4] px-4 pb-28 pt-5 text-[#172f2c] sm:px-6 lg:ml-64 lg:w-[calc(100%-16rem)] lg:px-9 lg:pb-8 lg:pt-8">
      <div className="mx-auto max-w-[1200px]">
        <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div><p className="text-[13px] text-[#61756d]">Money out</p><h1 className="text-[27px] font-extrabold tracking-tight">Expenses</h1><p className="mt-1 text-xs text-[#7c8a83]">Track operating costs from recorded payment vouchers.</p></div>
          <div className="flex gap-2">
            <button type="button" onClick={() => exportExpenses(filtered)} className="inline-flex items-center gap-2 rounded-xl border border-[#dfe8e2] bg-white px-3 py-2.5 text-xs font-bold text-[#496258]"><Download size={15} />Export</button>
            {isAdmin && <button type="button" onClick={() => setShowVoucher(true)} className="rounded-xl bg-[#0d7c71] px-4 py-2.5 text-xs font-extrabold text-white shadow-sm hover:bg-[#086c63]">+ Add expense</button>}
          </div>
        </header>

        <section className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <article className="rounded-[18px] border border-[#e1e8e3] bg-white p-5">
            <div className="flex items-center justify-between text-xs font-bold text-[#61756d]"><span>{period === 'month' ? 'This month' : period === 'last' ? 'Last month' : 'All recorded periods'}</span><span className="grid h-9 w-9 place-items-center rounded-xl bg-[#fff0df] text-[#b45b10]"><TrendingDown size={18} /></span></div>
            <strong className="mt-3 block text-[31px] font-extrabold tracking-tight">{money(total)}</strong>
            <p className="mt-1 text-[11px] text-[#7c8a83]">{filtered.length} payment vouchers classified as expenses</p>
          </article>
          <article className="rounded-[18px] border border-[#e1e8e3] bg-white p-5">
            <div className="flex items-center justify-between text-xs font-bold text-[#61756d]"><span>Top expense category</span><span className="grid h-9 w-9 place-items-center rounded-xl bg-[#e3f4ef] text-[#0c7c72]"><WalletCards size={18} /></span></div>
            <strong className="mt-3 block text-[24px] font-extrabold tracking-tight">{groups[0]?.[0] || 'No expenses yet'}</strong>
            <p className="mt-1 text-[11px] text-[#7c8a83]">{groups.length ? money(groups[0][1]) + ' in the selected period' : 'Record a payment voucher to begin tracking.'}</p>
          </article>
        </section>

        <section className="mb-4 rounded-[18px] border border-[#e1e8e3] bg-white p-4 sm:p-5">
          <div className="mb-4"><h2 className="text-[15px] font-extrabold">By category</h2><p className="mt-1 text-[11px] text-[#82908a]">Categories are inferred from the expense ledger or narration when no explicit category is saved.</p></div>
          {groups.length ? <div className="space-y-4">{groups.map(([name, amount], index) => <div key={name}><div className="mb-1.5 flex items-center justify-between gap-3 text-xs"><span className="font-semibold text-[#30483e]">{name}</span><strong className="text-[#243d34]">{money(amount)}</strong></div><div className="h-2.5 overflow-hidden rounded-full bg-[#edf3ee]"><div className={'h-full rounded-full ' + categoryColors[index % categoryColors.length]} style={{ width: ((amount / maxCategory) * 100) + '%' }} /></div></div>)}</div>
            : <p className="rounded-xl bg-[#f7faf7] p-5 text-center text-xs text-[#7c8a83]">No expense vouchers found for this period.</p>}
        </section>

        <section className="overflow-hidden rounded-[18px] border border-[#e1e8e3] bg-white">
          <div className="flex flex-col gap-3 border-b border-[#edf1ed] p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
            <div><h2 className="text-[15px] font-extrabold">Recent expenses</h2><p className="mt-1 text-[11px] text-[#82908a]">Based on payment vouchers already in the books.</p></div>
            <div className="flex flex-wrap gap-2">
              <select aria-label="Expense period" value={period} onChange={(e) => setPeriod(e.target.value)} className="rounded-xl border border-[#dce6df] bg-[#f9fcfa] px-3 py-2 text-xs font-semibold text-[#38564b]"><option value="month">This month</option><option value="last">Last month</option><option value="all">All time</option></select>
              <input aria-label="Search expenses" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search expense…" className="min-w-0 rounded-xl border border-[#dce6df] bg-[#f9fcfa] px-3 py-2 text-xs text-[#19332c] sm:w-52" />
            </div>
          </div>
          {loading ? <div className="p-8 text-center text-xs text-[#7c8a83]">Loading expenses…</div> : filtered.length ? <div className="divide-y divide-[#edf1ed]">{filtered.map((v) => <article key={v.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5"><div className="flex min-w-0 items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#fff0df] text-[#b45b10]"><ReceiptText size={18} /></span><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-bold text-[#203a31]">{expenseCategory(v)}</h3><span className="rounded-md bg-[#f0f6f1] px-2 py-0.5 text-[10px] font-semibold text-[#657a6f]">{v.voucher_no || 'Payment voucher'}</span></div><p className="mt-1 truncate text-xs text-[#77867f]">{v.party_name || v.narration || 'General payment'}</p><p className="mt-1 text-[10px] text-[#94a098]"><CalendarDays size={12} className="mr-1 inline" />{v.date || 'Date not recorded'}{v.payment_mode ? ' · ' + v.payment_mode : ''}</p></div></div><strong className="pl-[52px] text-sm font-extrabold text-[#a9563b] sm:pl-0">−{money(v.amount)}</strong></article>)}</div> : <div className="p-8 text-center"><p className="text-sm font-bold text-[#425c50]">No matching expenses</p><p className="mt-1 text-xs text-[#82908a]">Try another period or search term.</p></div>}
        </section>
      </div>
    </main>
    <VoucherModal isOpen={showVoucher} onClose={() => setShowVoucher(false)} initialVoucherType="payment" onSuccess={() => { setShowVoucher(false); window.dispatchEvent(new Event('accounting-data-updated')) }} />
  </>
}
