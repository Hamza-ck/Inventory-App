import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function ProtectedRoute({ children, requireRole }) {
  const { session, role, loading, user, companyId, isDemoMode } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900 text-white font-medium">
        <div className="flex items-center gap-3">
          <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <span>Loading TallyFlow SaaS...</span>
        </div>
      </div>
    )
  }

  // If user object exists (authenticated or local demo profile), permit access
  if (!user && !session) {
    return <Navigate to="/login" replace />
  }

  // Authenticated users must select or create a company before opening accounting pages.
  if (session && !companyId && !isDemoMode) {
    return <Navigate to="/setup-company" replace />
  }

  if (requireRole && role !== requireRole && requireRole === 'admin' && role !== 'admin') {
    return <Navigate to="/" replace />
  }

  return children
}
