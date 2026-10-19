import { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import {
  Activity, Banknote, BookOpen, Boxes, Building2, ChevronDown, CircleUserRound,
  FileSpreadsheet, LayoutDashboard, LogOut, Menu, PlusCircle, ReceiptText,
  Settings2, ShieldCheck, Users, WalletCards, X
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import VoucherModal from './VoucherModal'

const overviewItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/debtors', label: 'Debtors', icon: Users },
  { to: '/creditors', label: 'Creditors', icon: Building2 },
  { to: '/sales', label: 'Sales', icon: ReceiptText },
  { to: '/daybook', label: 'Day Book', icon: BookOpen },
  { to: '/materials', label: 'Inventory', icon: Boxes },
  { to: '/expenses', label: 'Expenses', icon: WalletCards },
  { to: '/banking', label: 'Loans & Advances', icon: Banknote },
]

const controlItems = [
  { to: '/tally', label: 'Imports', icon: FileSpreadsheet },
  { to: '/users', label: 'Users & access', icon: ShieldCheck },
  { to: '/settings', label: 'App settings', icon: Settings2 },
  { to: '/activity', label: 'Activity log', icon: Activity },
]

export default function Nav() {
  const { isAdmin, isOwner, signOut, user } = useAuth()
  const [voucherOpen, setVoucherOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const location = useLocation()
  const mobileItems = overviewItems.filter((item) => ['/', '/debtors', '/sales', '/materials'].includes(item.to))
  const linkClass = ({ isActive }) =>
    'group flex min-h-[42px] items-center gap-3 rounded-xl px-3 text-[13px] font-semibold no-underline transition-colors ' +
    (isActive || (location.pathname === '/parties' && ['/debtors', '/creditors'].includes(location.pathname))
      ? 'bg-[#e0f2e9] text-[#087367]'
      : 'text-[#c8ded7] hover:bg-white/10 hover:text-white')
  const mobileLinkClass = ({ isActive }) =>
    'flex flex-1 flex-col items-center justify-center gap-1 rounded-2xl px-1 py-2 text-[9px] font-bold no-underline transition-colors ' +
    (isActive ? 'bg-[#dceddf] text-[#0c756a]' : 'text-[#526860]')

  function closeMobile() {
    setMenuOpen(false)
    setMoreOpen(false)
  }

  return <>
    <aside className="fixed inset-y-0 left-0 z-50 hidden w-64 flex-col bg-[#102b25] px-4 py-5 text-white lg:flex">
      <NavLink to="/" className="mb-8 flex items-center gap-3 px-2 text-white no-underline">
        <span className="grid h-10 w-10 place-items-center rounded-[13px] bg-[#ddf3e9] text-[#08766a]"><Building2 size={20} /></span>
        <span><strong className="block text-[16px] tracking-tight">Books Console</strong><small className="mt-0.5 block text-[11px] text-[#a9c9bf]">Accounting workspace</small></span>
      </NavLink>

      <p className="mb-2 px-3 text-[10px] font-extrabold tracking-[1.2px] text-[#8eafa5]">OVERVIEW</p>
      <nav className="grid gap-1" aria-label="Main navigation">
        {overviewItems.map((item) => {
          const Icon = item.icon
          return <NavLink key={item.to} to={item.to} end={item.end || false} className={linkClass}><Icon size={18} /><span>{item.label}</span></NavLink>
        })}
      </nav>

      {isAdmin && <>
        <p className="mb-2 mt-7 px-3 text-[10px] font-extrabold tracking-[1.2px] text-[#8eafa5]">CONTROL</p>
        <nav className="grid gap-1" aria-label="Admin controls">
          {controlItems.map((item) => {
            const Icon = item.icon
            return <NavLink key={item.to} to={item.to} className={linkClass}><Icon size={18} /><span>{item.label}</span></NavLink>
          })}
        </nav>
        <button type="button" onClick={() => setVoucherOpen(true)} className="mt-5 flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/10 px-3 py-3 text-xs font-extrabold text-[#f0fffa] transition hover:bg-white/15"><PlusCircle size={17} />New voucher</button>
      </>}

      <div className="mt-auto border-t border-white/15 pt-4">
        <div className="flex items-center gap-2 px-2 py-2">
          <span className="grid h-9 w-9 place-items-center rounded-full bg-white/10"><CircleUserRound size={18} /></span>
          <span className="min-w-0 flex-1"><strong className="block text-xs">{isAdmin ? 'Admin' : 'Owner'}</strong><small className="mt-1 block text-[10px] text-[#b8d4cb]">{isAdmin ? 'Full control' : 'View and track only'}</small></span>
          <span className="h-2 w-2 rounded-full bg-[#9ce7b8]" />
        </div>
        <p className="truncate px-2 pb-2 text-[10px] text-[#a9c9bf]">{user?.email || 'Accounting account'}</p>
        <button type="button" onClick={() => signOut()} className="flex w-full items-center gap-2 rounded-lg px-2 py-2.5 text-left text-xs font-semibold text-[#c8ded7] transition hover:bg-white/10"><LogOut size={15} />Sign out</button>
      </div>
    </aside>

    <header className="sticky top-0 z-40 flex h-[62px] items-center gap-2 border-b border-[#e2e9e4] bg-[#f4f7f4]/95 px-3 backdrop-blur lg:hidden">
      <button type="button" onClick={() => setMenuOpen((value) => !value)} className="grid h-9 w-9 place-items-center rounded-xl text-[#30574d]" aria-label="Open navigation">{menuOpen ? <X size={20} /> : <Menu size={20} />}</button>
      <NavLink to="/" className="mr-auto flex items-center gap-2 text-[15px] font-extrabold text-[#153c34] no-underline"><span className="grid h-8 w-8 place-items-center rounded-[10px] bg-[#e4f6ee] text-[#0e7167]"><Building2 size={17} /></span>Books Console</NavLink>
      <span className="rounded-lg bg-[#e4f3eb] px-2 py-1 text-[10px] font-extrabold text-[#0d7568]">{isAdmin ? 'Admin' : 'Owner'}</span>
      {isAdmin && <button type="button" onClick={() => setVoucherOpen(true)} aria-label="New voucher" className="grid h-9 w-9 place-items-center rounded-xl bg-[#0e7a70] text-white"><PlusCircle size={19} /></button>}
    </header>

    {menuOpen && <div className="fixed inset-0 top-[62px] z-40 bg-[#122b25]/10 lg:hidden" onClick={closeMobile}>
      <nav className="flex min-h-[calc(100vh-62px)] w-[min(310px,88vw)] flex-col gap-1 bg-[#102b25] p-4 shadow-2xl" onClick={(event) => event.stopPropagation()}>
        {[...overviewItems, ...(isAdmin ? controlItems : [])].map((item) => {
          const Icon = item.icon
          return <NavLink key={item.to} to={item.to} end={item.end || false} className={linkClass} onClick={closeMobile}><Icon size={18} /><span>{item.label}</span></NavLink>
        })}
        <button type="button" onClick={() => signOut()} className="mt-auto flex items-center gap-2 rounded-lg px-3 py-3 text-left text-xs font-semibold text-[#c8ded7]"><LogOut size={16} />Sign out</button>
      </nav>
    </div>}

    <nav className="fixed inset-x-3 bottom-[max(10px,env(safe-area-inset-bottom))] z-40 flex items-center justify-around gap-1 rounded-[25px] border border-white/90 bg-white/95 p-1.5 shadow-[0_8px_32px_rgba(21,58,45,0.13)] backdrop-blur-xl lg:hidden" aria-label="Mobile navigation">
      {mobileItems.map((item) => {
        const Icon = item.icon
        const label = item.to === '/' ? 'Home' : item.to === '/debtors' ? 'Debtors' : item.to === '/sales' ? 'Sales' : 'Stock'
        return <NavLink key={item.to} to={item.to} end={item.end || false} className={mobileLinkClass}><Icon size={20} /><span>{label}</span></NavLink>
      })}
      <button type="button" className={'flex flex-1 flex-col items-center justify-center gap-1 rounded-2xl px-1 py-2 text-[9px] font-bold transition-colors ' + (moreOpen ? 'bg-[#dceddf] text-[#0c756a]' : 'text-[#526860]')} onClick={() => setMoreOpen((value) => !value)}><ChevronDown size={20} /><span>More</span></button>
    </nav>

    {moreOpen && <div className="fixed bottom-[82px] right-5 z-50 flex w-[205px] flex-col rounded-2xl border border-[#e1e9e4] bg-white p-2 shadow-xl lg:hidden">
      {[...overviewItems.filter((item) => ['/creditors', '/expenses', '/banking', '/daybook'].includes(item.to)), ...(isAdmin ? controlItems : [])].map((item) => {
        const Icon = item.icon
        return <NavLink key={item.to} to={item.to} className={mobileLinkClass} onClick={() => setMoreOpen(false)}><Icon size={18} /><span>{item.label}</span></NavLink>
      })}
      <button type="button" className="flex items-center gap-2 px-3 py-2.5 text-left text-xs font-semibold text-[#5b7167]" onClick={() => signOut()}><LogOut size={16} />Sign out</button>
    </div>}

    <VoucherModal isOpen={voucherOpen} onClose={() => setVoucherOpen(false)} onSuccess={() => window.dispatchEvent(new Event('accounting-data-updated'))} />
  </>
}
