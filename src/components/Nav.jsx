import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  Users,
  CreditCard,
  BarChart3,
  Box,
  MinusCircle,
  Banknote,
  Upload,
  UserCheck,
  Settings,
  Activity,
  SlidersHorizontal,
  LogOut,
  X,
  FileSpreadsheet,
  RotateCcw,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'

export default function Nav() {
  const { isAdmin, isOwner, setRole, shopName, signOut } = useAuth()
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false)
  const [roleModalOpen, setRoleModalOpen] = useState(false)

  // Overview links matching PDF Page 5 & Page 11
  const overviewLinks = [
    { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
    { to: '/debtors', label: 'Debtors', icon: Users },
    { to: '/creditors', label: 'Creditors', icon: CreditCard },
    { to: '/sales', label: 'Sales & Invoices', icon: BarChart3 },
    { to: '/inventory', label: 'Inventory', icon: Box },
    { to: '/expenses', label: 'Expenses', icon: MinusCircle },
    { to: '/loans', label: 'Loans & Advances', icon: Banknote },
  ]

  // Control links for Admin matching PDF Page 11 & Page 14
  const controlLinks = [
    { to: '/tally', label: 'Imports', icon: Upload },
    { to: '/settings?tab=users', label: 'Users & access', icon: UserCheck },
    { to: '/settings', label: 'App settings', icon: Settings },
    { to: '/settings?tab=activity', label: 'Activity log', icon: Activity },
  ]

  const desktopLinkStyle = ({ isActive }) =>
    'flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-[13px] font-semibold transition-all duration-150 no-underline ' +
    (isActive
      ? 'bg-white/15 text-white font-bold shadow-xs'
      : 'text-[#bad4cb] hover:bg-white/10 hover:text-white')

  const mobileBottomLinkStyle = ({ isActive }) =>
    'flex flex-1 flex-col items-center justify-center py-1.5 px-2 rounded-2xl text-[10px] font-semibold transition no-underline ' +
    (isActive ? 'bg-[#dbeef4] text-[#0b5f55] font-bold shadow-xs' : 'text-[#58736a] hover:text-[#0b5f55]')

  return (
    <>
      {/* ================= DESKTOP SIDEBAR (PDF Page 5, 11, 13, 14) ================= */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col bg-[#0b3832] px-4 py-5 text-white shadow-xl lg:flex">
        {/* Brand Header */}
        <div className="mb-6 flex items-center justify-between px-2">
          <NavLink to="/" className="flex items-center gap-3 text-white no-underline">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#0e7467] text-base font-extrabold text-white shadow-sm">
              {isAdmin ? 'B' : 'S'}
            </span>
            <div className="min-w-0">
              <strong className="block truncate text-[15px] font-bold tracking-tight text-white">
                {isAdmin ? 'Books Console' : shopName}
              </strong>
              <small className="block text-[11px] font-medium text-[#86b5a8]">
                {isAdmin ? 'Admin Console' : 'Owner view'}
              </small>
            </div>
          </NavLink>
        </div>

        {/* Quick Role Switcher Pill in Sidebar */}
        <div className="mb-5 rounded-xl bg-[#082b26] p-1 flex items-center text-xs">
          <button
            type="button"
            onClick={() => setRole('admin')}
            className={`flex-1 py-1.5 rounded-lg font-bold text-center transition ${
              isAdmin ? 'bg-[#0e7467] text-white shadow-sm' : 'text-[#87aba1] hover:text-white'
            }`}
          >
            Admin view
          </button>
          <button
            type="button"
            onClick={() => setRole('owner')}
            className={`flex-1 py-1.5 rounded-lg font-bold text-center transition ${
              isOwner ? 'bg-[#0e7467] text-white shadow-sm' : 'text-[#87aba1] hover:text-white'
            }`}
          >
            Owner view
          </button>
        </div>

        {/* Navigation Groups */}
        <div className="flex-1 overflow-y-auto space-y-5 pr-1">
          <NavLink
            to="/tally"
            className="w-full flex items-center justify-center gap-2 rounded-2xl bg-[#0f7d6f] hover:bg-[#139181] text-white py-2.5 px-3 text-xs font-extrabold shadow-sm transition active:scale-98 no-underline"
          >
            <FileSpreadsheet size={16} strokeWidth={2.2} />
            <span>Tally XML Import</span>
          </NavLink>

          <div>
            <p className="mb-2 px-3 text-[10px] font-extrabold tracking-[1.2px] text-[#78a89a]">
              OVERVIEW
            </p>
            <nav className="grid gap-1">
              {overviewLinks.map((item) => {
                const Icon = item.icon
                return (
                  <NavLink key={item.to} to={item.to} end={item.end} className={desktopLinkStyle}>
                    <Icon size={17} strokeWidth={2.2} />
                    <span>{item.label}</span>
                  </NavLink>
                )
              })}
            </nav>
          </div>

          {isAdmin && (
            <div>
              <p className="mb-2 px-3 text-[10px] font-extrabold tracking-[1.2px] text-[#78a89a]">
                CONTROL
              </p>
              <nav className="grid gap-1">
                {controlLinks.map((item) => {
                  const Icon = item.icon
                  return (
                    <NavLink key={item.to} to={item.to} className={desktopLinkStyle}>
                      <Icon size={17} strokeWidth={2.2} />
                      <span>{item.label}</span>
                    </NavLink>
                  )
                })}
              </nav>
            </div>
          )}
        </div>

        {/* Footer info & Session */}
        <div className="mt-auto border-t border-white/10 pt-4">
          <div className="flex items-center justify-between px-2 mb-2">
            <span className="text-[11px] text-[#86b5a8]">Updated 17 Oct, 6:40 PM</span>
            <span className="inline-flex h-2 w-2 rounded-full bg-[#34d399]" title="Live online" />
          </div>
          <div className="flex items-center justify-between rounded-xl bg-white/5 p-2 text-xs">
            <div className="min-w-0 pr-2">
              <span className="block truncate font-bold text-white text-[12px]">
                {isAdmin ? 'Admin (You)' : 'A. Sharma (Owner)'}
              </span>
              <span className="block text-[10px] text-[#89b3a6]">
                {isAdmin ? 'Full control' : 'View only'}
              </span>
            </div>
            <button
              type="button"
              onClick={() => signOut()}
              className="grid h-7 w-7 place-items-center rounded-lg text-[#bad4cb] hover:bg-white/10 hover:text-white transition"
              title="Sign out"
            >
              <LogOut size={14} />
            </button>
          </div>
        </div>
      </aside>

      {/* ================= MOBILE BOTTOM NAVIGATION (PDF Page 1, 2, 3, 7, 15, 16) ================= */}
      <nav
        className="fixed inset-x-4 bottom-3 z-40 flex items-center justify-around gap-1 rounded-full border border-white/80 bg-white/95 px-2 py-1.5 shadow-[0_12px_36px_rgba(11,56,50,0.18)] backdrop-blur-md lg:hidden"
        aria-label="Mobile navigation"
      >
        <NavLink to="/" end className={mobileBottomLinkStyle}>
          <LayoutDashboard size={19} strokeWidth={2.2} />
          <span>Home</span>
        </NavLink>
        <NavLink to="/debtors" className={mobileBottomLinkStyle}>
          <Users size={19} strokeWidth={2.2} />
          <span>Debtors</span>
        </NavLink>
        <NavLink to="/sales" className={mobileBottomLinkStyle}>
          <BarChart3 size={19} strokeWidth={2.2} />
          <span>Sales</span>
        </NavLink>
        <NavLink to="/inventory" className={mobileBottomLinkStyle}>
          <Box size={19} strokeWidth={2.2} />
          <span>Stock</span>
        </NavLink>
        {isAdmin ? (
          <NavLink to="/control" className={mobileBottomLinkStyle}>
            <SlidersHorizontal size={19} strokeWidth={2.2} />
            <span>Control</span>
          </NavLink>
        ) : (
          <button
            type="button"
            onClick={() => setMobileMoreOpen(true)}
            className="flex flex-1 flex-col items-center justify-center py-1.5 px-2 rounded-2xl text-[10px] font-semibold text-[#58736a] hover:text-[#0b5f55]"
          >
            <span className="text-base leading-none font-bold">•••</span>
            <span className="mt-0.5">More</span>
          </button>
        )}
      </nav>

      {/* Mobile "More" Drawer / Modal for Owner view */}
      {mobileMoreOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-xs lg:hidden"
          onClick={() => setMobileMoreOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-t-3xl bg-white p-5 pb-8 shadow-2xl animate-in slide-in-from-bottom"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-4 h-1 w-12 rounded-full bg-[#d0ded6]" />
            <div className="flex items-center justify-between pb-3 border-b border-[#e5ece8]">
              <h3 className="text-sm font-bold text-[#143d35]">All Sections</h3>
              <button
                type="button"
                onClick={() => setMobileMoreOpen(false)}
                className="p-1 text-[#6c857d]"
              >
                <X size={18} />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-4">
              <NavLink
                to="/creditors"
                onClick={() => setMobileMoreOpen(false)}
                className="flex items-center gap-2.5 rounded-2xl border border-[#e1eae5] bg-[#f8faf8] p-3 text-xs font-bold text-[#1a443b] no-underline"
              >
                <CreditCard size={18} className="text-[#0d786d]" /> Creditors
              </NavLink>
              <NavLink
                to="/expenses"
                onClick={() => setMobileMoreOpen(false)}
                className="flex items-center gap-2.5 rounded-2xl border border-[#e1eae5] bg-[#f8faf8] p-3 text-xs font-bold text-[#1a443b] no-underline"
              >
                <MinusCircle size={18} className="text-[#b4622a]" /> Expenses
              </NavLink>
              <NavLink
                to="/loans"
                onClick={() => setMobileMoreOpen(false)}
                className="flex items-center gap-2.5 rounded-2xl border border-[#e1eae5] bg-[#f8faf8] p-3 text-xs font-bold text-[#1a443b] no-underline"
              >
                <Banknote size={18} className="text-[#0d786d]" /> Loans & Adv.
              </NavLink>
              <button
                type="button"
                onClick={() => {
                  setMobileMoreOpen(false)
                  setRole('admin')
                }}
                className="flex items-center gap-2.5 rounded-2xl border border-[#cae5db] bg-[#eef7f3] p-3 text-xs font-bold text-[#0c6b60] text-left"
              >
                <RotateCcw size={18} /> Switch to Admin
              </button>
            </div>

            <NavLink
              to="/tally"
              onClick={() => setMobileMoreOpen(false)}
              className="mt-3 w-full flex items-center justify-center gap-2 rounded-2xl bg-[#0e655d] text-white p-3 text-xs font-extrabold shadow-xs transition active:scale-98 no-underline"
            >
              <FileSpreadsheet size={16} strokeWidth={2.2} />
              <span>Tally XML Import</span>
            </NavLink>
            <div className="mt-4 pt-3 border-t border-[#e5ece8] flex items-center justify-between">
              <span className="text-[11px] text-[#6e847c]">Logged in as Owner</span>
              <button
                type="button"
                onClick={() => signOut()}
                className="flex items-center gap-1.5 text-xs font-bold text-[#ba3b2a]"
              >
                <LogOut size={14} /> Sign out
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Role Switcher Dialog when tapping avatar on mobile */}
      {roleModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs lg:hidden"
          onClick={() => setRoleModalOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-[#e3ebe6]">
              <h3 className="font-extrabold text-[16px] text-[#143d35]">Switch View Mode</h3>
              <button
                type="button"
                onClick={() => setRoleModalOpen(false)}
                className="p-1 text-[#6c857d]"
              >
                <X size={18} />
              </button>
            </div>
            <p className="mt-3 text-xs text-[#527067] leading-relaxed">
              Test how the screen appears to both the business Admin and the read-only Owner.
            </p>
            <div className="mt-4 space-y-2">
              <button
                type="button"
                onClick={() => {
                  setRole('admin')
                  setRoleModalOpen(false)
                }}
                className={`w-full flex items-center justify-between p-3.5 rounded-2xl border text-left font-bold text-xs transition ${
                  isAdmin
                    ? 'border-[#0c786d] bg-[#eef8f4] text-[#0c786d]'
                    : 'border-[#dde6e1] text-[#2c4e45]'
                }`}
              >
                <div>
                  <span className="block text-[13px]">Admin Console</span>
                  <span className="block text-[10px] font-normal text-[#6b857d]">
                    Full edit controls, Tally import, layout &amp; visibility toggles
                  </span>
                </div>
                {isAdmin && <span className="h-2 w-2 rounded-full bg-[#0c786d]" />}
              </button>
              <button
                type="button"
                onClick={() => {
                  setRole('owner')
                  setRoleModalOpen(false)
                }}
                className={`w-full flex items-center justify-between p-3.5 rounded-2xl border text-left font-bold text-xs transition ${
                  isOwner
                    ? 'border-[#0c786d] bg-[#eef8f4] text-[#0c786d]'
                    : 'border-[#dde6e1] text-[#2c4e45]'
                }`}
              >
                <div>
                  <span className="block text-[13px]">Owner Dashboard</span>
                  <span className="block text-[10px] font-normal text-[#6b857d]">
                    Clean executive view with WhatsApp reminders &amp; call actions
                  </span>
                </div>
                {isOwner && <span className="h-2 w-2 rounded-full bg-[#0c786d]" />}
              </button>
            </div>
            <button
              type="button"
              onClick={() => {
                setRoleModalOpen(false)
                signOut()
              }}
              className="mt-4 w-full py-2.5 rounded-xl border border-[#ebd7d4] text-xs font-bold text-[#ba3a2b] hover:bg-[#fff5f4]"
            >
              Sign out
            </button>
          </div>
        </div>
      )}
    </>
  )
}
