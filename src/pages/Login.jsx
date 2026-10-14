import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Mail, Lock, Eye, EyeOff, Building2, LogIn, AlertCircle, ShieldCheck, ShieldAlert, Sparkles } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const { setRole } = useAuth()

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      })
      if (error) {
        setError(error.message)
      } else {
        navigate('/')
      }
    } catch {
      setError('Unable to sign in right now. Check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }

  async function handleDemoLogin(selectedRole) {
    setError(null)
    try {
      await setRole(selectedRole)
      navigate('/')
    } catch {
      setError('Could not initialize local demo data. Please reload and try again.')
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 relative overflow-hidden font-sans">
      {/* Ambient background glows */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-600/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-indigo-600/15 rounded-full blur-3xl pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="w-full max-w-md bg-slate-900 rounded-3xl p-7 sm:p-9 shadow-2xl border border-slate-800 z-10"
      >
        {/* Brand Header */}
        <div className="text-center mb-7">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-teal-500 flex items-center justify-center text-white mx-auto mb-3.5 shadow-lg shadow-blue-600/30">
            <Building2 className="w-7 h-7" />
          </div>
          <h1 className="text-2xl font-black text-white tracking-tight">TallyFlow SaaS</h1>
          <p className="text-xs text-slate-400 mt-1">Complete Accounting Solutions &amp; Tally Engine</p>
        </div>

        {/* Demo Fast Access Buttons are intentionally development-only. */}
        {import.meta.env.DEV && (
        <div className="mb-6 p-3.5 bg-slate-800/80 rounded-2xl border border-slate-700 space-y-2">
          <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-300">
            <Sparkles className="w-3.5 h-3.5 text-blue-400" />
            <span>Instant Demo Access (No password needed)</span>
          </div>
          <p className="text-[11px] leading-relaxed text-amber-200/90">
            Demo mode uses this browser’s local records and is not isolated from a real account. Do not enter real business or customer data in demo mode.
          </p>
          <p className="text-[11px] leading-relaxed text-amber-200/90">
            Demo mode uses this browser’s local records and is not isolated from a real account. Do not enter real business or customer data in demo mode.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => handleDemoLogin('admin')}
              className="py-2.5 px-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-xs transition-colors flex items-center justify-center gap-1.5"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Admin (Full Entry)</span>
            </button>
            <button
              type="button"
              onClick={() => handleDemoLogin('owner')}
              className="py-2.5 px-3 rounded-xl bg-slate-700 hover:bg-slate-600 text-amber-300 font-bold text-xs border border-amber-500/30 transition-colors flex items-center justify-center gap-1.5"
            >
              <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
              <span>Owner (Track Only)</span>
            </button>
          </div>
        </div>
        )}

        <div className="relative flex py-2 items-center mb-4">
          <div className="flex-grow border-t border-slate-800"></div>
          <span className="flex-shrink mx-3 text-slate-500 text-[11px] uppercase font-semibold">Or Sign In with Email</span>
          <div className="flex-grow border-t border-slate-800"></div>
        </div>

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1.5">Work Email</label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="email"
                placeholder="admin@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="w-full pl-10 pr-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-sm font-medium text-white placeholder:text-slate-500 focus:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1.5">Password</label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="w-full pl-10 pr-10 py-3 bg-slate-800 border border-slate-700 rounded-xl text-sm font-medium text-white placeholder:text-slate-500 focus:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 p-1"
                title={showPassword ? 'Hide Password' : 'Show Password'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {error && (
            <div className="p-3 bg-rose-950/70 border border-rose-800 text-rose-300 rounded-xl text-xs font-medium flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold text-sm rounded-xl shadow-lg shadow-blue-600/30 active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Signing in...</span>
              </>
            ) : (
              <>
                <LogIn className="w-4 h-4" />
                <span>Sign In to Accounting</span>
              </>
            )}
          </button>
        </form>
      </motion.div>
    </div>
  )
}
