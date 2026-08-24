import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

// requireRole: 'owner' | undefined (undefined = any logged-in user)
export default function ProtectedRoute({ children, requireRole }) {
  const { session, role, loading } = useAuth()

  if (loading) return <div className="centered">Loading...</div>
  if (!session) return <Navigate to="/login" replace />
  if (requireRole && role !== requireRole) return <Navigate to="/" replace />

  return children
}
