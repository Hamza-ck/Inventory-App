import { useCallback, useEffect, useState } from 'react'
import { AlertCircle, CheckCircle2, Cloud, CloudOff, LoaderCircle, RefreshCw } from 'lucide-react'
import { getSyncQueueSummary, hydrateCompanyFromSupabase, syncOutbox } from '../lib/accountingDb'
import { useAuth } from '../context/AuthContext'

export default function SyncStatus() {
  const { session, companyId, isDemoMode } = useAuth()
  const [summary, setSummary] = useState({ pending: 0, withErrors: 0 })
  const [syncing, setSyncing] = useState(false)
  const [syncError, setSyncError] = useState('')
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine)

  const refresh = useCallback(async () => {
    try {
      setSummary(await getSyncQueueSummary())
    } catch {
      // IndexedDB may still be opening after a company switch; next event refreshes.
    }
  }, [companyId])

  const syncNow = useCallback(async () => {
    if (!session || !companyId || isDemoMode || !online) return
    setSyncing(true)
    setSyncError('')
    try {
      await syncOutbox({ force: true })
      await hydrateCompanyFromSupabase()
    } catch (error) {
      setSyncError(error?.message || 'Company sync failed. Please try again.')
    } finally {
      await refresh()
      setSyncing(false)
    }
  }, [session, companyId, isDemoMode, online, refresh])

  useEffect(() => {
    refresh()
    if (session && companyId && !isDemoMode) syncNow()
    const handleQueueChange = () => refresh()
    const handleSyncError = (event) => setSyncError(event.detail?.message || 'Company sync failed.')
    const handleOnline = () => {
      setOnline(true)
      setTimeout(() => hydrateCompanyFromSupabase().catch((err) => console.error('Company refresh failed:', err)), 0)
    }
    const handleOffline = () => setOnline(false)
    window.addEventListener('accounting-sync-updated', handleQueueChange)
    window.addEventListener('accounting-sync-error', handleSyncError)
    window.addEventListener('accounting-data-updated', handleQueueChange)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('accounting-sync-updated', handleQueueChange)
      window.removeEventListener('accounting-sync-error', handleSyncError)
      window.removeEventListener('accounting-data-updated', handleQueueChange)
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [companyId, session, isDemoMode, refresh, syncNow])

  if (!session || !companyId) {
    if (isDemoMode) {
      return (
        <span className="hidden sm:inline-flex items-center gap-1.5 text-[10px] font-semibold text-slate-400" title="Demo records stay in this browser">
          <CloudOff className="w-3.5 h-3.5" /> Local demo
        </span>
      )
    }
    return null
  }

  const label = syncError
    ? 'Sync failed'
    : !online
      ? 'Offline'
    : syncing
      ? 'Syncing'
      : summary.withErrors > 0
        ? `Retry ${summary.withErrors}`
        : summary.pending > 0
          ? `Queued ${summary.pending}`
          : 'No pending sync'

  const Icon = !online ? CloudOff : syncing ? LoaderCircle : summary.withErrors > 0 ? AlertCircle : summary.pending > 0 ? Cloud : CheckCircle2
  const title = syncError
    ? syncError
    : !online
      ? 'You are offline. Local changes will remain queued.'
    : summary.withErrors > 0
      ? 'Some cloud writes failed and will be retried. Click to retry now.'
      : summary.pending > 0
        ? 'Local changes are waiting to sync. Click to retry now.'
        : 'No local changes are waiting in the sync queue.'

  return (
    <button
      type="button"
      onClick={syncNow}
      disabled={syncing || !online}
      title={title}
      aria-label={title}
      className={`hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[10px] font-semibold transition-colors disabled:opacity-60 ${
        summary.withErrors > 0 || syncError
          ? 'border-rose-700/70 bg-rose-950/40 text-rose-200'
          : !online || summary.pending > 0
            ? 'border-amber-700/60 bg-amber-950/30 text-amber-100'
            : 'border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700'
      }`}
    >
      <Icon className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
      <span>{label}</span>
      {summary.pending > 0 && !syncing && online && <RefreshCw className="w-3 h-3 opacity-60" />}
    </button>
  )
}
