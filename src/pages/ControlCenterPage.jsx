import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Activity, Bell, Check, Database, Download, Eye, FileSpreadsheet, RefreshCw, Save, Settings2, ShieldCheck, Store, Users, X } from 'lucide-react'
import Nav from '../components/Nav'
import { accDb } from '../lib/accountingDb'
import { supabase, supabaseConfigured } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'

const defaults = {
  owner_show_sales: true,
  owner_show_profit: true,
  owner_show_expenses: true,
  owner_show_debtors: true,
  owner_show_creditors: true,
  owner_show_inventory: true,
  owner_show_loans: false,
  shop_name: '',
  invoice_footer: 'Thank you for your business',
  summary_language: 'English',
  summary_time: '20:00',
  summary_preference_enabled: false,
}

const ownerCards = [
  ['owner_show_sales', 'Sales', 'Daily and monthly sales totals'],
  ['owner_show_profit', 'Profit', 'Estimated gross and net profit'],
  ['owner_show_expenses', 'Expenses', 'Payments classified as operating expenses'],
  ['owner_show_debtors', 'Debtors', 'Customer balances and receivables'],
  ['owner_show_creditors', 'Creditors', 'Supplier balances and payables'],
  ['owner_show_inventory', 'Inventory', 'Stock valuation and low-stock visibility'],
  ['owner_show_loans', 'Loans & advances', 'Net balance of loans and advances'],
]

function money(value) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(value) || 0)
}
function dateLabel(value) {
  const date = value ? new Date(value) : null
  return date && !Number.isNaN(date.getTime()) ? date.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Date unavailable'
}
function downloadJson(name, payload) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

export default function ControlCenterPage() {
  const { pathname } = useLocation()
  const { isAdmin, user } = useAuth()
  const section = pathname === '/users' ? 'users' : pathname === '/activity' ? 'activity' : 'settings'
  const titles = {
    settings: ['App settings', 'Configure shop details and which summary cards appear in the Owner view.'],
    users: ['Users & access', 'Review the available profiles and manage Admin or read-only Owner roles.'],
    activity: ['Activity log', 'Review recent accounting entries and import history available to this account.'],
  }
  const [settings, setSettings] = useState(defaults)
  const [loadingSettings, setLoadingSettings] = useState(true)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [users, setUsers] = useState([])
  const [usersLoading, setUsersLoading] = useState(false)
  const [activity, setActivity] = useState([])
  const [imports, setImports] = useState([])
  const [activityLoading, setActivityLoading] = useState(false)

  const loadSettings = useCallback(async () => {
    setLoadingSettings(true)
    try {
      const rows = await accDb.settings.toArray()
      const saved = Object.fromEntries(rows.map((row) => [row.key, row.value]))
      setSettings((current) => ({ ...defaults, ...current, ...saved }))
    } catch (problem) {
      setError(problem?.message || 'Could not load saved settings from this browser.')
    } finally {
      setLoadingSettings(false)
    }
  }, [])

  const loadUsers = useCallback(async () => {
    if (!isAdmin || !supabaseConfigured) return
    setUsersLoading(true)
    setError('')
    const { data, error: queryError } = await supabase.from('profiles').select('id,full_name,role').order('full_name', { ascending: true })
    if (queryError) setError('Could not load profiles: ' + queryError.message)
    else setUsers(data || [])
    setUsersLoading(false)
  }, [isAdmin])

  const loadActivity = useCallback(async () => {
    setActivityLoading(true)
    try {
      const vouchers = await accDb.vouchers.toArray()
      setActivity(vouchers.sort((a, b) => new Date(b.created_at || b.createdAt || b.date || 0) - new Date(a.created_at || a.createdAt || a.date || 0)).slice(0, 20))
      if (isAdmin && supabaseConfigured) {
        const { data, error: queryError } = await supabase.from('import_jobs').select('id,filename,source_format,status,counts,created_at,committed_at').order('created_at', { ascending: false }).limit(10)
        if (!queryError) setImports(data || [])
      }
    } catch (problem) {
      setError(problem?.message || 'Could not load recent activity.')
    } finally {
      setActivityLoading(false)
    }
  }, [isAdmin])

  useEffect(() => {
    setError('')
    setNotice('')
    if (section === 'settings') loadSettings()
    if (section === 'users') loadUsers()
    if (section === 'activity') loadActivity()
  }, [section, loadSettings, loadUsers, loadActivity])

  async function saveSettings(event) {
    event.preventDefault()
    if (!isAdmin) return
    setSaving(true); setError(''); setNotice('')
    try {
      await Promise.all(Object.entries(settings).map(([key, value]) => accDb.settings.put({ key, value })))
      setNotice('Settings saved in this browser. Owner dashboard preferences apply when that account refreshes its view on this device.')
      window.dispatchEvent(new Event('accounting-data-updated'))
    } catch (problem) {
      setError(problem?.message || 'Could not save settings.')
    } finally {
      setSaving(false)
    }
  }

  async function changeRole(profile, role) {
    if (!isAdmin || !supabaseConfigured) return
    if (profile.id === user?.id && role !== 'admin') {
      setError('You cannot remove Admin access from the account currently signed in.')
      return
    }
    const previousRole = profile.role
    setUsers((rows) => rows.map((row) => row.id === profile.id ? { ...row, role } : row))
    setError(''); setNotice('')
    const { error: updateError } = await supabase.from('profiles').update({ role }).eq('id', profile.id)
    if (updateError) {
      setUsers((rows) => rows.map((row) => row.id === profile.id ? { ...row, role: previousRole } : row))
      setError('Role update failed: ' + updateError.message)
    } else setNotice('Access role updated.')
  }

  async function backupData() {
    try {
      const [vouchers, parties, materials, ledgers, settingRows] = await Promise.all([
        accDb.vouchers.toArray(), accDb.parties.toArray(), accDb.materials.toArray(), accDb.ledgers.toArray(), accDb.settings.toArray(),
      ])
      const createdAt = new Date().toISOString()
      downloadJson('books-console-local-backup-' + createdAt.slice(0, 10) + '.json', { createdAt, source: 'Current browser IndexedDB cache', vouchers, parties, materials, ledgers, settings: settingRows })
      await accDb.settings.put({ key: 'last_backup', value: createdAt })
      setSettings((current) => ({ ...current, last_backup: createdAt }))
      setNotice('Local data backup downloaded. It contains the records currently stored in this browser, not a server-side snapshot.')
    } catch (problem) {
      setError(problem?.message || 'Could not create a local backup.')
    }
  }

  const counts = useMemo(() => ({
    vouchers: activity.length,
    imports: imports.length,
  }), [activity.length, imports.length])

  if (!isAdmin) {
    return <>
      <Nav />
      <main className="min-h-screen bg-[#f4f7f4] px-4 pb-28 pt-6 text-[#172f2c] sm:px-6 lg:ml-64 lg:w-[calc(100%-16rem)] lg:px-9 lg:pb-8">
        <div className="mx-auto max-w-[1100px]">
          <p className="text-[13px] text-[#61756d]">Control center</p><h1 className="mt-1 text-[27px] font-extrabold">Admin access required</h1>
          <section className="mt-5 flex items-start gap-3 rounded-[18px] border border-[#e1e8e3] bg-white p-5"><ShieldCheck className="mt-0.5 text-[#0e7a70]" size={21} /><div><h2 className="text-sm font-extrabold">Owner view is read-only</h2><p className="mt-1 text-xs leading-relaxed text-[#77867f]">Settings, profile access changes and activity controls are available to Admin accounts only.</p></div></section>
        </div>
      </main>
    </>
  }

  const [title, subtitle] = titles[section]

  return <>
    <Nav />
    <main className="min-h-screen bg-[#f4f7f4] px-4 pb-28 pt-5 text-[#172f2c] sm:px-6 lg:ml-64 lg:w-[calc(100%-16rem)] lg:px-9 lg:pb-8 lg:pt-8">
      <div className="mx-auto max-w-[1200px]">
        <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div><p className="text-[13px] text-[#61756d]">Control center</p><h1 className="text-[27px] font-extrabold tracking-tight">{title}</h1><p className="mt-1 text-xs text-[#7c8a83]">{subtitle}</p></div>
          <span className="inline-flex w-fit items-center gap-2 rounded-xl bg-[#e4f5ed] px-3 py-2 text-[10px] font-extrabold text-[#0e7669]"><ShieldCheck size={15} />Admin control</span>
        </header>

        {error && <div className="mb-4 rounded-xl border border-[#f1d1cc] bg-[#fff0ee] px-4 py-3 text-xs text-[#a33d35]">{error}</div>}
        {notice && <div className="mb-4 flex items-start gap-2 rounded-xl border border-[#cdebd8] bg-[#eaf7ef] px-4 py-3 text-xs text-[#166b55]"><Check size={15} className="mt-0.5 shrink-0" />{notice}</div>}

        {section === 'settings' && <form onSubmit={saveSettings} className="grid gap-4 xl:grid-cols-2">
          <section className="rounded-[18px] border border-[#e1e8e3] bg-white p-5 sm:p-6">
            <div className="mb-5 flex items-start gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-[#e4f5ed] text-[#0e7669]"><Eye size={19} /></span><div><h2 className="text-[15px] font-extrabold">What the Owner can see</h2><p className="mt-1 text-[11px] text-[#82908a]">Choose which summary cards appear on the Owner dashboard.</p></div></div>
            {loadingSettings ? <p className="text-xs text-[#82908a]">Loading settings…</p> : <div className="divide-y divide-[#edf1ed]">{ownerCards.map(([key, label, detail]) => <label key={key} className="flex cursor-pointer items-center justify-between gap-4 py-3"><span><strong className="block text-xs font-bold text-[#30483e]">{label}</strong><small className="mt-1 block text-[10px] text-[#82908a]">{detail}</small></span><input type="checkbox" checked={settings[key] !== false} onChange={(event) => setSettings((current) => ({ ...current, [key]: event.target.checked }))} className="h-4 w-4 accent-[#0e7a70]" /></label>)}</div>}
          </section>

          <div className="grid content-start gap-4">
            <section className="rounded-[18px] border border-[#e1e8e3] bg-white p-5 sm:p-6">
              <div className="mb-5 flex items-start gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-[#fff0df] text-[#b45b10]"><Bell size={19} /></span><div><h2 className="text-[15px] font-extrabold">Daily summary preferences</h2><p className="mt-1 text-[11px] text-[#82908a]">Stored preferences only; automated WhatsApp delivery is not configured in this app.</p></div></div>
              <label className="mb-4 flex items-center justify-between gap-4"><span><strong className="block text-xs font-bold">Enable summary preference</strong><small className="mt-1 block text-[10px] text-[#82908a]">Does not send a message by itself.</small></span><input type="checkbox" checked={Boolean(settings.summary_preference_enabled)} onChange={(e) => setSettings((current) => ({ ...current, summary_preference_enabled: e.target.checked }))} className="h-4 w-4 accent-[#0e7a70]" /></label>
              <div className="grid gap-3 sm:grid-cols-2"><label className="text-[11px] font-bold text-[#61756d]">Preferred time<input type="time" value={settings.summary_time || '20:00'} onChange={(e) => setSettings((current) => ({ ...current, summary_time: e.target.value }))} className="mt-1.5 w-full rounded-xl border border-[#dce6df] bg-[#f9fcfa] px-3 py-2.5 text-xs text-[#19332c]" /></label><label className="text-[11px] font-bold text-[#61756d]">Language<select value={settings.summary_language || 'English'} onChange={(e) => setSettings((current) => ({ ...current, summary_language: e.target.value }))} className="mt-1.5 w-full rounded-xl border border-[#dce6df] bg-[#f9fcfa] px-3 py-2.5 text-xs text-[#19332c]"><option>English</option><option>বাংলা</option><option>Hindi</option></select></label></div>
            </section>
            <section className="rounded-[18px] border border-[#e1e8e3] bg-white p-5 sm:p-6">
              <div className="mb-5 flex items-start gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-[#eaf0f4] text-[#47677a]"><Store size={19} /></span><div><h2 className="text-[15px] font-extrabold">Shop details</h2><p className="mt-1 text-[11px] text-[#82908a]">Details used by the dashboard and invoice printouts.</p></div></div>
              <label className="block text-[11px] font-bold text-[#61756d]">Shop name<input value={settings.shop_name || ''} onChange={(e) => setSettings((current) => ({ ...current, shop_name: e.target.value }))} placeholder="Your business name" className="mt-1.5 w-full rounded-xl border border-[#dce6df] bg-[#f9fcfa] px-3 py-2.5 text-xs text-[#19332c]" /></label>
              <label className="mt-4 block text-[11px] font-bold text-[#61756d]">Invoice footer<textarea value={settings.invoice_footer || ''} onChange={(e) => setSettings((current) => ({ ...current, invoice_footer: e.target.value }))} rows={2} className="mt-1.5 w-full rounded-xl border border-[#dce6df] bg-[#f9fcfa] px-3 py-2.5 text-xs text-[#19332c]" /></label>
            </section>
          </div>

          <section className="rounded-[18px] border border-[#e1e8e3] bg-white p-5 sm:p-6 xl:col-span-2">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-start gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-[#edf1f7] text-[#57688a]"><Database size={19} /></span><div><h2 className="text-[15px] font-extrabold">Data and backups</h2><p className="mt-1 text-[11px] text-[#82908a]">Download a JSON backup of records stored in this browser.</p><p className="mt-1 text-[10px] text-[#a0aaa3]">Last local backup: {settings.last_backup ? new Date(settings.last_backup).toLocaleString('en-IN') : 'Not recorded'}</p></div></div><div className="flex flex-wrap gap-2"><button type="button" onClick={backupData} className="rounded-xl border border-[#c9dfd3] bg-white px-3 py-2.5 text-xs font-bold text-[#176e60]"><Download size={14} className="mr-1.5 inline" />Download backup</button><button type="submit" disabled={saving} className="rounded-xl bg-[#0d7c71] px-4 py-2.5 text-xs font-extrabold text-white disabled:opacity-50"><Save size={14} className="mr-1.5 inline" />{saving ? 'Saving…' : 'Save changes'}</button></div></div>
          </section>
        </form>}

        {section === 'users' && <section className="overflow-hidden rounded-[18px] border border-[#e1e8e3] bg-white">
          <div className="flex flex-col gap-3 border-b border-[#edf1ed] p-5 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-[15px] font-extrabold">Users and roles</h2><p className="mt-1 text-[11px] text-[#82908a]">Admin has full control. Owner accounts are read-only.</p></div><button type="button" onClick={loadUsers} disabled={usersLoading} className="inline-flex items-center gap-2 rounded-xl border border-[#dfe8e2] bg-white px-3 py-2.5 text-xs font-bold text-[#496258]"><RefreshCw size={14} className={usersLoading ? 'animate-spin' : ''} />Refresh list</button></div>
          <div className="divide-y divide-[#edf1ed]">{usersLoading ? <p className="p-6 text-xs text-[#82908a]">Loading profiles…</p> : users.map((profile) => <article key={profile.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-full bg-[#e4f5ed] text-[#0e7669]"><Users size={18} /></span><div><strong className="block text-xs font-extrabold text-[#30483e]">{profile.full_name || 'Unnamed user'}</strong><span className="mt-1 block text-[10px] text-[#8a9991]">{profile.id === user?.id ? 'Signed-in account' : 'Registered profile'}</span></div></div><div className="flex items-center gap-2"><span className="rounded-lg bg-[#f0f6f1] px-2.5 py-1.5 text-[10px] font-bold text-[#52685e]">{profile.id === user?.id ? 'You' : 'Member'}</span><select aria-label={'Role for ' + (profile.full_name || profile.id)} value={profile.role === 'admin' ? 'admin' : 'owner'} onChange={(e) => changeRole(profile, e.target.value)} disabled={profile.id === user?.id} className="rounded-xl border border-[#dce6df] bg-[#f9fcfa] px-3 py-2 text-xs font-bold text-[#19332c]"><option value="owner">Owner · view only</option><option value="admin">Admin · full control</option></select></div></article>)}</div>
          {!usersLoading && users.length === 0 && <div className="p-7 text-center"><p className="text-sm font-bold">No profiles returned</p><p className="mt-1 text-xs text-[#82908a]">Check Supabase connection and profile-table permissions.</p></div>}
          <div className="border-t border-[#edf1ed] bg-[#f8fbf9] p-4 text-[11px] leading-relaxed text-[#71827a]"><strong className="text-[#435b52]">Adding a user:</strong> Create or invite the user through Supabase Auth first. The app creates a default Owner profile on signup; use this screen to grant Admin access only when appropriate.</div>
        </section>}

        {section === 'activity' && <div className="grid gap-4 xl:grid-cols-2">
          <section className="overflow-hidden rounded-[18px] border border-[#e1e8e3] bg-white"><div className="flex items-start justify-between border-b border-[#edf1ed] p-5"><div><h2 className="text-[15px] font-extrabold">Recent accounting entries</h2><p className="mt-1 text-[11px] text-[#82908a]">Latest {counts.vouchers} vouchers available in this browser.</p></div><Activity size={19} className="text-[#0e7a70]" /></div>{activityLoading ? <p className="p-5 text-xs text-[#82908a]">Loading activity…</p> : activity.map((voucher) => <article key={voucher.id} className="flex items-center justify-between gap-3 border-b border-[#edf1ed] p-4 last:border-0"><div className="min-w-0"><strong className="block truncate text-xs text-[#30483e]">{(voucher.voucher_type || 'Voucher').toUpperCase()} · {voucher.voucher_no || 'No voucher number'}</strong><p className="mt-1 truncate text-[11px] text-[#82908a]">{voucher.party_name || voucher.narration || 'Accounting entry'} · {dateLabel(voucher.created_at || voucher.createdAt || voucher.date)}</p></div><strong className="whitespace-nowrap text-xs font-extrabold text-[#30483e]">{money(voucher.amount)}</strong></article>)}{!activityLoading && !activity.length && <p className="p-6 text-center text-xs text-[#82908a]">No vouchers have been recorded in this browser yet.</p>}</section>
          <section className="overflow-hidden rounded-[18px] border border-[#e1e8e3] bg-white"><div className="flex items-start justify-between border-b border-[#edf1ed] p-5"><div><h2 className="text-[15px] font-extrabold">Tally import history</h2><p className="mt-1 text-[11px] text-[#82908a]">Recent import jobs recorded by Supabase.</p></div><FileSpreadsheet size={19} className="text-[#0e7a70]" /></div>{imports.map((job) => <article key={job.id} className="border-b border-[#edf1ed] p-4 last:border-0"><div className="flex items-center justify-between gap-3"><strong className="truncate text-xs text-[#30483e]">{job.filename}</strong><span className={'rounded-lg px-2 py-1 text-[10px] font-bold ' + (job.status === 'committed' ? 'bg-[#e6f4ee] text-[#0e7669]' : 'bg-[#fff5e8] text-[#9c611c]')}>{job.status}</span></div><p className="mt-1 text-[10px] text-[#82908a]">{dateLabel(job.created_at)} · {job.source_format || 'Tally export'}</p></article>)}{!imports.length && <p className="p-6 text-xs text-[#82908a]">No import history is available, or the import-history table could not be read.</p>}</section>
        </div>}
      </div>
    </main>
  </>
}
