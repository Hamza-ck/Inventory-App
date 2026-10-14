import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { 
  LayoutDashboard, 
  Receipt, 
  BookOpen, 
  Boxes, 
  Users, 
  Landmark, 
  FileSpreadsheet, 
  PlusCircle, 
  LogOut, 
  ShieldAlert, 
  ShieldCheck, 
  Menu, 
  X,
  CreditCard,
  Building2,
  TrendingUp,
  Sparkles
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import VoucherModal from './VoucherModal'

export default function Nav() {
  const { role, setRole, isAdmin, isOwner, signOut, user } = useAuth()
  const [isVoucherModalOpen, setIsVoucherModalOpen] = useState(false)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

  const navItems = [
    { to: '/', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/daybook', label: 'Day Book', icon: BookOpen },
    { to: '/sales', label: 'Sales & Invoices', icon: Receipt },
    { to: '/materials', label: 'Inventory', icon: Boxes },
    { to: '/parties', label: 'Debtors & Creditors', icon: Users },
    { to: '/banking', label: 'Cash & Loans', icon: Landmark },
    { to: '/tally', label: 'Tally Import/Export', icon: FileSpreadsheet },
  ]

  function toggleRole() {
    const nextRole = role === 'admin' ? 'owner' : 'admin'
    setRole(nextRole)
  }

  return (
    <>
      <header className="sticky top-0 z-40 bg-slate-900 border-b border-slate-800 text-white shadow-md no-print">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          {/* Brand Logo & Name */}
          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="lg:hidden p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
              aria-label="Toggle menu"
            >
              {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>

            <NavLink to="/" className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-teal-500 flex items-center justify-center text-white shadow-lg shadow-blue-500/25">
                <Building2 className="w-5 h-5" />
              </div>
              <div>
                <span className="font-black text-base tracking-tight leading-tight block text-white">
                  TallyFlow <span className="text-blue-400 font-medium text-xs">SaaS</span>
                </span>
                <span className="text-[10px] text-slate-400 tracking-wider uppercase font-semibold block leading-none">
                  Accounting Cloud
                </span>
              </div>
            </NavLink>
          </div>

          {/* Desktop Nav Items */}
          <nav className="hidden lg:flex items-center gap-1">
            {navItems.map((item) => {
              const Icon = item.icon
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    `flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      isActive
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
                    }`
                  }
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{item.label}</span>
                </NavLink>
              )
            })}
          </nav>

          {/* Right Action Tools: + New Voucher, Role Switcher, Sign Out */}
          <div className="flex items-center gap-2.5">
            {/* Quick Voucher Button (Admin only) */}
            {isAdmin ? (
              <button
                type="button"
                onClick={() => setIsVoucherModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-bold text-xs rounded-xl shadow-xs shadow-emerald-500/20 active:scale-95 transition-all"
                title="Create Tally Voucher (F8 Sales, F9 Purchase, F6 Receipt, F5 Payment, F4 Contra)"
              >
                <PlusCircle className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">New Voucher</span>
                <span className="sm:hidden">Entry</span>
              </button>
            ) : (
              <span className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1 bg-amber-500/10 border border-amber-500/30 text-amber-300 rounded-lg text-[11px] font-semibold">
                <ShieldAlert className="w-3.5 h-3.5" />
                <span>Read & Track Only</span>
              </span>
            )}

            {/* Role Switcher Pill */}
            <button
              type="button"
              onClick={toggleRole}
              title={`Click to switch role (Current: ${role.toUpperCase()})`}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border transition-all cursor-pointer ${
                isAdmin
                  ? 'bg-blue-500/20 text-blue-300 border-blue-500/40 hover:bg-blue-500/30'
                  : 'bg-amber-500/20 text-amber-300 border-amber-500/40 hover:bg-amber-500/30'
              }`}
            >
              {isAdmin ? (
                <>
                  <ShieldCheck className="w-3.5 h-3.5 text-blue-400" />
                  <span>Admin (Data Entry)</span>
                </>
              ) : (
                <>
                  <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
                  <span>Owner (Track Only)</span>
                </>
              )}
            </button>

            {/* Sign Out */}
            <button
              type="button"
              onClick={signOut}
              title="Sign out"
              className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Mobile Dropdown Menu */}
        {isMobileMenuOpen && (
          <div className="lg:hidden border-t border-slate-800 bg-slate-900 px-4 py-3 space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                      isActive
                        ? 'bg-blue-600 text-white'
                        : 'text-slate-300 hover:bg-slate-800'
                    }`
                  }
                >
                  <Icon className="w-4 h-4" />
                  <span>{item.label}</span>
                </NavLink>
              )
            })}
          </div>
        )}
      </header>

      {/* Mobile Bottom Navigation Bar */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-slate-900/95 backdrop-blur-md border-t border-slate-800 py-1 px-2 flex items-center justify-around shadow-2xl no-print">
        <NavLink
          to="/"
          className={({ isActive }) =>
            `flex flex-col items-center justify-center py-1 px-2 text-[10px] font-semibold flex-1 ${
              isActive ? 'text-blue-400 font-bold' : 'text-slate-400 hover:text-slate-200'
            }`
          }
        >
          <LayoutDashboard className="w-4 h-4 mb-0.5" />
          <span>Dashboard</span>
        </NavLink>

        <NavLink
          to="/daybook"
          className={({ isActive }) =>
            `flex flex-col items-center justify-center py-1 px-2 text-[10px] font-semibold flex-1 ${
              isActive ? 'text-blue-400 font-bold' : 'text-slate-400 hover:text-slate-200'
            }`
          }
        >
          <BookOpen className="w-4 h-4 mb-0.5" />
          <span>Day Book</span>
        </NavLink>

        {isAdmin && (
          <button
            type="button"
            onClick={() => setIsVoucherModalOpen(true)}
            className="flex flex-col items-center justify-center -mt-4 bg-gradient-to-tr from-emerald-500 to-teal-600 text-white w-10 h-10 rounded-full shadow-lg shadow-emerald-600/40"
          >
            <PlusCircle className="w-5 h-5" />
          </button>
        )}

        <NavLink
          to="/sales"
          className={({ isActive }) =>
            `flex flex-col items-center justify-center py-1 px-2 text-[10px] font-semibold flex-1 ${
              isActive ? 'text-blue-400 font-bold' : 'text-slate-400 hover:text-slate-200'
            }`
          }
        >
          <Receipt className="w-4 h-4 mb-0.5" />
          <span>Sales</span>
        </NavLink>

        <NavLink
          to="/materials"
          className={({ isActive }) =>
            `flex flex-col items-center justify-center py-1 px-2 text-[10px] font-semibold flex-1 ${
              isActive ? 'text-blue-400 font-bold' : 'text-slate-400 hover:text-slate-200'
            }`
          }
        >
          <Boxes className="w-4 h-4 mb-0.5" />
          <span>Inventory</span>
        </NavLink>
      </nav>

      {/* Global Quick Voucher Modal */}
      <VoucherModal
        isOpen={isVoucherModalOpen}
        onClose={() => setIsVoucherModalOpen(false)}
        onSuccess={() => {
          // Trigger refresh event across pages
          window.dispatchEvent(new Event('accounting-data-updated'))
        }}
      />
    </>
  )
}
