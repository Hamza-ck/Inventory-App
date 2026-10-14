import { Suspense, lazy } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import Login from './pages/Login'
import CompanySetupPage from './pages/CompanySetupPage'

// Route-level code splitting
const DashboardPage = lazy(() => import('./pages/DashboardPage'))
const DayBookPage = lazy(() => import('./pages/DayBookPage'))
const SalesPage = lazy(() => import('./pages/SalesPage'))
const MaterialsPage = lazy(() => import('./pages/MaterialsPage'))
const PartiesPage = lazy(() => import('./pages/PartiesPage'))
const BankingPage = lazy(() => import('./pages/BankingPage'))
const TallyIntegrationPage = lazy(() => import('./pages/TallyIntegrationPage'))

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Suspense
          fallback={
            <div className="min-h-screen bg-slate-950 flex items-center justify-center text-white">
              <div className="flex items-center gap-3">
                <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                <span className="text-sm font-semibold text-slate-300">Loading MEEMX ERP..</span>
              </div>
            </div>
          }
        >
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/setup-company" element={<CompanySetupPage />} />
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <DashboardPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <DashboardPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/daybook"
              element={
                <ProtectedRoute>
                  <DayBookPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/sales"
              element={
                <ProtectedRoute>
                  <SalesPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/materials"
              element={
                <ProtectedRoute>
                  <MaterialsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/parties"
              element={
                <ProtectedRoute>
                  <PartiesPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/banking"
              element={
                <ProtectedRoute>
                  <BankingPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/tally"
              element={
                <ProtectedRoute>
                  <TallyIntegrationPage />
                </ProtectedRoute>
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </AuthProvider>
    </BrowserRouter>
  )
}
