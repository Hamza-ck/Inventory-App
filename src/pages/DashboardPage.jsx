import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Activity, ArrowRight, ArrowUpRight, Boxes, CircleAlert, Clock3, Download, FileSpreadsheet, Landmark, RefreshCw, ReceiptText, Users } from 'lucide-react'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis } from 'recharts'
import { accDb } from '../lib/accountingDb'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import Nav from '../components/Nav'

const money = (value) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', notation: 'compact', maximumFractionDigits: 1 }).format(Number(value) || 0)
const exactMoney = (value) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(Number(value) || 0)
const keyDate = (value) => {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-')
}
const displayDate = (value) => {
  const date = value ? new Date(value) : null
  return date && !Number.isNaN(date.getTime()) ? date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '—'
}
const greeting = () => {
  const hour = new Date().getHours()
  return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
}
const ageLabel = (days) => days > 60 ? '60d+' : days > 30 ? '31–60d' : '0–30d'

function MetricCard({ label, value, detail, icon: Icon, tone, to }) {
  const content = <>
    <div className="flex items-center justify-between gap-2 text-xs font-bold text-[#61756d]"><span>{label}</span><span className={'grid h-8 w-8 place-items-center rounded-xl ' + tone}><Icon size={17} /></span></div>
    <strong className="mt-3 text-[23px] font-extrabold tracking-tight text-[#162f2a]">{value}</strong>
    <span className="mt-auto pt-2 text-[10px] leading-relaxed text-[#7a8982]">{detail}</span>
  </>
  return to
    ? <Link to={to} className="flex min-h-[132px] flex-col rounded-2xl border border-[#e1e9e3] bg-white p-4 no-underline transition hover:-translate-y-0.5 hover:shadow-lg">{content}</Link>
    : <article className="flex min-h-[132px] flex-col rounded-2xl border border-[#e1e9e3] bg-white p-4">{content}</article>
}

function downloadCsv(vouchers, period) {
  const rows = [['Period', period], ['Generated', new Date().toISOString()], [], ['Voucher no', 'Date', 'Type', 'Party', 'Amount', 'Paid', 'Due', 'Narration'],
    ...vouchers.map((v) => [v.voucher_no || '', v.date || '', v.voucher_type || '', v.party_name || '', v.amount || 0, v.paid_amount || 0, v.due_amount || 0, v.narration || ''])]
  const csv = rows.map((row) => row.map((cell) => '"' + String(cell ?? '').replaceAll('"', '""') + '"').join(',')).join('\r\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = 'accounting-report-' + keyDate(new Date()) + '.csv'
  anchor.click()
  URL.revokeObjectURL(url)
}

export default function DashboardPage() {
  const { isAdmin, user } = useAuth()
  const [period, setPeriod] = useState('Today')
  const [data, setData] = useState({ vouchers: [], parties: [], materials: [], ledgers: [], shopName: 'Your business' })
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [updatedAt, setUpdatedAt] = useState(null)

  async function refresh() {
    setRefreshing(true)
    try {
      const [localVouchers, localParties, localMaterials, localLedgers, settings] = await Promise.all([
        accDb.vouchers.toArray(), accDb.parties.toArray(), accDb.materials.toArray(), accDb.ledgers.toArray(), accDb.settings.toArray(),
      ])
      const shopName = settings.find((item) => item.key === 'shop_name')?.value || 'Your business'
      const localSnapshot = { vouchers: localVouchers, parties: localParties, materials: localMaterials, ledgers: localLedgers, shopName }
      setData(localSnapshot)
      if (user?.id && user.id !== 'local-demo') {
        const result = await Promise.all([
          supabase.from('vouchers').select('*').order('date', { ascending: false }).limit(2000),
          supabase.from('parties').select('*').limit(2000),
          supabase.from('materials').select('*').limit(2000),
          supabase.from('ledgers').select('*').limit(2000),
        ])
        const failed = result.find((response) => response.error)
        if (failed) throw failed.error
        // Apply the cloud result only when all four reads succeed; this avoids a mixed/partial dashboard refresh.
        setData({ vouchers: result[0].data || [], parties: result[1].data || [], materials: result[2].data || [], ledgers: result[3].data || [], shopName })
      }
      setUpdatedAt(new Date())
      setErrorMessage('')
    } catch (error) {
      console.error('Accounting dashboard refresh failed:', error)
      setErrorMessage('Cloud refresh failed. The last locally saved view remains on screen; figures may be out of date.')
    } finally {
      setRefreshing(false)
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
    const listener = () => refresh()
    window.addEventListener('accounting-data-updated', listener)
    const interval = window.setInterval(() => { if (navigator.onLine) refresh() }, 60000)
    return () => {
      window.removeEventListener('accounting-data-updated', listener)
      window.clearInterval(interval)
    }
  }, [user?.id])

  const start = useMemo(() => {
    const date = new Date()
    date.setHours(0, 0, 0, 0)
    if (period === 'Week') date.setDate(date.getDate() - 6)
    if (period === 'Month') date.setDate(1)
    return date
  }, [period])

  const scoped = useMemo(() => data.vouchers.filter((voucher) => {
    const date = new Date(voucher.date || voucher.created_at || voucher.createdAt)
    return !Number.isNaN(date.getTime()) && date >= start
  }), [data.vouchers, start])

  const sales = scoped.filter((voucher) => voucher.voucher_type === 'sales')
  const payments = scoped.filter((voucher) => voucher.voucher_type === 'payment' && (voucher.expense_category || voucher.debit_ledger_name?.toLowerCase().includes('expense') || voucher.debit_ledger_name?.toLowerCase().includes('rent') || voucher.debit_ledger_name?.toLowerCase().includes('salary')))
  const salesTotal = sales.reduce((sum, voucher) => sum + (Number(voucher.amount) || 0), 0)
  const expenses = payments.reduce((sum, voucher) => sum + (Number(voucher.amount) || 0), 0)
  const gross = sales.reduce((sum, voucher) => sum + (Array.isArray(voucher.items) && voucher.items.length
    ? voucher.items.reduce((sub, item) => sub + ((Number(item.rate) || 0) - (Number(item.cost_rate) || 0)) * (Number(item.qty) || 0), 0)
    : (Number(voucher.amount) || 0) * 0.2), 0)
  const netProfit = gross - expenses
  const debtors = data.parties.filter((party) => party.type === 'debtor')
  const creditors = data.parties.filter((party) => party.type === 'creditor')
  const debtorTotal = debtors.reduce((sum, party) => sum + (Number(party.current_balance) || 0), 0)
  const creditorTotal = creditors.reduce((sum, party) => sum + (Number(party.current_balance) || 0), 0)
  const inventoryValue = data.materials.reduce((sum, item) => sum + (Number(item.current_qty) || 0) * (Number(item.purchase_rate) || 0), 0)
  const loansOwed = data.ledgers.filter((ledger) => String(ledger.group || '').toLowerCase().includes('loans (liability)')).reduce((sum, ledger) => sum + (Number(ledger.current_balance) || 0), 0)
  const advancesGiven = data.ledgers.filter((ledger) => String(ledger.group || '').toLowerCase().includes('loans & advances (asset)')).reduce((sum, ledger) => sum + (Number(ledger.current_balance) || 0), 0)
  const chartData = useMemo(() => {
    const days = []
    for (let offset = 6; offset >= 0; offset -= 1) {
      const day = new Date()
      day.setDate(day.getDate() - offset)
      const key = keyDate(day)
      const amount = data.vouchers.filter((voucher) => voucher.voucher_type === 'sales' && keyDate(voucher.date || voucher.created_at) === key).reduce((sum, voucher) => sum + (Number(voucher.amount) || 0), 0)
      days.push({ day: day.toLocaleDateString('en-IN', { weekday: 'short' }), sales: amount })
    }
    return days
  }, [data.vouchers])
  const receivables = [...debtors].filter((party) => Number(party.current_balance) > 0).sort((a, b) => Number(b.current_balance) - Number(a.current_balance)).slice(0, 4)
  const lowStock = [...data.materials].filter((item) => Number(item.current_qty) <= Number(item.reorder_threshold || 0)).sort((a, b) => Number(a.current_qty) - Number(b.current_qty)).slice(0, 4)
  const recentInvoices = [...data.vouchers].filter((voucher) => voucher.voucher_type === 'sales').sort((a, b) => new Date(b.date || b.created_at || 0) - new Date(a.date || a.created_at || 0)).slice(0, 5)

  function dueAge(party) {
    const rows = data.vouchers.filter((voucher) => Number(voucher.due_amount) > 0 && ((voucher.party_id && voucher.party_id === party.id) || String(voucher.party_name || '').toLowerCase() === String(party.name || '').toLowerCase())).sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0))
    if (!rows.length) return 'Open balance'
    const age = Math.max(0, Math.floor((Date.now() - new Date(rows[0].date).getTime()) / 86400000))
    return ageLabel(age)
  }

  if (loading) return <><Nav /><main className="min-h-screen bg-[#f4f7f4] text-[#38534d] lg:ml-64 lg:w-[calc(100%-16rem)]"><div className="flex min-h-[70vh] items-center justify-center gap-3"><span className="h-2 w-2 animate-pulse rounded-full bg-[#0f8177]" />Loading your books…</div></main></>

  return <>
    <Nav />
    <main className="min-h-screen bg-[#f4f7f4] px-4 pb-28 pt-5 text-[#172f2c] sm:px-6 lg:ml-64 lg:w-[calc(100%-16rem)] lg:px-9 lg:pb-6 lg:pt-8">
      <div className="mx-auto max-w-[1480px]">
        <div className="mb-5 flex flex-col gap-4 lg:mb-6 lg:flex-row lg:items-start lg:justify-between">
          <div><p className="mb-1 text-[13px] text-[#61756d]">{greeting()}</p><h1 className="text-[26px] font-extrabold leading-tight tracking-tight text-[#142e29] lg:text-[31px]">{data.shopName}</h1><p className="mt-1 hidden text-xs text-[#7c8a83] lg:block">Here is how your business is doing.</p></div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-1 gap-1 rounded-xl border border-[#e1e9e3] bg-[#e9f0eb] p-1 sm:flex-none">
              {['Today', 'Week', 'Month'].map((option) => <button key={option} type="button" onClick={() => setPeriod(option)} className={'flex-1 rounded-lg px-4 py-2 text-xs font-bold ' + (period === option ? 'bg-white text-[#153b33] shadow-sm' : 'text-[#63776e]')}>{option}</button>)}
            </div>
            <button type="button" onClick={refresh} disabled={refreshing} className="inline-flex items-center gap-2 rounded-xl border border-[#dfe8e2] bg-white px-3 py-2.5 text-xs font-bold text-[#496258]"><RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} /> Refresh</button>
            <button type="button" onClick={() => downloadCsv(scoped, period)} className="hidden items-center gap-2 rounded-xl border border-[#dfe8e2] bg-white px-3 py-2.5 text-xs font-bold text-[#496258] sm:inline-flex"><Download size={14} /> Download report</button>
          </div>
        </div>

        {errorMessage && <div className="mb-4 flex items-center gap-2 rounded-xl border border-[#f2dcba] bg-[#fff7e9] px-4 py-3 text-xs text-[#87561d]"><CircleAlert size={16} />{errorMessage}</div>}

        <section className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
          <article className="relative col-span-2 flex min-h-[166px] flex-col justify-between overflow-hidden rounded-[20px] bg-gradient-to-br from-[#10877c] to-[#087268] p-5 text-white shadow-lg shadow-[#0b766b]/10">
            <div className="relative z-10 flex items-center justify-between text-[13px] font-bold text-[#dcf5ef]"><span>Sales {period === 'Today' ? 'today' : period === 'Week' ? 'this week' : 'this month'}</span><span className="grid h-9 w-9 place-items-center rounded-xl bg-white/15"><Activity size={20} /></span></div>
            <strong className="relative z-10 text-[36px] font-extrabold tracking-tight sm:text-[42px]">{money(salesTotal)}</strong>
            <div className="relative z-10 flex flex-wrap items-center justify-between gap-2 text-[10px] text-[#d6eee9]"><span>{sales.length} sales invoices in this period</span><span className="inline-flex items-center gap-1 rounded-full bg-[#effaf6] px-2.5 py-1 font-extrabold text-[#0f7569]"><ArrowUpRight size={13} /> Live books</span></div>
            <div className="pointer-events-none absolute -bottom-24 -right-10 h-52 w-52 rounded-full border-[25px] border-white/5 shadow-[0_0_0_20px_rgba(255,255,255,0.03),0_0_0_40px_rgba(255,255,255,0.02)]" />
          </article>
          <MetricCard label="Profit" value={money(netProfit)} detail="Estimated from recorded sales and expenses" icon={ArrowUpRight} tone="bg-[#e5f6ee] text-[#0a7a61]" />
          <MetricCard label="Expenses" value={money(expenses)} detail="Recorded payment vouchers" icon={ReceiptText} tone="bg-[#fff0df] text-[#b45b10]" to="/daybook" />
          <MetricCard label="Debtors" value={money(debtorTotal)} detail={'They owe you · ' + debtors.length + ' parties'} icon={Users} tone="bg-[#e3f4ef] text-[#0c7c72]" to="/parties" />
          <MetricCard label="Creditors" value={money(creditorTotal)} detail={'You owe · ' + creditors.length + ' suppliers'} icon={Landmark} tone="bg-[#fff0e2] text-[#ba5e18]" to="/parties" />
          <MetricCard label="Inventory" value={money(inventoryValue)} detail={data.materials.length + ' stock items · cost value'} icon={Boxes} tone="bg-[#ebf0f3] text-[#334d63]" to="/materials" />
          <MetricCard label="Loans & advances" value={money(loansOwed - advancesGiven)} detail="Net liability" icon={Landmark} tone="bg-[#eff1f7] text-[#4d5b73]" to="/banking" />
        </section>

        <section className="mb-4 grid gap-4 xl:grid-cols-[1.55fr_1fr]">
          <article className="min-w-0 rounded-[18px] border border-[#e1e8e3] bg-white p-4 sm:p-5">
            <div className="flex items-start justify-between gap-3"><div><h2 className="text-[15px] font-extrabold">Sales, last 7 days</h2><p className="mt-1 text-[11px] text-[#82908a]">Daily sales recorded in the books</p></div><Link to="/sales" className="inline-flex items-center gap-1 whitespace-nowrap text-[11px] font-extrabold text-[#0d786d] no-underline">View sales <ArrowRight size={14} /></Link></div>
            <div className="mt-4 text-[27px] font-extrabold tracking-tight">{money(chartData.reduce((sum, day) => sum + day.sales, 0))}</div>
            <div className="mt-2 h-[180px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                  <defs><linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#0f8177" stopOpacity={0.2} /><stop offset="100%" stopColor="#0f8177" stopOpacity={0.02} /></linearGradient></defs>
                  <CartesianGrid stroke="#edf1ee" vertical={false} />
                  <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: '#74817d', fontSize: 12 }} dy={8} />
                  <Tooltip formatter={(value) => exactMoney(value)} contentStyle={{ borderRadius: 12, border: '1px solid #e3e9e5' }} />
                  <Area type="monotone" dataKey="sales" stroke="#0f8177" strokeWidth={2.5} fill="url(#salesFill)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </article>

          <article className="min-w-0 rounded-[18px] border border-[#e1e8e3] bg-white p-4 sm:p-5">
            <div className="flex items-start justify-between gap-3"><div><h2 className="text-[15px] font-extrabold">Money to collect</h2><p className="mt-1 text-[11px] text-[#82908a]">Customers with outstanding dues</p></div><Link to="/parties" className="inline-flex items-center gap-1 whitespace-nowrap text-[11px] font-extrabold text-[#0d786d] no-underline">All debtors <ArrowRight size={14} /></Link></div>
            <div className="mt-3 divide-y divide-[#edf1ee]">
              {receivables.length ? receivables.map((party) => {
                const phone = String(party.phone || '').replace(/\D/g, '')
                const message = encodeURIComponent('Friendly reminder: your outstanding balance is ' + exactMoney(party.current_balance) + '. Please let us know when it can be settled. Thank you.')
                const related = data.vouchers.filter((voucher) => Number(voucher.due_amount) > 0 && ((voucher.party_id && voucher.party_id === party.id) || String(voucher.party_name || '').toLowerCase() === String(party.name || '').toLowerCase())).sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0))
                const days = related.length ? Math.max(0, Math.floor((Date.now() - new Date(related[0].date).getTime()) / 86400000)) : -1
                return <div key={party.id || party.name} className="flex items-center gap-2.5 py-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#e7f4ef] text-xs font-extrabold text-[#0a7c71]">{String(party.name || '?').slice(0, 1).toUpperCase()}</span>
                  <div className="min-w-0 flex-1"><strong className="block truncate text-xs font-bold text-[#243d37]">{party.name}</strong><span className="mt-1 block text-[10px] text-[#82908a]">{days < 0 ? 'Open balance' : ageLabel(days)}</span></div>
                  <div className="text-right"><strong className="block text-xs font-extrabold">{money(party.current_balance)}</strong>{phone && <a className="mt-1 inline-block text-[10px] font-extrabold text-[#0c786c] no-underline" href={'https://wa.me/' + phone + '?text=' + message} target="_blank" rel="noreferrer">Remind</a>}</div>
                </div>
              }) : <div className="flex min-h-[142px] flex-col items-center justify-center gap-2 text-center text-xs text-[#8a9a93]"><Users size={24} className="text-[#92b9ac]" />No outstanding customer balances.</div>}
            </div>
          </article>
        </section>

        <section className="mb-4 grid gap-4 xl:grid-cols-[1.55fr_1fr]">
          <article className="min-w-0 rounded-[18px] border border-[#e1e8e3] bg-white p-4 sm:p-5">
            <div className="flex items-start justify-between gap-3"><div><h2 className="text-[15px] font-extrabold">Recent invoices</h2><p className="mt-1 text-[11px] text-[#82908a]">The latest sales vouchers from your books</p></div><Link to="/sales" className="inline-flex items-center gap-1 whitespace-nowrap text-[11px] font-extrabold text-[#0d786d] no-underline">View all <ArrowRight size={14} /></Link></div>
            <div className="mt-3 divide-y divide-[#edf1ee]">
              {recentInvoices.length ? recentInvoices.map((voucher) => <Link to="/sales" key={voucher.id || voucher.voucher_no} className="flex items-center gap-3 py-3 no-underline">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#f0f2f9] text-[#5d6389]"><ReceiptText size={18} /></span>
                <span className="min-w-0 flex-1"><strong className="block truncate text-xs font-bold text-[#243d37]">{voucher.voucher_no || 'Sales voucher'}</strong><span className="mt-1 block truncate text-[10px] text-[#82908a]">{voucher.party_name || 'Walk-in customer'} · {displayDate(voucher.date || voucher.created_at)}</span></span>
                <span className="text-right"><strong className="block text-xs font-extrabold text-[#253c36]">{money(voucher.amount)}</strong><span className={'mt-1 inline-block rounded-md px-2 py-0.5 text-[9px] font-extrabold ' + (Number(voucher.due_amount) > 0 ? 'bg-[#fff2df] text-[#a65d0d]' : 'bg-[#e5f7ee] text-[#0d7864]')}>{Number(voucher.due_amount) > 0 ? 'Due' : 'Paid'}</span></span>
              </Link>) : <div className="flex min-h-[120px] flex-col items-center justify-center gap-2 text-xs text-[#8a9a93]"><ReceiptText size={23} />No sales invoices imported yet.</div>}
            </div>
          </article>

          <article className="min-w-0 rounded-[18px] border border-[#e1e8e3] bg-white p-4 sm:p-5">
            <div className="flex items-start justify-between gap-3"><div><h2 className="text-[15px] font-extrabold">Inventory alerts</h2><p className="mt-1 text-[11px] text-[#82908a]">At or below reorder threshold</p></div><Link to="/materials" className="inline-flex items-center gap-1 whitespace-nowrap text-[11px] font-extrabold text-[#0d786d] no-underline">View stock <ArrowRight size={14} /></Link></div>
            <div className="mt-3 divide-y divide-[#edf1ee]">
              {lowStock.length ? lowStock.map((item) => <div key={item.id || item.sku} className="flex items-center gap-3 py-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#edf2f5] text-[#51697d]"><Boxes size={17} /></span>
                <span className="min-w-0 flex-1"><strong className="block truncate text-xs font-bold text-[#243d37]">{item.name}</strong><span className="mt-1 block truncate text-[10px] text-[#82908a]">{item.sku || 'No SKU'}</span></span>
                <span className={'rounded-lg px-2 py-1.5 text-[10px] font-extrabold ' + (Number(item.current_qty) <= 0 ? 'bg-[#ffebeb] text-[#bf3b38]' : 'bg-[#fff1de] text-[#ad650f]')}>{Number(item.current_qty) || 0} {item.unit || 'pcs'}</span>
              </div>) : <div className="flex min-h-[120px] flex-col items-center justify-center gap-2 text-xs text-[#8a9a93]"><Boxes size={23} />No low-stock alerts.</div>}
            </div>
            <div className="mt-2 flex items-center gap-2 border-t border-[#edf1ee] pt-3 text-[10px] text-[#7b8982]"><Clock3 size={14} />{data.materials.filter((item) => Number(item.current_qty) <= Number(item.reorder_threshold || 0)).length} items require attention.</div>
          </article>
        </section>

        <footer className="flex flex-wrap items-center gap-3 px-1 py-2 text-[10px] text-[#75847d]"><span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-[#18a877]" />{updatedAt ? 'Last refreshed ' + updatedAt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : 'Waiting for refresh'}</span><span className="ml-auto">{isAdmin ? 'Admin view · full control' : 'Owner view · read and track only'}</span><Link to={isAdmin ? '/tally' : '/banking'} className="hidden items-center gap-1 font-extrabold text-[#0b756a] no-underline sm:inline-flex">{isAdmin ? <><FileSpreadsheet size={14} />Import Tally data</> : <>Track loans & advances <ArrowRight size={14} /></>}</Link></footer>
      </div>
    </main>
  </>
}
