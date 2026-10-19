import { useEffect, useState } from 'react'
import { AlertCircle, CheckCircle2, CircleAlert, Clock3, Database, FileSpreadsheet, FileText, RefreshCw, UploadCloud } from 'lucide-react'
import Nav from '../components/Nav'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'

const compact = (value) => new Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 }).format(Number(value) || 0)

export default function TallyIntegrationPage() {
  const { isAdmin } = useAuth()
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)
  const [job, setJob] = useState(null)
  const [previewRows, setPreviewRows] = useState([])
  const [history, setHistory] = useState([])
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  async function loadHistory() {
    if (!isAdmin) return
    const { data, error: queryError } = await supabase.from('import_jobs').select('id,filename,source_format,status,counts,created_at,committed_at').order('created_at', { ascending: false }).limit(8)
    if (!queryError) setHistory(data || [])
  }
  useEffect(() => { loadHistory() }, [isAdmin])

  async function encodeFile(input) {
    const bytes = new Uint8Array(await input.arrayBuffer())
    let binary = ''
    for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000))
    return btoa(binary)
  }

  async function previewImport() {
    if (!file || !isAdmin) return
    setError(''); setSuccess(''); setBusy(true)
    try {
      const { data, error: functionError } = await supabase.functions.invoke('tally-import', { body: { action: 'preview', filename: file.name, contentBase64: await encodeFile(file) } })
      if (functionError) throw functionError
      setJob(data); setPreviewRows(data.previewRows || [])
      setSuccess('Preview ready. No accounting records have been changed yet.')
      await loadHistory()
    } catch (problem) {
      setError(problem?.message || 'Could not preview this file. Check that the tally-import Edge Function is deployed.')
    } finally { setBusy(false) }
  }

  async function commitImport() {
    if (!job?.jobId || !isAdmin) return
    setError(''); setSuccess(''); setBusy(true)
    try {
      const { data, error: functionError } = await supabase.functions.invoke('tally-import', { body: { action: 'commit', jobId: job.jobId } })
      if (functionError) throw functionError
      setSuccess('Import committed. ' + (data?.inserted ?? 0) + ' records added; ' + (data?.skipped ?? 0) + ' duplicates or unchanged records skipped.')
      setJob({ ...job, committed: true })
      window.dispatchEvent(new Event('accounting-data-updated'))
      await loadHistory()
    } catch (problem) {
      setError(problem?.message || 'Import failed. The database transaction was rolled back; check the job and logs.')
    } finally { setBusy(false) }
  }

  if (!isAdmin) return <><Nav /><main className="min-h-screen bg-[#f4f7f4] px-4 pb-28 pt-5 lg:ml-64 lg:w-[calc(100%-16rem)] lg:px-9 lg:pt-8"><div className="mx-auto max-w-[1100px]"><div className="mb-6"><p className="text-[13px] text-[#61756d]">Tally data</p><h1 className="text-2xl font-extrabold">Import is Admin-only</h1><p className="mt-2 text-xs text-[#7c8a83]">Owner accounts can view and track business records but cannot upload or change accounting data.</p></div><div className="flex items-start gap-3 rounded-2xl border border-[#e1e8e3] bg-white p-5 text-[#9a6116]"><AlertCircle size={22} /><div><strong className="text-sm text-[#30453d]">View-only access</strong><p className="mt-1 text-xs text-[#77867f]">Ask your Admin to import Tally exports or resolve import errors.</p></div></div></div></main></>

  return <>
    <Nav />
    <main className="min-h-screen bg-[#f4f7f4] px-4 pb-28 pt-5 text-[#172f2c] sm:px-6 lg:ml-64 lg:w-[calc(100%-16rem)] lg:px-9 lg:pb-8 lg:pt-8">
      <div className="mx-auto max-w-[1200px]">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-[13px] text-[#61756d]">Books console</p><h1 className="text-[26px] font-extrabold tracking-tight">Import from Tally</h1><p className="mt-1 text-xs text-[#7c8a83]">Stage, validate, and review masters or transactions before changing the books.</p></div><span className="inline-flex w-fit items-center gap-2 rounded-lg bg-[#e9f7f0] px-3 py-2 text-[10px] font-extrabold text-[#0e7669]"><Database size={15} />Admin control</span></div>
        {error && <div className="mb-4 flex items-center gap-2 rounded-xl border border-[#f1d1cc] bg-[#fff0ee] px-4 py-3 text-xs text-[#a33d35]"><CircleAlert size={16} />{error}</div>}
        {success && <div className="mb-4 flex items-center gap-2 rounded-xl border border-[#cdebd8] bg-[#eaf7ef] px-4 py-3 text-xs text-[#166b55]"><CheckCircle2 size={16} />{success}</div>}

        <section className="rounded-[18px] border border-[#e1e8e3] bg-white p-6 text-center sm:p-8">
          <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-[18px] bg-[#e4f5ed] text-[#0b7c70]"><UploadCloud size={26} /></div>
          <h2 className="text-lg font-extrabold">Choose a Tally export file</h2><p className="mx-auto mt-2 max-w-[620px] text-xs leading-relaxed text-[#77867f]">Supports XML, Excel (.xlsx/.xls), and CSV exports. Preview is staged first; accounting records are updated only when you commit.</p>
          <label className="mx-auto mt-5 flex w-fit max-w-full cursor-pointer items-center gap-3 rounded-xl border border-dashed border-[#8ebeb0] bg-[#f5fbf8] px-4 py-3 text-xs font-extrabold text-[#0c776c]"><FileSpreadsheet size={18} /><span className="max-w-[250px] truncate">{file ? file.name : 'Browse files'}</span><input className="hidden" type="file" accept=".xml,.xlsx,.xls,.csv" onChange={(event) => { setFile(event.target.files?.[0] || null); setJob(null); setPreviewRows([]); setError(''); setSuccess('') }} /></label>
          <p className="mt-3 text-[10px] text-[#91a098]">Maximum 8 MB · Day Book, vouchers, ledgers or stock-item exports</p>
          <button type="button" disabled={!file || busy || file.size > 8 * 1024 * 1024} onClick={previewImport} className="mt-5 inline-flex items-center justify-center gap-2 rounded-xl bg-[#0d7c71] px-5 py-3 text-xs font-extrabold text-white hover:bg-[#086c63] disabled:opacity-50"><UploadCloud size={16} />{busy ? 'Preparing preview…' : 'Preview import'}</button>
          {file && file.size > 8 * 1024 * 1024 && <p className="mt-2 text-[11px] text-red-700">This file exceeds the 8 MB upload limit.</p>}
        </section>

        {job && <section className="mt-4 rounded-[18px] border border-[#e1e8e3] bg-white p-5 sm:p-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><div><h2 className="text-[15px] font-extrabold">Import preview</h2><p className="mt-1 text-[11px] text-[#82908a]">{job.filename} · {job.sourceFormat} · {job.status}</p></div><span className="w-fit rounded-lg bg-[#e6f6ed] px-3 py-2 text-[10px] font-extrabold text-[#0e7869]">{job.committed ? 'Committed' : 'Ready to review'}</span></div>
          <div className="mt-5 grid grid-cols-3 gap-2 sm:gap-3">{[{label:'Valid / new',value:job.summary?.valid},{label:'Duplicates',value:job.summary?.duplicates},{label:'Problems',value:job.summary?.problems}].map((item) => <div key={item.label} className="rounded-xl border border-[#e4ebe5] bg-[#fbfdfb] p-3"><span className="block text-[10px] font-bold text-[#819087]">{item.label}</span><strong className="mt-1 block text-xl font-extrabold">{compact(item.value)}</strong></div>)}</div>
          <div className="mt-4 overflow-x-auto rounded-xl border border-[#e4ebe5]"><table className="w-full min-w-[620px] border-collapse text-left"><thead className="bg-[#f5f8f5] text-[10px] font-extrabold text-[#61756b]"><tr><th className="px-3 py-3">Row</th><th className="px-3 py-3">Type</th><th className="px-3 py-3">Reference</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Message</th></tr></thead><tbody>{previewRows.map((row) => <tr key={row.id || row.rowNumber} className="border-t border-[#edf1ed] text-[11px] text-[#41574e]"><td className="px-3 py-2.5">{row.rowNumber}</td><td className="px-3 py-2.5">{row.rowType}</td><td className="max-w-[180px] break-words px-3 py-2.5">{row.reference || '—'}</td><td className="px-3 py-2.5"><span className={'rounded-md px-2 py-1 text-[9px] font-extrabold ' + (row.validationStatus === 'error' ? 'bg-[#ffedeb] text-[#ac3934]' : row.validationStatus === 'duplicate' ? 'bg-[#fff4de] text-[#92610c]' : 'bg-[#e6f6ed] text-[#0e7869]')}>{row.validationStatus}</span></td><td className="max-w-[250px] break-words px-3 py-2.5">{(row.messages || []).join('; ') || 'Ready to import'}</td></tr>)}</tbody></table></div>
          <div className="mt-4 flex items-start gap-2 rounded-xl bg-[#f6f8f4] p-3 text-[11px] text-[#74847a]"><AlertCircle size={16} className="shrink-0" /><span>Only rows marked valid or warning are selected. Problem rows remain staged and are not applied; existing voucher duplicates are skipped.</span></div>
          <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" disabled={busy} onClick={() => { setJob(null); setPreviewRows([]) }} className="rounded-xl border border-[#dce5df] bg-white px-4 py-3 text-xs font-bold text-[#47615a]">Discard preview</button><button type="button" disabled={busy || job.committed || !(job.summary?.valid > 0)} onClick={commitImport} className="rounded-xl bg-[#0d7c71] px-4 py-3 text-xs font-extrabold text-white disabled:opacity-50">{busy ? 'Importing…' : 'Import valid rows and refresh books'}</button></div>
        </section>}

        <section className="mt-4 rounded-[18px] border border-[#e1e8e3] bg-white p-5 sm:p-6">
          <div className="flex items-start justify-between gap-3"><div><h2 className="text-[15px] font-extrabold">Recent imports</h2><p className="mt-1 text-[11px] text-[#82908a]">Import history is available to Admins only.</p></div><button type="button" onClick={loadHistory} aria-label="Refresh import history" className="grid h-9 w-9 place-items-center rounded-xl border border-[#e3eae4] bg-white text-[#60776c]"><RefreshCw size={16} /></button></div>
          {history.length ? <div className="mt-3 divide-y divide-[#edf1ed]">{history.map((item) => <div key={item.id} className="flex items-center gap-3 py-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#eaf6ef] text-[#0a786d]"><FileText size={18} /></span><div className="min-w-0 flex-1"><strong className="block break-words text-xs text-[#2a4438]">{item.filename}</strong><span className="mt-1 block text-[10px] text-[#87948c]">{new Date(item.created_at).toLocaleString('en-IN')} · {item.source_format}</span></div><div className="text-right text-[10px] font-extrabold capitalize text-[#597168]">{item.status}<small className="mt-1 block font-normal text-[#87948c]">{compact(item.counts?.valid)} valid · {compact(item.counts?.problems)} problems</small></div></div>)}</div> : <div className="flex min-h-[95px] flex-col items-center justify-center gap-2 text-xs text-[#8a9a93]"><Clock3 size={23} />No Tally imports staged yet.</div>}
        </section>
      </div>
    </main>
  </>
}
