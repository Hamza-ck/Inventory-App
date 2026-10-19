import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Building2, CircleAlert, Eye, EyeOff, LockKeyhole, Mail, ShieldCheck } from 'lucide-react'
import { supabase, supabaseConfigured } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const { isDemo } = useAuth()

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    if (!supabaseConfigured) {
      setError('Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY before signing in.')
      return
    }
    setLoading(true)
    const { error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    setLoading(false)
    if (authError) setError(authError.message)
    else navigate('/')
  }

  return <main className="grid min-h-screen place-items-center bg-[radial-gradient(circle_at_top_left,#e2f3ec,transparent_40%),#f4f7f4] p-5">
    <section className="w-full max-w-[420px] rounded-3xl border border-[#e1e9e3] bg-white p-7 shadow-[0_24px_70px_rgba(24,73,52,0.07)] sm:p-8">
      <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-[17px] bg-[#e2f5ed] text-[#0b786e]"><Building2 size={25} /></div>
      <h1 className="text-center text-[26px] font-extrabold tracking-tight">TallyFlow</h1>
      <p className="mt-1 text-center text-xs text-[#77867f]">Accounting books, wherever you work.</p>
      <div className="mt-5 flex items-center justify-center gap-2 rounded-xl bg-[#f0f7f2] px-3 py-3 text-[11px] font-semibold text-[#3f6a5c]"><ShieldCheck size={17} />Secure access · Admin and Owner roles</div>
      {isDemo && <div className="mt-3 rounded-xl bg-[#eef7f2] p-3 text-[11px] leading-relaxed text-[#39705e]">Local demo mode is active. Add <code>?demo=owner</code> to the URL to preview the read-only Owner dashboard.</div>}
      {error && <div className="mt-4 flex items-center gap-2 rounded-xl bg-[#fff0ee] p-3 text-[11px] text-[#a53c32]"><CircleAlert size={16} />{error}</div>}
      <form onSubmit={handleSubmit} className="mt-5 grid gap-2">
        <label htmlFor="login-email" className="mt-2 text-[11px] font-bold text-[#425e54]">Email address</label>
        <div className="flex min-h-11 items-center gap-2 rounded-xl border border-[#dce6df] px-3 text-[#819189] focus-within:border-[#6bb5a5]"><Mail size={17} /><input id="login-email" type="email" autoComplete="username" className="w-full bg-transparent py-2 text-[13px] text-[#19332c] outline-none" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@business.com" required /></div>
        <label htmlFor="login-password" className="mt-2 text-[11px] font-bold text-[#425e54]">Password</label>
        <div className="flex min-h-11 items-center gap-2 rounded-xl border border-[#dce6df] px-3 text-[#819189] focus-within:border-[#6bb5a5]"><LockKeyhole size={17} /><input id="login-password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" className="w-full min-w-0 bg-transparent py-2 text-[13px] text-[#19332c] outline-none" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter your password" required /><button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} className="p-1 text-[#73827c]" onClick={() => setShowPassword((value) => !value)}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></div>
        <button type="submit" disabled={loading} className="mt-3 min-h-11 rounded-xl bg-[#0d7c71] px-4 py-3 text-xs font-extrabold text-white hover:bg-[#086c63] disabled:opacity-50">{loading ? 'Signing in…' : 'Sign in'}</button>
      </form>
      <p className="mt-5 text-center text-[10px] leading-relaxed text-[#88948e]">Access is managed by your Admin. Owner accounts can view and track only.</p>
    </section>
  </main>
}
