import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function ProtectedRoute({ children }) {
  const { session, user, loading } = useAuth()
  if (loading) return <div className="flex min-h-screen items-center justify-center gap-3 bg-[#f4f7f4] text-[#38534d]"><span className="h-2 w-2 animate-pulse rounded-full bg-[#0c8175]" />Loading TallyFlow…</div>
  if (!user && !session) return <Navigate to="/login" replace />
  return children
}
