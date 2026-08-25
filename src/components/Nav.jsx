import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { 
  QrCode, 
  LayoutDashboard, 
  Boxes, 
  Printer, 
  LogOut, 
  UserPlus
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import AddUserModal from './AddUserModal'

export default function Nav() {
  const { isOwner, signOut, user } = useAuth()
  const [isAddUserOpen, setIsAddUserOpen] = useState(false)

  return (
    <>
      {/* Top Navigation Header */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200/80 shadow-xs px-4 sm:px-6 py-2.5 no-print">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
          {/* Logo & Brand */}
          <div className="flex items-center gap-2.5 shrink-0">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white shadow-sm">
              <QrCode className="w-4.5 h-4.5" />
            </div>
            <div>
              <span className="font-bold text-slate-900 text-base tracking-tight block leading-tight">
                Inventory Scan
              </span>
            </div>
          </div>

          {/* Desktop Nav Links */}
          <nav className="hidden md:flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200/80">
            <NavLink
              to="/scan"
              className={({ isActive }) =>
                `flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  isActive
                    ? 'bg-white text-blue-600 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
                }`
              }
            >
              <QrCode className="w-3.5 h-3.5" />
              <span>Scanner</span>
            </NavLink>

            {isOwner && (
              <>
                <NavLink
                  to="/dashboard"
                  className={({ isActive }) =>
                    `flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      isActive
                        ? 'bg-white text-blue-600 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
                    }`
                  }
                >
                  <LayoutDashboard className="w-3.5 h-3.5" />
                  <span>Dashboard</span>
                </NavLink>

                <NavLink
                  to="/materials"
                  className={({ isActive }) =>
                    `flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      isActive
                        ? 'bg-white text-blue-600 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
                    }`
                  }
                >
                  <Boxes className="w-3.5 h-3.5" />
                  <span>Materials</span>
                </NavLink>

                <NavLink
                  to="/labels"
                  className={({ isActive }) =>
                    `flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      isActive
                        ? 'bg-white text-blue-600 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
                    }`
                  }
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Labels</span>
                </NavLink>
              </>
            )}
          </nav>

          {/* Right Action Tools */}
          <div className="flex items-center gap-2">
            {isOwner && (
              <button
                type="button"
                onClick={() => setIsAddUserOpen(true)}
                className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 font-semibold text-xs rounded-lg border border-blue-200 transition-colors"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>Add User</span>
              </button>
            )}

            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${
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
              className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Bottom Navigation Bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 py-1.5 px-3 flex items-center justify-around shadow-lg no-print">
        <NavLink
          to="/scan"
          className={({ isActive }) =>
            `flex flex-col items-center justify-center gap-0.5 px-3 py-1 rounded-lg text-[11px] font-semibold transition-all flex-1 ${
              isActive ? 'text-blue-600 font-bold' : 'text-slate-500 hover:text-slate-700'
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
                `flex flex-col items-center justify-center gap-0.5 px-3 py-1 rounded-lg text-[11px] font-semibold transition-all flex-1 ${
                  isActive ? 'text-blue-600 font-bold' : 'text-slate-500 hover:text-slate-700'
                }`
              }
            >
              <LayoutDashboard className="w-5 h-5" />
              <span>Dashboard</span>
            </NavLink>

            <NavLink
              to="/materials"
              className={({ isActive }) =>
                `flex flex-col items-center justify-center gap-0.5 px-3 py-1 rounded-lg text-[11px] font-semibold transition-all flex-1 ${
                  isActive ? 'text-blue-600 font-bold' : 'text-slate-500 hover:text-slate-700'
                }`
              }
            >
              <Boxes className="w-5 h-5" />
              <span>Materials</span>
            </NavLink>

            <NavLink
              to="/labels"
              className={({ isActive }) =>
                `flex flex-col items-center justify-center gap-0.5 px-3 py-1 rounded-lg text-[11px] font-semibold transition-all flex-1 ${
                  isActive ? 'text-blue-600 font-bold' : 'text-slate-500 hover:text-slate-700'
                }`
              }
            >
              <Printer className="w-5 h-5" />
              <span>Labels</span>
            </NavLink>
          </>
        )}
      </nav>

      {/* Global Add User Modal */}
      <AddUserModal
        isOpen={isAddUserOpen}
        onClose={() => setIsAddUserOpen(false)}
      />
    </>
  )
}
