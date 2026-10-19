import { useState, useRef } from 'react'
import { 
  FileSpreadsheet, 
  Upload, 
  Download, 
  CheckCircle2, 
  AlertCircle, 
  Sparkles, 
  Database } from 'lucide-react'
import { 
  parseTallyXml, 
  parseTallyExcel, 
  generateTallyExportXml, 
  SAMPLE_TALLY_XML 
} from '../lib/tallyParser'
import { accDb, importTallyData } from '../lib/accountingDb'
import { useUI } from '../context/UIContext'
import { todayISO } from '../lib/format'
import { useAuth } from '../context/AuthContext'

export default function TallyIntegrationPage() {
  const { isOwner } = useAuth()
  const ui = useUI()
  const [parsedData, setParsedData] = useState(null)
  const [importing, setImporting] = useState(false)
  const [importSuccess, setImportSuccess] = useState(null)
  const [error, setError] = useState(null)
  const fileInputRef = useRef(null)

  // Handle file select
  async function handleFileSelect(e) {
    const file = e.target.files?.[0]
    if (!file) return

    setError(null)
    setImportSuccess(null)

    try {
      if (file.name.endsWith('.xml')) {
        const text = await file.text()
        const parsed = parseTallyXml(text)
        setParsedData(parsed)
      } else if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls') || file.name.endsWith('.csv')) {
        const parsed = await parseTallyExcel(file)
        setParsedData(parsed)
      } else {
        setError('Unsupported format. Please upload a Tally XML export or Excel (.xlsx/.xls) Day Book.')
      }
    } catch (err) {
      console.error(err)
      setError('Failed to parse file: ' + err.message)
    }
  }

  // Load Built-in Sample Tally Prime Dataset
  function loadSampleData() {
    try {
      setError(null)
      setImportSuccess(null)
      const parsed = parseTallyXml(SAMPLE_TALLY_XML)
      setParsedData(parsed)
    } catch (err) {
      setError(err.message)
    }
  }

  // Execute Import into Accounting Database (all-or-nothing)
  async function executeImport() {
    if (isOwner || !parsedData) return
    setImporting(true)
    setError(null)
    try {
      const result = await importTallyData(parsedData)
      setImportSuccess(result)
      ui.toast(`Imported ${result.vouchers} voucher(s)` + (result.skipped ? `, skipped ${result.skipped} duplicate/empty` : ''))
    } catch (err) {
      console.error(err)
      setError('Import failed and nothing was changed: ' + err.message)
    }
    setImporting(false)
  }

  // Export current system data to Tally XML
  async function handleExportTallyXml() {
    const vouchers = await accDb.vouchers.toArray()
    const materials = await accDb.materials.toArray()
    const parties = await accDb.parties.toArray()
    const ledgers = await accDb.ledgers.toArray()

    const xml = generateTallyExportXml({ vouchers, materials, parties, ledgers })
    const blob = new Blob([xml], { type: 'application/xml' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `Tally_Export_${todayISO()}.xml`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans pb-16">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 pt-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-2">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight flex items-center gap-2.5">
                <FileSpreadsheet className="w-7 h-7 text-teal-600" />
                <span>Tally Integration Engine</span>
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-teal-50 text-teal-700 border border-teal-200">
                Tally ERP 9 / Prime XML & Excel
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-600 mt-1">
              Complete understanding of Tally exported vouchers, ledgers, and stock masters with 2-way import & export.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleExportTallyXml}
              className="px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 shadow-xs"
            >
              <Download className="w-4 h-4 text-blue-600" />
              <span>Export Tally XML</span>
            </button>

            <button
              type="button"
              onClick={loadSampleData}
              className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold shadow-xs flex items-center gap-1.5 transition-all active:scale-95"
            >
              <Sparkles className="w-4 h-4" />
              <span>Load Sample Tally File</span>
            </button>
          </div>
        </div>

        {/* Upload Box */}
        <div className="bg-white rounded-xl p-6 border-2 border-dashed border-slate-300 hover:border-teal-500 transition-colors shadow-xs text-center space-y-4">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelect}
            accept=".xml,.xlsx,.xls,.csv"
            className="hidden"
          />

          <div className="w-14 h-14 rounded-2xl bg-teal-50 text-teal-600 flex items-center justify-center mx-auto border border-teal-200 shadow-inner">
            <Upload className="w-7 h-7" />
          </div>

          <div>
            <h3 className="text-base font-bold text-slate-900">Upload Tally Export File</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto font-medium">
              Select standard Tally XML export (Vouchers &amp; Masters) or Tally Day Book Excel / CSV file.
            </p>
          </div>

          <div className="flex items-center justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer"
            >
              Select File from Computer
            </button>
            <button
              type="button"
              onClick={loadSampleData}
              className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors cursor-pointer border border-slate-200"
            >
              Use Built-in Demo Data
            </button>
          </div>
        </div>

        {/* Status / Error Notices */}
        {error && (
          <div className="p-4 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs font-bold flex items-center gap-2.5">
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {importSuccess && (
          <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-xl text-xs font-semibold flex items-center justify-between gap-2.5">
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              <span>
                Successfully imported into accounting database: <strong>{importSuccess.vouchers} vouchers</strong>, <strong>{importSuccess.ledgers} masters/parties</strong>, and <strong>{importSuccess.materials} stock items</strong>.
              </span>
            </div>
            <a
              href="/daybook"
              className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-bold hover:bg-emerald-700 transition-colors shadow-xs"
            >
              View in Day Book →
            </a>
          </div>
        )}

        {/* Parsed Inspection Preview */}
        {parsedData && (
          <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-xs space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-200 gap-4">
              <div>
                <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Database className="w-5 h-5 text-teal-600" />
                  <span>Parsed Tally Structure Preview</span>
                </h2>
                <p className="text-xs text-slate-500 font-medium">Review discovered vouchers and masters before importing</p>
              </div>

              {!isOwner ? (
                <button
                  type="button"
                  onClick={executeImport}
                  disabled={importing}
                  className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50"
                >
                  {importing ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Importing...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Import All Data into SaaS App</span>
                    </>
                  )}
                </button>
              ) : (
                <div className="px-4 py-2 bg-slate-100 text-slate-600 rounded-xl text-xs font-bold border border-slate-200">
                  Read & Track Only (Owner Mode)
                </div>
              )}
            </div>

            {/* Discovered Counts */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Vouchers</span>
                <div className="text-xl font-black text-slate-900 mt-1">
                  {parsedData.vouchers?.length || 0}
                </div>
              </div>

              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Party / Ledgers</span>
                <div className="text-xl font-black text-teal-700 mt-1">
                  {parsedData.ledgers?.length || 0}
                </div>
              </div>

              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Stock Materials</span>
                <div className="text-xl font-black text-blue-700 mt-1">
                  {parsedData.stockItems?.length || 0}
                </div>
              </div>

              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Sales / Invoices</span>
                <div className="text-xl font-black text-emerald-700 mt-1">
                  {parsedData.stats?.salesCount || parsedData.vouchers?.filter(v => v.voucher_type === 'sales').length || 0}
                </div>
              </div>
            </div>

            {/* Sample Table Preview */}
            <div className="space-y-2">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                Discovered Vouchers Sample (First 5)
              </span>
              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 text-slate-700 uppercase text-[10px] font-bold border-b border-slate-200">
                    <tr>
                      <th className="py-2.5 px-3">Date</th>
                      <th className="py-2.5 px-3">Voucher No.</th>
                      <th className="py-2.5 px-3">Type</th>
                      <th className="py-2.5 px-3">Party Name</th>
                      <th className="py-2.5 px-3 text-right">Amount (₹)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium">
                    {parsedData.vouchers?.slice(0, 5).map((v, i) => (
                      <tr key={i} className="hover:bg-slate-50 transition-colors">
                        <td className="py-2.5 px-3 text-slate-600 font-mono">{v.date}</td>
                        <td className="py-2.5 px-3 font-mono font-black text-slate-900">{v.voucher_no}</td>
                        <td className="py-2.5 px-3 uppercase text-[10px] font-bold text-blue-700">{v.voucher_type}</td>
                        <td className="py-2.5 px-3 text-slate-900 font-semibold">{v.party_name}</td>
                        <td className="py-2.5 px-3 text-right font-black text-slate-900">
                          ₹{Number(v.amount || 0).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
