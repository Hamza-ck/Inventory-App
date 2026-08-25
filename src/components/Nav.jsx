import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  QrCode, 
  LayoutDashboard, 
  Boxes, 
  Printer, 
  LogOut, 
  ShieldCheck, 
  User, 
  Menu, 
  X,
  UserPlus
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import AddUserModal from './AddUserModal'

export default function Nav() {
  const { isOwner, signOut, user } = useAuth()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [isAddUserOpen, setIsAddUserOpen] = useState(false)

  return (
    <>
      {/* Top Header */}
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-slate-200/80 shadow-xs px-4 sm:px-6 py-3 no-print">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          {/* Logo & Brand */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-blue-600/20">
              <QrCode className="w-5 h-5" />
            </div>
            <div>
              <span className="font-extrabold text-slate-900 text-base sm:text-lg tracking-tight block leading-tight">
                Inventory Scan
              </span>
              <span className="text-[10px] font-semibold text-slate-400 block tracking-wider uppercase">
                Stock & Logistics
              </span>
            </div>
          </div>

          {/* Desktop Navigation Links */}
          <nav className="hidden md:flex items-center gap-1.5 bg-slate-100/80 p-1 rounded-xl border border-slate-200/60">
            <NavLink
              to="/scan"
              className={({ isActive }) =>
                `flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  isActive
                    ? 'bg-white text-blue-600 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
                }`
              }
            >
              <QrCode className="w-4 h-4" />
              <span>Scanner</span>
            </NavLink>

            {isOwner && (
              <>
                <NavLink
                  to="/dashboard"
                  className={({ isActive }) =>
                    `flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      isActive
                        ? 'bg-white text-blue-600 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
                    }`
                  }
                >
                  <LayoutDashboard className="w-4 h-4" />
                  <span>Dashboard</span>
                </NavLink>

                <NavLink
                  to="/materials"
                  className={({ isActive }) =>
                    `flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      isActive
                        ? 'bg-white text-blue-600 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
                    }`
                  }
                >
                  <Boxes className="w-4 h-4" />
                  <span>Materials</span>
                </NavLink>

                <NavLink
                  to="/labels"
                  className={({ isActive }) =>
                    `flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      isActive
                        ? 'bg-white text-blue-600 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
                    }`
                  }
                >
                  <Printer className="w-4 h-4" />
                  <span>Labels</span>
                </NavLink>
              </>
            )}
          </nav>

          {/* Right Area: Role Badge & Action Buttons */}
          <div className="flex items-center gap-2.5">
            {isOwner && (
              <button
                type="button"
                onClick={() => setIsAddUserOpen(true)}
                className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-xs rounded-xl border border-blue-200 transition-colors"
                title="Add New User"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>Add User</span>
              </button>
            )}

            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border ${
                isOwner
                  ? 'bg-blue-50 text-blue-700 border-blue-200'
                  : 'bg-emerald-50 text-emerald-700 border-emerald-200'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  isOwner ? 'bg-blue-600' : 'bg-emerald-600'
                }`}
              />
              {isOwner ? 'Owner' : 'Employee'}
            </span>

            <button
              type="button"
              onClick={signOut}
              title="Sign out"
              className="p-2 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Bottom Navigation Bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-lg border-t border-slate-200/90 py-2 px-3 flex items-center justify-around shadow-2xl no-print">
        <NavLink
          to="/scan"
          className={({ isActive }) =>
            `flex flex-col items-center justify-center gap-1 px-3 py-1 rounded-xl text-[11px] font-bold transition-all flex-1 ${
              isActive ? 'text-blue-600 scale-105' : 'text-slate-400 hover:text-slate-600'
            }`
          }
        >
          <QrCode className="w-5 h-5" />
          <span>Scan</span>
        </NavLink>

        {isOwner && (
          <>
            <NavLink
              to="/dashboard"
              className={({ isActive }) =>
                `flex flex-col items-center justify-center gap-1 px-3 py-1 rounded-xl text-[11px] font-bold transition-all flex-1 ${
                  isActive ? 'text-blue-600 scale-105' : 'text-slate-400 hover:text-slate-600'
                }`
              }
            >
              <LayoutDashboard className="w-5 h-5" />
              <span>Dashboard</span>
            </NavLink>

            <NavLink
              to="/materials"
              className={({ isActive }) =>
                `flex flex-col items-center justify-center gap-1 px-3 py-1 rounded-xl text-[11px] font-bold transition-all flex-1 ${
                  isActive ? 'text-blue-600 scale-105' : 'text-slate-400 hover:text-slate-600'
                }`
              }
            >
              <Boxes className="w-5 h-5" />
              <span>Materials</span>
            </NavLink>

            <NavLink
              to="/labels"
              className={({ isActive }) =>
                `flex flex-col items-center justify-center gap-1 px-3 py-1 rounded-xl text-[11px] font-bold transition-all flex-1 ${
                  isActive ? 'text-blue-600 scale-105' : 'text-slate-400 hover:text-slate-600'
                }`
              }
            >
              <Printer className="w-5 h-5" />
              <span>Labels</span>
            </NavLink>
          </>
        )}
      </nav>

      {/* Global Add User Modal for Owner */}
      <AddUserModal
        isOpen={isAddUserOpen}
        onClose={() => setIsAddUserOpen(false)}
      />
    </>
  )
}
