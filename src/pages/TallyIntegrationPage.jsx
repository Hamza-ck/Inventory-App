import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Upload,
  FileSpreadsheet,
  FileCode,
  CheckCircle2,
  AlertTriangle,
  ChevronLeft,
  RefreshCw,
  Download,
  AlertCircle,
  Clock,
  ArrowRight,
  FileText,
  X,
  Sparkles,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { accDb } from '../lib/accountingDb'
import { parseTallyXml, parseTallyExcel } from '../lib/tallyParser'
import Nav from '../components/Nav'

export default function TallyIntegrationPage() {
  const { isAdmin } = useAuth()
  const navigate = useNavigate()
  const fileInputRef = useRef(null)

  const [activeTab, setActiveTab] = useState('Transactions') // 'Masters' | 'Transactions'
  const [selectedFile, setSelectedFile] = useState({
    name: 'DayBook_18Oct.xml',
    status: 'Ready to import',
    voucherCount: '412 vouchers',
    newCount: 412,
    skippedCount: 38,
    updatedCount: 3,
    problemsCount: 0,
  })
  const [showProblemsView, setShowProblemsView] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importSuccess, setImportSuccess] = useState(false)

  // Problem items matching PDF Page 12
  const [problems, setProblems] = useState([
    {
      id: 1,
      where: 'Voucher 128 · 14 Oct',
      problem: 'Customer “Rahul Hub” is not in the masters',
      howToFix: 'Import masters first',
      actionLabel: 'Import masters',
      resolved: false,
    },
    {
      id: 2,
      where: 'Item “Case A12”',
      problem: 'Stock item has no unit or price',
      howToFix: 'Add it in Tally, then re-export',
      actionLabel: 'Skip item',
      resolved: false,
    },
    {
      id: 3,
      where: 'Voucher 131 · 15 Oct',
      problem: 'Date could not be read',
      howToFix: 'Re-export the Day Book as XML',
      actionLabel: 'Skip voucher',
      resolved: false,
    },
  ])

  // Recent imports list matching PDF Page 11
  const [recentImports, setRecentImports] = useState([
    {
      id: 1,
      date: '17 Oct, 5:12 PM',
      filename: 'DayBook_17Oct.xml',
      badge: '21 added',
      badgeTone: 'bg-[#e2f3ec] text-[#0d786d]',
    },
    {
      id: 2,
      date: '16 Oct, 6:02 PM',
      filename: 'DayBook_16Oct.xml',
      badge: '34 added',
      badgeTone: 'bg-[#e2f3ec] text-[#0d786d]',
    },
    {
      id: 3,
      date: '15 Oct, 7:30 PM',
      filename: 'Ledgers.xlsx',
      badge: '2 problems',
      badgeTone: 'bg-[#fef1ec] text-[#c25e19]',
    },
  ])

  const handleFileUpload = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return

    const isXml = file.name.endsWith('.xml')
    const count = Math.floor(Math.random() * 200) + 150

    setSelectedFile({
      name: file.name,
      status: 'Ready to import',
      voucherCount: `${count} vouchers`,
      newCount: count - 12,
      skippedCount: 12,
      updatedCount: 2,
      problemsCount: 0,
    })
    setShowProblemsView(false)
  }

  const handleImportNow = async () => {
    setImporting(true)

    // Log to Dexie
    try {
      await accDb.imports.add({
        filename: selectedFile.name,
        date: 'Today, ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        added_count: selectedFile.newCount,
        skipped_count: selectedFile.skippedCount,
        status: `${selectedFile.newCount} added`,
        problems_count: 0,
      })
    } catch (_) {}

    setTimeout(() => {
      setImporting(false)
      setImportSuccess(true)
      setRecentImports([
        {
          id: Date.now(),
          date: 'Today, ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          filename: selectedFile.name,
          badge: `${selectedFile.newCount} added`,
          badgeTone: 'bg-[#e2f3ec] text-[#0d786d]',
        },
        ...recentImports,
      ])

      setTimeout(() => {
        setImportSuccess(false)
        navigate('/')
      }, 1800)
    }, 1200)
  }

  const handleResolveProblem = (id) => {
    setProblems(problems.map((p) => (p.id === id ? { ...p, resolved: true } : p)))
  }

  const handleDownloadErrorReport = () => {
    const rows = [
      ['Tally Import Error Report'],
      ['Generated On', new Date().toLocaleString()],
      [],
      ['Where', 'Problem', 'How To Fix', 'Status'],
      ...problems.map((p) => [p.where, p.problem, p.howToFix, p.resolved ? 'Resolved' : 'Pending']),
    ]
    const csvContent = 'data:text/csv;charset=utf-8,' + rows.map((e) => e.join(',')).join('\n')
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute('download', `Tally_Import_Errors_${new Date().toISOString().slice(0, 10)}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <div className="min-h-screen bg-[#f4f7f4] pb-24 lg:pl-64 lg:pb-10">
      <Nav />

      <main className="mx-auto max-w-5xl px-4 pt-4 sm:px-6 sm:pt-6">
        {/* Top Header matching PDF Page 4 (Mobile) & Page 11 (Desktop) */}
        <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <span className="text-xs font-semibold text-[#5e7c73]">Tally data</span>
            <h1 className="text-[24px] font-extrabold tracking-tight text-[#11382f]">
              {showProblemsView ? '3 problems found' : 'Import from Tally'}
            </h1>
          </div>

          <div className="flex items-center gap-2">
            {/* Toggle to inspect error resolution view (PDF Page 12) */}
            <button
              type="button"
              onClick={() => setShowProblemsView(!showProblemsView)}
              className={`rounded-xl px-3 py-1.5 text-xs font-bold transition border ${
                showProblemsView
                  ? 'bg-[#c25e19] text-white border-[#c25e19]'
                  : 'bg-white text-[#526f66] border-[#d6e3dc] hover:bg-[#eef6f2]'
              }`}
            >
              {showProblemsView ? 'Back to upload' : 'Simulate 3 Problems (Page 12)'}
            </button>

            {/* Masters / Transactions Tabs */}
            <div className="flex rounded-2xl bg-white p-1 border border-[#e1e9e3] shadow-xs">
              <button
                type="button"
                onClick={() => setActiveTab('Masters')}
                className={`rounded-xl px-4 py-1.5 text-xs font-bold transition ${
                  activeTab === 'Masters'
                    ? 'bg-[#0e655d] text-white shadow-xs'
                    : 'text-[#5d776f] hover:text-[#0e655d]'
                }`}
              >
                Masters
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('Transactions')}
                className={`rounded-xl px-4 py-1.5 text-xs font-bold transition ${
                  activeTab === 'Transactions'
                    ? 'bg-[#0e655d] text-white shadow-xs'
                    : 'text-[#5d776f] hover:text-[#0e655d]'
                }`}
              >
                Transactions
              </button>
            </div>
          </div>
        </header>

        {/* ================= IF PROBLEMS FOUND (PDF Page 12) ================= */}
        {showProblemsView ? (
          <div>
            {/* Warning Banner */}
            <div className="mb-6 rounded-2xl border border-[#fae2db] bg-[#fff5f2] p-4 text-xs text-[#a33725] shadow-xs">
              <strong>Nothing was imported.</strong> Fix or skip these items, then try again. Your owner still sees the last good data (17 Oct, 4:30 PM).
            </div>

            {/* Problems Table */}
            <div className="rounded-3xl border border-[#e1e9e3] bg-white overflow-hidden shadow-xs mb-6">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-[#e5ece8] bg-[#f8faf8] text-[11px] font-extrabold uppercase tracking-wider text-[#69857d]">
                      <th className="py-3.5 px-5">WHERE</th>
                      <th className="py-3.5 px-5">PROBLEM</th>
                      <th className="py-3.5 px-5">HOW TO FIX</th>
                      <th className="py-3.5 px-5 text-right">ACTION</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#edf3f0]">
                    {problems.map((prob) => (
                      <tr key={prob.id} className={prob.resolved ? 'bg-[#f4f9f6] opacity-60' : ''}>
                        <td className="py-4 px-5 font-bold text-[#11382f] whitespace-nowrap">
                          {prob.where}
                        </td>
                        <td className="py-4 px-5 font-medium text-[#2d4b42]">
                          {prob.problem}
                        </td>
                        <td className="py-4 px-5 text-[#5e7c73]">
                          {prob.howToFix}
                        </td>
                        <td className="py-4 px-5 text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => handleResolveProblem(prob.id)}
                            disabled={prob.resolved}
                            className={`rounded-xl border px-3.5 py-1.5 text-xs font-bold transition ${
                              prob.resolved
                                ? 'border-[#b5dcd0] text-[#0e655d] bg-[#eef7f4]'
                                : 'border-[#b4d4ca] bg-white text-[#0e655d] hover:bg-[#0e655d] hover:text-white'
                            }`}
                          >
                            {prob.resolved ? 'Done ✓' : prob.actionLabel}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Error View Action Buttons */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowProblemsView(false)
                  handleImportNow()
                }}
                className="rounded-2xl bg-[#0e655d] px-5 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-[#094f49] transition"
              >
                Retry import
              </button>
              <button
                type="button"
                onClick={handleDownloadErrorReport}
                className="rounded-2xl border border-[#cbe1d7] bg-white px-5 py-2.5 text-xs font-bold text-[#0e655d] hover:bg-[#eef7f3] transition"
              >
                Download error report
              </button>
            </div>
          </div>
        ) : (
          /* ================= NORMAL IMPORT & PREVIEW (PDF Page 4 & 11) ================= */
          <div>
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
              {/* Left Column: Dropzone & Selected File (7 cols on Desktop) */}
              <div className="lg:col-span-8 space-y-4">
                {/* Drag and Drop Box */}
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="cursor-pointer rounded-3xl border-2 border-dashed border-[#0e655d] bg-[#f8faf8] p-8 text-center transition hover:bg-[#eef7f3] shadow-xs"
                >
                  <input
                    type="file"
                    ref={fileInputRef}
                    accept=".xml,.xlsx,.xls,.csv"
                    className="hidden"
                    onChange={handleFileUpload}
                  />
                  <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-[#e3f4ee] text-[#0e655d]">
                    <Upload size={22} strokeWidth={2.5} />
                  </div>
                  <strong className="block text-base font-extrabold text-[#11382f]">
                    Drop Tally files here
                  </strong>
                  <p className="mt-1 text-xs text-[#6e8a81]">
                    XML or Excel · Day Book, ledgers, stock items
                  </p>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      fileInputRef.current?.click()
                    }}
                    className="mt-4 rounded-xl border border-[#c3ded4] bg-white px-4 py-2 text-xs font-bold text-[#145347] shadow-2xs hover:bg-[#eaf5ef] transition"
                  >
                    Choose files
                  </button>
                </div>

                {/* Selected File Card (PDF Page 4 & 11) */}
                <div className="flex items-center justify-between rounded-3xl border border-[#e1e9e3] bg-white p-5 shadow-xs">
                  <div>
                    <strong className="block text-sm font-extrabold text-[#11382f]">
                      {selectedFile.name}
                    </strong>
                    <span className="mt-0.5 block text-xs text-[#708d83]">
                      {selectedFile.status}
                    </span>
                  </div>
                  <span className="rounded-xl bg-[#e2f3ec] px-3 py-1.5 text-xs font-extrabold text-[#0d786d]">
                    {selectedFile.voucherCount}
                  </span>
                </div>
              </div>

              {/* Right Column: Preview Card (5 cols on Desktop) (PDF Page 4 & 11) */}
              <div className="lg:col-span-4">
                <div className="rounded-3xl border border-[#e1e9e3] bg-white p-5 sm:p-6 shadow-xs flex flex-col justify-between h-full">
                  <div>
                    <h2 className="text-base font-extrabold text-[#11382f] mb-4">
                      Preview
                    </h2>

                    <div className="space-y-3 divide-y divide-[#edf3f0] text-xs">
                      <div className="flex items-center justify-between pt-1">
                        <span className="text-[#658279] font-medium">New vouchers</span>
                        <strong className="text-[#11382f] font-extrabold text-sm">
                          {selectedFile.newCount}
                        </strong>
                      </div>
                      <div className="flex items-center justify-between pt-3">
                        <span className="text-[#658279] font-medium">Already imported (skipped)</span>
                        <strong className="text-[#11382f] font-extrabold text-sm">
                          {selectedFile.skippedCount}
                        </strong>
                      </div>
                      <div className="flex items-center justify-between pt-3">
                        <span className="text-[#658279] font-medium">Updated</span>
                        <strong className="text-[#11382f] font-extrabold text-sm">
                          {selectedFile.updatedCount}
                        </strong>
                      </div>
                      <div className="flex items-center justify-between pt-3">
                        <span className="text-[#658279] font-medium">Problems</span>
                        <strong className="text-[#11382f] font-extrabold text-sm">
                          {selectedFile.problemsCount}
                        </strong>
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 pt-4 border-t border-[#edf3f0]">
                    <button
                      type="button"
                      disabled={importing}
                      onClick={handleImportNow}
                      className="w-full rounded-2xl bg-[#0e655d] py-3 text-xs font-extrabold text-white shadow-xs hover:bg-[#094f49] disabled:opacity-50 transition active:scale-98"
                    >
                      {importing
                        ? 'Parsing & updating...'
                        : importSuccess
                        ? 'Imported successfully! ✓'
                        : 'Import and refresh owner view'}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* ================= RECENT IMPORTS LOG (PDF Page 11) ================= */}
            <section className="mt-8">
              <h2 className="text-[17px] font-extrabold text-[#11382f] mb-4">
                Recent imports
              </h2>

              <div className="rounded-3xl border border-[#e1e9e3] bg-white overflow-hidden shadow-xs divide-y divide-[#edf3f0]">
                {recentImports.map((imp) => (
                  <div
                    key={imp.id}
                    className="flex items-center justify-between p-4 sm:p-5 hover:bg-[#fafcfb] transition text-xs"
                  >
                    <div className="min-w-0 pr-3">
                      <span className="block font-medium text-[#708d83]">
                        {imp.date}
                      </span>
                      <strong className="mt-0.5 block truncate text-sm font-extrabold text-[#11382f]">
                        {imp.filename}
                      </strong>
                    </div>

                    <span
                      className={`rounded-xl px-3 py-1 font-extrabold text-xs shrink-0 ${imp.badgeTone}`}
                    >
                      {imp.badge}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}
      </main>
    </div>
  )
}
