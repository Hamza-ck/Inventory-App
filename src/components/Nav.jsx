import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, Receipt, BookOpen, Boxes, Users, Landmark, FileSpreadsheet,
  PlusCircle, LogOut, ShieldAlert, ShieldCheck, Menu, X, Building2,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useVoucherEditor } from '../context/VoucherEditorContext'

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', short: 'Home', icon: LayoutDashboard, end: true },
  { to: '/daybook', label: 'Day Book', icon: BookOpen },
  { to: '/sales', label: 'Sales & Invoices', short: 'Sales', icon: Receipt },
  { to: '/materials', label: 'Inventory', short: 'Stock', icon: Boxes },
  { to: '/parties', label: 'Debtors & Creditors', short: 'Parties', icon: Users },
  { to: '/banking', label: 'Cash & Loans', icon: Landmark },
  { to: '/tally', label: 'Tally Import/Export', icon: FileSpreadsheet },
]
// Bottom bar on phones: the 4 most-used screens + the "+" button
const BOTTOM_ITEMS = ['/', '/sales', '/parties', '/materials']

export default function Nav() {
  const { role, setRole, isAdmin, signOut } = useAuth()
  const { openVoucher } = useVoucherEditor()
  const [menuOpen, setMenuOpen] = useState(false)

  const linkClass = (base, active, idle) => ({ isActive }) => `${base} ${isActive ? active : idle}`

  return (
    <>
      <header className="sticky top-0 z-40 apple-glass-nav text-[#10231F] no-print">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="lg:hidden p-2 text-[#2F4540] hover:text-[#10231F] rounded-xl hover:bg-white/60 transition-colors"
              aria-label="Toggle menu"
              aria-expanded={menuOpen}
            >
              {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
            <NavLink to="/" className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-[#0F766E] text-white flex items-center justify-center font-extrabold shadow-sm">
                S
              </div>
              <div>
                <span className="font-extrabold text-base tracking-tight leading-tight block text-[#10231F]">
                  TallyFlow <span className="text-[#0F766E] font-bold text-xs bg-teal-50/80 px-1.5 py-0.5 rounded-md border border-teal-200/60">Owner</span>
                </span>
                <span className="text-[10px] text-[#4A5C57] tracking-wider uppercase font-bold block leading-none">
                  Accounting Cloud
                </span>
              </div>
            </NavLink>
          </div>

          <nav className="hidden lg:flex items-center gap-1.5" aria-label="Main">
            {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={linkClass('flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all', 'bg-[#0F766E] text-white shadow-sm', 'text-[#2F4540] hover:text-[#10231F] hover:bg-white/60')}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{label}</span>
              </NavLink>
            ))}
          </nav>

          <div className="flex items-center gap-2.5">
            {isAdmin && (
              <button
                type="button"
                onClick={() => openVoucher()}
                className="inline-flex items-center gap-1.5 px-3 py-2 bg-[#0F766E] hover:bg-[#0B5F59] text-white font-extrabold text-xs rounded-xl shadow-sm active:scale-95 transition-all"
              >
                <PlusCircle className="w-4 h-4" />
                <span className="hidden sm:inline">New Voucher</span>
                <span className="sm:hidden">New</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setRole(role === 'admin' ? 'owner' : 'admin')}
              title="Switch view mode"
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${
                isAdmin
                  ? 'bg-teal-50/80 text-[#0F766E] border-teal-200/80 hover:bg-teal-100/80'
                  : 'bg-amber-50/80 text-amber-900 border-amber-200/80 hover:bg-amber-100/80'
              }`}
            >
              {isAdmin ? <ShieldCheck className="w-3.5 h-3.5" /> : <ShieldAlert className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">{isAdmin ? 'Admin (Data Entry)' : 'Owner (View Only)'}</span>
              <span className="sm:hidden">{isAdmin ? 'Admin' : 'Owner'}</span>
            </button>

            <button
              type="button"
              onClick={signOut}
              title="Sign out"
              aria-label="Sign out"
              className="p-2 text-[#4A5C57] hover:text-rose-600 hover:bg-white/60 rounded-xl transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>

        {menuOpen && (
          <nav className="lg:hidden border-t border-white/60 apple-glass-elevated px-4 py-3 space-y-1" aria-label="Menu">
            {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                onClick={() => setMenuOpen(false)}
                className={linkClass('flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-sm font-bold transition-all', 'bg-[#0F766E] text-white', 'text-[#2F4540] hover:bg-white/60')}
              >
                <Icon className="w-4 h-4" />
                <span>{label}</span>
              </NavLink>
            ))}
          </nav>
        )}
      </header>

      {/* Floating Apple Glassmorphic Dock on mobile */}
      <nav
        aria-label="Quick"
        className="lg:hidden fixed bottom-3.5 left-3.5 right-3.5 z-40 apple-glass-dock rounded-[28px] p-1.5 flex items-center justify-around shadow-xl no-print"
      >
        {NAV_ITEMS.filter((i) => BOTTOM_ITEMS.includes(i.to)).map(({ to, short, label, icon: Icon, end }, idx) => (
          <span key={to} className="contents">
            {idx === 2 && isAdmin && (
              <button
                type="button"
                onClick={() => openVoucher()}
                aria-label="New voucher"
                className="flex items-center justify-center -mt-6 bg-[#0F766E] text-white w-12 h-12 rounded-full shadow-lg border-2 border-white/80 active:scale-95 transition-transform"
              >
                <PlusCircle className="w-6 h-6" />
              </button>
            )}
            <NavLink
              to={to}
              end={end}
              className={linkClass('flex flex-col items-center justify-center py-2 px-2 text-[10px] rounded-2xl transition-all flex-1', 'bg-[#0F766E]/15 text-[#0B5F59] font-extrabold', 'text-[#2F4540] font-semibold hover:text-[#10231F]')}
            >
              <Icon className="w-5 h-5 mb-0.5" />
              <span>{short || label}</span>
            </NavLink>
          </span>
        ))}
      </nav>
    </>
  )
}
