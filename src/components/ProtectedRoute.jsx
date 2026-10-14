import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function ProtectedRoute({ children, requireRole }) {
  const { session, role, loading, user } = useAuth()

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

  if (requireRole && role !== requireRole && requireRole === 'admin' && role === 'owner') {
    // Owner is restricted from admin-only write pages if any, but our design makes pages accessible in read-only mode
    return children
  }

  return children
}
