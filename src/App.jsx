import { Suspense, lazy } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { UIProvider } from './context/UIContext'
import ProtectedRoute from './components/ProtectedRoute'
import Layout from './components/Layout'
import Login from './pages/Login'

// Route-level code splitting
const DashboardPage = lazy(() => import('./pages/DashboardPage'))
const DayBookPage = lazy(() => import('./pages/DayBookPage'))
const SalesPage = lazy(() => import('./pages/SalesPage'))
const MaterialsPage = lazy(() => import('./pages/MaterialsPage'))
const PartiesPage = lazy(() => import('./pages/PartiesPage'))
const BankingPage = lazy(() => import('./pages/BankingPage'))
const TallyIntegrationPage = lazy(() => import('./pages/TallyIntegrationPage'))

function PageLoader() {
  return (
    <div className="min-h-[60vh] bg-slate-50 flex items-center justify-center text-slate-900">
      <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <UIProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route
              element={
                <ProtectedRoute>
                  <Layout />
                </ProtectedRoute>
              }
            >
              {['/', '/dashboard'].map((path) => (
                <Route key={path} path={path} element={<Suspense fallback={<PageLoader />}><DashboardPage /></Suspense>} />
              ))}
              <Route path="/daybook" element={<Suspense fallback={<PageLoader />}><DayBookPage /></Suspense>} />
              <Route path="/sales" element={<Suspense fallback={<PageLoader />}><SalesPage /></Suspense>} />
              <Route path="/materials" element={<Suspense fallback={<PageLoader />}><MaterialsPage /></Suspense>} />
              <Route path="/parties" element={<Suspense fallback={<PageLoader />}><PartiesPage /></Suspense>} />
              <Route path="/banking" element={<Suspense fallback={<PageLoader />}><BankingPage /></Suspense>} />
              <Route path="/tally" element={<Suspense fallback={<PageLoader />}><TallyIntegrationPage /></Suspense>} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </UIProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
