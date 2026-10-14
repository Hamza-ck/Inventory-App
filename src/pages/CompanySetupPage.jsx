import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Building2, AlertCircle, ArrowRight, LoaderCircle, ShieldCheck } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

export default function CompanySetupPage() {
  const { session, loading, companyId, createCompany } = useAuth()
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    if (!loading && !session) navigate('/login', { replace: true })
    else if (!loading && session && companyId) navigate('/', { replace: true })
  }, [loading, session, companyId, navigate])

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setSaving(true)
    try {
      await createCompany(name)
      navigate('/', { replace: true })
    } catch (err) {
      setError(err?.message || 'Could not create the company.')
    } finally {
      setSaving(false)
    }
  }

  if (loading || !session || companyId) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center">
        <LoaderCircle className="w-5 h-5 animate-spin mr-2" />
        <span className="text-sm text-slate-300">Checking company access…</span>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-4">
      <section className="w-full max-w-xl rounded-3xl border border-slate-800 bg-slate-900 p-6 sm:p-9 shadow-2xl">
        <div className="w-12 h-12 rounded-2xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center mb-5">
          <Building2 className="w-6 h-6 text-blue-300" />
        </div>
        <p className="text-xs uppercase tracking-widest font-bold text-blue-300 mb-2">Workspace setup</p>
        <h1 className="text-2xl sm:text-3xl font-black tracking-tight">Create your company</h1>
        <p className="text-sm text-slate-400 mt-3 leading-6">
          Your accounting records will be stored in a separate company workspace. You can switch between companies you belong to without mixing their local records.
        </p>
        <div className="mt-5 rounded-xl border border-emerald-900/70 bg-emerald-950/30 p-3 flex items-start gap-2.5">
          <ShieldCheck className="w-4 h-4 mt-0.5 shrink-0 text-emerald-300" />
          <p className="text-xs text-emerald-100/90 leading-5">
            You will be the first company administrator. Other users must be added through a trusted invitation or administrator workflow.
          </p>
        </div>
        <form onSubmit={handleSubmit} className="mt-6 space-y-3">
          <label htmlFor="company-name" className="block text-xs font-bold text-slate-300">Company or business name</label>
          <input
            id="company-name"
            name="company-name"
            required
            minLength={2}
            maxLength={100}
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. Meem Traders"
            className="w-full px-4 py-3 rounded-xl border border-slate-700 bg-slate-950 text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {error && (
            <div role="alert" className="rounded-xl border border-rose-800 bg-rose-950/50 p-3 flex items-start gap-2 text-sm text-rose-200">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
          <button
            type="submit"
            disabled={saving || name.trim().length < 2}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed font-bold text-sm transition-colors"
          >
            {saving ? <LoaderCircle className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
            {saving ? 'Creating workspace…' : 'Create company workspace'}
          </button>
        </form>
        <p className="mt-4 text-[11px] text-slate-500 leading-5">
          If company creation fails with a missing function/table error, first run <code className="text-slate-300">supabase/migrations/20261014_company_isolation.sql</code> in the Supabase SQL Editor.
        </p>
      </section>
    </div>
  )
}
