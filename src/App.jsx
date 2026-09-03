import { Suspense, lazy } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { SpeedInsights } from '@vercel/speed-insights/react'
import { AuthProvider, useAuth } from './context/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import QueueAutoSync from './components/QueueAutoSync'
import Login from './pages/Login'

// Route-level code splitting: the scan screen (needed by every user, every
// visit) loads immediately. The heavier owner-only screens — charts, the
// materials CRUD form, QR generation — only load if that route is hit.
const ScanPage = lazy(() => import('./pages/ScanPage'))
const OwnerDashboard = lazy(() => import('./pages/OwnerDashboard'))
const MaterialsPage = lazy(() => import('./pages/MaterialsPage'))
const LabelsPage = lazy(() => import('./pages/LabelsPage'))
const HistoryPage = lazy(() => import('./pages/HistoryPage'))

function HomeRedirect() {
  const { isOwner, loading } = useAuth()
  if (loading) return <div className="centered">Loading...</div>
  return <Navigate to={isOwner ? '/dashboard' : '/scan'} replace />
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <QueueAutoSync />
        <Suspense fallback={<div className="centered">Loading...</div>}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <HomeRedirect />
                </ProtectedRoute>
              }
            />
            <Route
              path="/scan"
              element={
                <ProtectedRoute>
                  <ScanPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/history"
              element={
                <ProtectedRoute>
                  <HistoryPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute requireRole="owner">
                  <OwnerDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/materials"
              element={
                <ProtectedRoute requireRole="owner">
                  <MaterialsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/labels"
              element={
                <ProtectedRoute requireRole="owner">
                  <LabelsPage />
                </ProtectedRoute>
              }
            />
          </Routes>
        </Suspense>
        <SpeedInsights />
      </AuthProvider>
    </BrowserRouter>
  )
}
