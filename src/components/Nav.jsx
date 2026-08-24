import { NavLink } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function Nav() {
  const { isOwner, signOut, user } = useAuth()

  return (
    <>
      {/* Top Header */}
      <header className="app-header no-print">
        <div className="header-brand">
          <div className="brand-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7" rx="1.5" />
              <rect x="14" y="3" width="7" height="7" rx="1.5" />
              <rect x="14" y="14" width="7" height="7" rx="1.5" />
              <rect x="3" y="14" width="7" height="7" rx="1.5" />
            </svg>
          </div>
          <span>Inventory Scan</span>
        </div>

        {/* Desktop Navigation Links */}
        <nav className="desktop-nav-links">
          <NavLink to="/scan" className={({ isActive }) => (isActive ? 'active' : '')}>
            Scan
          </NavLink>
          {isOwner && (
            <>
              <NavLink to="/dashboard" className={({ isActive }) => (isActive ? 'active' : '')}>
                Dashboard
              </NavLink>
              <NavLink to="/materials" className={({ isActive }) => (isActive ? 'active' : '')}>
                Materials
              </NavLink>
              <NavLink to="/labels" className={({ isActive }) => (isActive ? 'active' : '')}>
                Labels
              </NavLink>
            </>
          )}
        </nav>

        <div className="header-right">
          <span className={`user-badge ${isOwner ? 'owner' : 'employee'}`}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: isOwner ? '#2563eb' : '#10b981' }} />
            {isOwner ? 'Owner' : 'Employee'}
          </span>
          <button 
            type="button" 
            className="btn-ghost" 
            onClick={signOut} 
            title="Sign out"
            style={{ padding: '6px 10px', fontSize: '0.825rem' }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            <span className="desktop-nav-links">Sign out</span>
          </button>
        </div>
      </header>

      {/* Mobile Bottom Navigation Bar */}
      <nav className="bottom-nav no-print">
        <NavLink to="/scan" className={({ isActive }) => `bottom-nav-item ${isActive ? 'active' : ''}`}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 7V5a2 2 0 0 1 2-2h2" />
            <path d="M17 3h2a2 2 0 0 1 2 2v2" />
            <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
            <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
            <rect x="7" y="7" width="10" height="10" rx="1" />
          </svg>
          <span>Scan</span>
        </NavLink>

        {isOwner && (
          <>
            <NavLink to="/dashboard" className={({ isActive }) => `bottom-nav-item ${isActive ? 'active' : ''}`}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <path d="M3 9h18" />
                <path d="M9 21V9" />
              </svg>
              <span>Dashboard</span>
            </NavLink>

            <NavLink to="/materials" className={({ isActive }) => `bottom-nav-item ${isActive ? 'active' : ''}`}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                <line x1="12" y1="22.08" x2="12" y2="12" />
              </svg>
              <span>Materials</span>
            </NavLink>

            <NavLink to="/labels" className={({ isActive }) => `bottom-nav-item ${isActive ? 'active' : ''}`}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 6 2 18 2 18 9" />
                <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                <rect x="6" y="14" width="12" height="8" />
              </svg>
              <span>Labels</span>
            </NavLink>
          </>
        )}
      </nav>
    </>
  )
}
