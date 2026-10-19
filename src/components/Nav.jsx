import { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { Banknote, BookOpen, Boxes, Building2, ChevronDown, CircleUserRound, FileSpreadsheet, LayoutDashboard, LogOut, Menu, PlusCircle, ReceiptText, Users, X } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import VoucherModal from './VoucherModal'

const items = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/parties', label: 'Debtors & creditors', icon: Users },
  { to: '/sales', label: 'Sales & invoices', icon: ReceiptText },
  { to: '/materials', label: 'Inventory', icon: Boxes },
  { to: '/daybook', label: 'Day Book', icon: BookOpen },
  { to: '/banking', label: 'Loans & advances', icon: Banknote },
]

export default function Nav() {
  const { isAdmin, isOwner, signOut, user } = useAuth()
  const [voucherOpen, setVoucherOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const location = useLocation()
  const extraItems = isAdmin ? [{ to: '/tally', label: 'Tally data import', icon: FileSpreadsheet }] : []
  const desktopLink = ({ isActive }) => 'flex min-h-[42px] items-center gap-3 rounded-xl px-3 text-[13px] font-semibold no-underline transition ' + (isActive ? 'bg-[#e7f5ef] text-[#0e6f65] shadow-sm' : 'text-[#d3e9e4] hover:bg-white/10 hover:text-white')
  const mobileLink = ({ isActive }) => 'flex flex-1 flex-col items-center justify-center gap-1 rounded-2xl px-1 py-2 text-[9px] font-bold no-underline ' + (isActive ? 'bg-[#dceddf] text-[#0c756a]' : 'text-[#526860]')

  return <>
    <aside className="fixed inset-y-0 left-0 z-50 hidden w-64 flex-col border-r border-white/10 bg-[#0e655d] px-4 py-6 text-white lg:flex">
      <NavLink to="/" className="mb-7 flex items-center gap-3 px-2 text-white no-underline">
        <span className="grid h-10 w-10 place-items-center rounded-[13px] bg-[#e4f6ee] text-[#0e7167]"><Building2 size={20} /></span>
        <span><strong className="block text-[17px] tracking-tight">TallyFlow</strong><small className="mt-0.5 block text-[11px] text-[#b9d9d2]">Accounting books</small></span>
      </NavLink>
      <p className="mb-2 px-3 text-[10px] font-extrabold tracking-[1.2px] text-[#a2d0c7]">OVERVIEW</p>
      <nav className="grid gap-1" aria-label="Main navigation">
        {items.map((item) => { const Icon = item.icon; return <NavLink key={item.to} to={item.to} end={item.end || false} className={desktopLink}><Icon size={18} /><span>{item.label}</span></NavLink> })}
      </nav>
      {extraItems.length > 0 && <>
        <p className="mb-2 mt-7 px-3 text-[10px] font-extrabold tracking-[1.2px] text-[#a2d0c7]">CONTROL</p>
        <nav className="grid gap-1" aria-label="Admin controls">
          {extraItems.map((item) => { const Icon = item.icon; return <NavLink key={item.to} to={item.to} className={desktopLink}><Icon size={18} /><span>{item.label}</span></NavLink> })}
        </nav>
        <button type="button" onClick={() => setVoucherOpen(true)} className="mt-5 flex items-center justify-center gap-2 rounded-xl border border-[#a4d9cb54] bg-white/10 px-3 py-3 text-xs font-extrabold text-[#f0fffa] hover:bg-white/15"><PlusCircle size={17} />New voucher</button>
      </>}
      <div className="mt-auto border-t border-white/15 pt-4">
        <div className="flex items-center gap-2 px-2 py-2"><span className="grid h-9 w-9 place-items-center rounded-full bg-white/10"><CircleUserRound size={18} /></span><span className="min-w-0 flex-1"><strong className="block text-xs">{isAdmin ? 'Admin' : 'Owner'}</strong><small className="mt-1 block text-[10px] text-[#c5e2db]">{isAdmin ? 'Full control' : 'View and track only'}</small></span><span className="h-2 w-2 rounded-full bg-[#9ce7b8]" /></div>
        <p className="truncate px-2 pb-2 text-[10px] text-[#b4d7cf]">{user?.email || 'Accounting account'}</p>
        <button type="button" onClick={() => signOut()} className="flex w-full items-center gap-2 rounded-lg px-2 py-2.5 text-left text-xs font-semibold text-[#cee7e1] hover:bg-white/10"><LogOut size={15} />Sign out</button>
      </div>
    </aside>

    <header className="sticky top-0 z-40 flex h-[62px] items-center gap-2 border-b border-[#e2e9e4] bg-[#f4f7f4]/95 px-3 backdrop-blur lg:hidden">
      <button type="button" onClick={() => setMenuOpen((value) => !value)} className="grid h-9 w-9 place-items-center rounded-xl text-[#30574d]" aria-label="Open navigation">{menuOpen ? <X size={20} /> : <Menu size={20} />}</button>
      <NavLink to="/" className="mr-auto flex items-center gap-2 text-[15px] font-extrabold text-[#153c34] no-underline"><span className="grid h-8 w-8 place-items-center rounded-[10px] bg-[#e4f6ee] text-[#0e7167]"><Building2 size={17} /></span>TallyFlow</NavLink>
      <span className="rounded-lg bg-[#e4f3eb] px-2 py-1 text-[10px] font-extrabold text-[#0d7568]">{isAdmin ? 'Admin' : 'Owner'}</span>
      {isAdmin && <button type="button" onClick={() => setVoucherOpen(true)} aria-label="New voucher" className="grid h-9 w-9 place-items-center rounded-xl bg-[#0e7a70] text-white"><PlusCircle size={19} /></button>}
    </header>

    {menuOpen && <div className="fixed inset-0 top-[62px] z-40 bg-[#122b25]/10 lg:hidden" onClick={() => setMenuOpen(false)}>
      <nav className="flex min-h-[calc(100vh-62px)] w-[min(310px,88vw)] flex-col gap-1 bg-[#0e655d] p-4 shadow-2xl" onClick={(event) => event.stopPropagation()}>
        {[...items, ...extraItems].map((item) => { const Icon = item.icon; return <NavLink key={item.to} to={item.to} end={item.end || false} className={desktopLink} onClick={() => setMenuOpen(false)}><Icon size={18} /><span>{item.label}</span></NavLink> })}
        <button type="button" onClick={() => signOut()} className="mt-auto flex items-center gap-2 rounded-lg px-3 py-3 text-left text-xs font-semibold text-[#cee7e1]"><LogOut size={16} />Sign out</button>
      </nav>
    </div>}

    <nav className="fixed inset-x-3 bottom-[max(10px,env(safe-area-inset-bottom))] z-40 flex items-center justify-around gap-1 rounded-[25px] border border-white/90 bg-white/95 p-1.5 shadow-[0_8px_32px_rgba(21,58,45,0.13)] backdrop-blur-xl lg:hidden" aria-label="Mobile navigation">
      <NavLink to="/" end className={mobileLink}><LayoutDashboard size={20} /><span>Home</span></NavLink>
      <NavLink to="/parties" className={mobileLink}><Users size={20} /><span>Debtors</span></NavLink>
      <NavLink to="/sales" className={mobileLink}><ReceiptText size={20} /><span>Sales</span></NavLink>
      <NavLink to="/materials" className={mobileLink}><Boxes size={20} /><span>Stock</span></NavLink>
      <button type="button" className={'flex flex-1 flex-col items-center justify-center gap-1 rounded-2xl px-1 py-2 text-[9px] font-bold ' + (moreOpen ? 'bg-[#dceddf] text-[#0c756a]' : 'text-[#526860]')} onClick={() => setMoreOpen((value) => !value)}><ChevronDown size={20} /><span>More</span></button>
    </nav>

    {moreOpen && <div className="fixed bottom-[82px] right-5 z-50 flex w-[205px] flex-col rounded-2xl border border-[#e1e9e4] bg-white p-2 shadow-xl lg:hidden">
      <NavLink to="/daybook" className={mobileLink} onClick={() => setMoreOpen(false)}><BookOpen size={18} /><span>Day Book</span></NavLink>
      <NavLink to="/banking" className={mobileLink} onClick={() => setMoreOpen(false)}><Banknote size={18} /><span>Loans & advances</span></NavLink>
      {isAdmin && <NavLink to="/tally" className={mobileLink} onClick={() => setMoreOpen(false)}><FileSpreadsheet size={18} /><span>Tally data</span></NavLink>}
      <button type="button" className="flex items-center gap-2 px-3 py-2.5 text-left text-xs font-semibold text-[#5b7167]" onClick={() => signOut()}><LogOut size={16} />Sign out</button>
    </div>}

    <span className="hidden" aria-hidden="true">{location.pathname}{isOwner ? '-owner' : '-admin'}</span>
    <VoucherModal isOpen={voucherOpen} onClose={() => setVoucherOpen(false)} onSuccess={() => window.dispatchEvent(new Event('accounting-data-updated'))} />
  </>
}
