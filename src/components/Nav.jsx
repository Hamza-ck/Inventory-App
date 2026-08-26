import { useState, useEffect } from 'react'
import { NavLink } from 'react-router-dom'
import { 
  QrCode, 
  LayoutDashboard, 
  Boxes, 
  Printer, 
  LogOut, 
  UserPlus,
  Search,
  FileText,
  Megaphone
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabaseClient'
import AddUserModal from './AddUserModal'
import AdvanceSearchModal from './AdvanceSearchModal'
import ProductReportModal from './ProductReportModal'

export default function Nav() {
  const { isOwner, signOut, user } = useAuth()
  const [isAddUserOpen, setIsAddUserOpen] = useState(false)
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [isReportOpen, setIsReportOpen] = useState(false)
  const [reportProduct, setReportProduct] = useState('')
  const [materials, setMaterials] = useState([])

  // Load materials cache for global search and reports
  useEffect(() => {
    async function loadMaterials() {
      const { data } = await supabase.from('materials').select('*').order('name')
      if (data) setMaterials(data)
    }
    loadMaterials()
  }, [])

  // Keyboard shortcut Ctrl+K or / to open search
  useEffect(() => {
    function handleKeyDown(e) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        setIsSearchOpen((prev) => !prev)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  function handleOpenReportForProduct(productName) {
    setReportProduct(productName || '')
    setIsReportOpen(true)
  }

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

          {/* Desktop Nav Links & Global Search */}
          <nav className="hidden md:flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200/80">
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

            {/* Advance Search Trigger Button (For BOTH Employee & Owner) */}
            <button
              type="button"
              onClick={() => setIsSearchOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-700 hover:text-blue-600 hover:bg-white transition-all ml-1"
              title="Advance Search (Ctrl+K)"
            >
              <Search className="w-3.5 h-3.5 text-blue-600" />
              <span>Advance Search</span>
              <kbd className="hidden lg:inline-block font-mono text-[10px] bg-slate-200 text-slate-500 px-1.5 py-0.2 rounded">
                ⌘K
              </kbd>
            </button>
          </nav>

          {/* Right Action Tools */}
          <div className="flex items-center gap-2">
            {/* Quick Available Stock Report Tool for Owner */}
            {isOwner && (
              <button
                type="button"
                onClick={() => handleOpenReportForProduct('')}
                className="hidden lg:inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-900 font-bold text-xs rounded-lg border border-amber-200 shadow-xs transition-colors"
                title="Generate Marketing Available Stock Report (PDF / Copy)"
              >
                <Megaphone className="w-3.5 h-3.5 text-amber-600" />
                <span>Stock Report</span>
              </button>
            )}

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

      {/* Mobile Bottom Navigation Bar (Including Search for Employee & Owner) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 py-1.5 px-3 flex items-center justify-around shadow-lg no-print">
        <NavLink
          to="/scan"
          className={({ isActive }) =>
            `flex flex-col items-center justify-center gap-0.5 px-2 py-1 rounded-lg text-[11px] font-semibold transition-all flex-1 ${
              isActive ? 'text-blue-600 font-bold' : 'text-slate-500 hover:text-slate-700'
            }`
          }
        >
          <QrCode className="w-5 h-5" />
          <span>Scan</span>
        </NavLink>

        {/* Mobile Search Button (Available for Employee & Owner) */}
        <button
          type="button"
          onClick={() => setIsSearchOpen(true)}
          className="flex flex-col items-center justify-center gap-0.5 px-2 py-1 rounded-lg text-[11px] font-semibold text-slate-500 hover:text-blue-600 transition-all flex-1"
        >
          <Search className="w-5 h-5" />
          <span>Search</span>
        </button>

        {isOwner && (
          <>
            <NavLink
              to="/dashboard"
              className={({ isActive }) =>
                `flex flex-col items-center justify-center gap-0.5 px-2 py-1 rounded-lg text-[11px] font-semibold transition-all flex-1 ${
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
                `flex flex-col items-center justify-center gap-0.5 px-2 py-1 rounded-lg text-[11px] font-semibold transition-all flex-1 ${
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
                `flex flex-col items-center justify-center gap-0.5 px-2 py-1 rounded-lg text-[11px] font-semibold transition-all flex-1 ${
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

      {/* Advance Search Modal (Available for Employee & Owner) */}
      <AdvanceSearchModal
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        materials={materials}
        onSelectProductForReport={(pName) => handleOpenReportForProduct(pName)}
      />

      {/* Product Report Modal */}
      <ProductReportModal
        isOpen={isReportOpen}
        onClose={() => setIsReportOpen(false)}
        materials={materials}
        initialProductName={reportProduct}
      />
    </>
  )
}
