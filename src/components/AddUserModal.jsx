import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { UserPlus, X, Mail, Lock, User, CheckCircle2, AlertCircle, Eye, EyeOff } from 'lucide-react'
import { createClient } from '@supabase/supabase-js'
import { supabase } from '../lib/supabaseClient'

export default function AddUserModal({ isOpen, onClose, onUserAdded }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [role, setRole] = useState('employee') // 'employee' | 'owner'
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)

  // Isolated client instance with persistSession: false so it never touches the owner's active session
  const isolatedClient = useMemo(() => {
    const rawUrl = import.meta.env.VITE_SUPABASE_URL || ''
    const supabaseUrl = rawUrl.replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '')
    const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
    return createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    })
  }, [])

  if (!isOpen) return null

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setSuccess(null)
    setLoading(true)

    const cleanEmail = email.trim()
    const cleanName = fullName.trim()

    try {
      let createdViaEdgeFunction = false

      // 1. Try Edge Function first if deployed
      try {
        const { data: edgeData, error: edgeError } = await supabase.functions.invoke('create-user', {
          body: {
            email: cleanEmail,
            password,
            fullName: cleanName,
            role,
          },
        })

        if (!edgeError && edgeData && !edgeData.error) {
          createdViaEdgeFunction = true
        }
      } catch {
        // Edge function not deployed or endpoint unreachable; proceed to isolated client fallback
      }

      // 2. Fallback to isolated client signup (zero risk of owner logout)
      if (!createdViaEdgeFunction) {
        const { data: signUpData, error: signUpError } = await isolatedClient.auth.signUp({
          email: cleanEmail,
          password: password,
          options: {
            data: {
              full_name: cleanName || cleanEmail.split('@')[0],
              role: role,
            },
          },
        })

        if (signUpError) {
          throw new Error(signUpError.message)
        }

        const newUserId = signUpData?.user?.id
        if (newUserId) {
          try {
            // Upsert profile with owner's authenticated client
            await supabase.from('profiles').upsert({
              id: newUserId,
              role: role,
              full_name: cleanName || cleanEmail.split('@')[0],
            })
          } catch {
            // Trigger in schema will auto-populate profile from raw_user_meta_data
          }
        }
      }

      setSuccess(`User "${cleanEmail}" created successfully with role "${role === 'owner' ? 'Owner / Admin' : 'Employee'}"!`)
      setEmail('')
      setPassword('')
      setFullName('')
      setRole('employee')
      if (onUserAdded) onUserAdded()
    } catch (err) {
      let msg = err.message || 'Failed to create user account. Please check credentials and try again.'
      if (msg.toLowerCase().includes('rate limit') || msg.toLowerCase().includes('security purposes')) {
        msg = msg.replace('For security purposes, you can only request this', 'Please wait')
      }
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="bg-white rounded-3xl p-6 sm:p-7 w-full max-w-lg shadow-2xl border border-slate-200"
      >
        <div className="flex items-start justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-100">
              <UserPlus className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">Add New Team Member</h3>
              <p className="text-xs text-slate-500">Create access credentials for an employee or manager</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">Full Name</label>
            <div className="relative">
              <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="e.g. Kamran"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">Email Address *</label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="email"
                placeholder="name@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">Temporary Password *</label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="Minimum 6 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="w-full pl-10 pr-10 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">System Role *</label>
            <div className="grid grid-cols-2 gap-3">
              <label
                className={`flex items-center gap-2.5 p-3 rounded-xl border cursor-pointer transition-all ${
                  role === 'employee'
                    ? 'bg-emerald-50 border-emerald-300 ring-2 ring-emerald-500/20 text-emerald-900 font-semibold'
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
              >
                <input
                  type="radio"
                  name="role"
                  value="employee"
                  checked={role === 'employee'}
                  onChange={() => setRole('employee')}
                  className="w-4 h-4 text-emerald-600"
                />
                <div className="text-xs">
                  <div className="font-bold">Employee</div>
                  <div className="text-[11px] text-slate-500">Scan & queue only</div>
                </div>
              </label>

              <label
                className={`flex items-center gap-2.5 p-3 rounded-xl border cursor-pointer transition-all ${
                  role === 'owner'
                    ? 'bg-blue-50 border-blue-300 ring-2 ring-blue-500/20 text-blue-900 font-semibold'
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
              >
                <input
                  type="radio"
                  name="role"
                  value="owner"
                  checked={role === 'owner'}
                  onChange={() => setRole('owner')}
                  className="w-4 h-4 text-blue-600"
                />
                <div className="text-xs">
                  <div className="font-bold">Owner / Admin</div>
                  <div className="text-[11px] text-slate-500">Full dashboard & CRUD</div>
                </div>
              </label>
            </div>
          </div>

          {/* Error & Success Feedback */}
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs font-medium flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-medium flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{success}</span>
            </div>
          )}

          <div className="flex gap-2.5 pt-2">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm rounded-xl shadow-md shadow-blue-600/30 active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Creating User...</span>
                </>
              ) : (
                <>
                  <UserPlus className="w-4 h-4" />
                  <span>Create User Account</span>
                </>
              )}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-sm rounded-xl transition-colors"
            >
              Close
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  )
}
