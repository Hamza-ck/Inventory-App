import { useState, useRef } from 'react'
import { motion } from 'framer-motion'
import { 
  FileSpreadsheet, 
  Upload, 
  Download, 
  CheckCircle2, 
  AlertCircle, 
  Sparkles, 
  FileCode, 
  Layers, 
  ArrowRight,
  Database,
  Building2,
  Package,
  Receipt
} from 'lucide-react'
import { 
  parseTallyXml, 
  parseTallyExcel, 
  generateTallyExportXml, 
  SAMPLE_TALLY_XML 
} from '../lib/tallyParser'
import { accDb, createVoucher } from '../lib/accountingDb'
import { useAuth } from '../context/AuthContext'
import Nav from '../components/Nav'

export default function TallyIntegrationPage() {
  const { isAdmin, isOwner } = useAuth()
  const [xmlContent, setXmlContent] = useState('')
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
        setXmlContent(text)
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
      setXmlContent(SAMPLE_TALLY_XML)
      const parsed = parseTallyXml(SAMPLE_TALLY_XML)
      setParsedData(parsed)
    } catch (err) {
      setError(err.message)
    }
  }

  // Execute Import into Accounting Database
  async function executeImport() {
    if (isOwner) {
      alert('Owner account is in Read and Track mode. Only Admin can import vouchers.')
      return
    }
    if (!parsedData) return

    setImporting(true)
    setError(null)

    try {
      let importedLedgers = 0
      let importedMaterials = 0
      let importedVouchers = 0

      // 1. Import Masters (Ledgers & Parties)
      if (Array.isArray(parsedData.ledgers) && parsedData.ledgers.length > 0) {
        for (const l of parsedData.ledgers) {
          const groupLower = (l.group || '').toLowerCase()
          const isDebtor = groupLower.includes('debtor')
          const isCreditor = groupLower.includes('creditor')

          if (isDebtor || isCreditor) {
            const existing = await accDb.parties.where('name').equalsIgnoreCase(l.name).first()
            if (!existing) {
              await accDb.parties.add({
                name: l.name,
                type: isDebtor ? 'debtor' : 'creditor',
                uid: l.uid || (isDebtor && l.opening_balance > 0 ? `UID-CUST-${Date.now().toString().slice(-4)}` : null),
                phone: l.phone || '',
                email: l.email || '',
                address: l.address || '',
                opening_balance: l.opening_balance || 0,
                current_balance: l.opening_balance || 0,
                created_at: new Date().toISOString(),
              })
              importedLedgers++
            }
          } else {
            const existing = await accDb.ledgers.where('name').equalsIgnoreCase(l.name).first()
            if (!existing) {
              await accDb.ledgers.add({
                name: l.name,
                group: l.group || 'General',
                opening_balance: l.opening_balance || 0,
                current_balance: l.opening_balance || 0,
                is_system: false,
              })
              importedLedgers++
            }
          }
        }
      }

      // 2. Import Stock Items / Materials
      if (Array.isArray(parsedData.stockItems) && parsedData.stockItems.length > 0) {
        for (const m of parsedData.stockItems) {
          const existing = await accDb.materials.where('name').equalsIgnoreCase(m.name).first()
          if (!existing) {
            await accDb.materials.add({
              sku: m.sku || `MAT-${Date.now().toString().slice(-4)}`,
              name: m.name,
              category: m.category || 'General',
              unit: m.unit || 'pcs',
              purchase_rate: m.purchase_rate || 100,
              sales_rate: m.sales_rate || 130,
              current_qty: m.current_qty || 0,
              reorder_threshold: m.reorder_threshold || 10,
            })
            importedMaterials++
          }
        }
      }

      // 3. Import Vouchers
      if (Array.isArray(parsedData.vouchers) && parsedData.vouchers.length > 0) {
        for (const v of parsedData.vouchers) {
          const existing = await accDb.vouchers.where('voucher_no').equals(v.voucher_no).first()
          if (!existing) {
            await createVoucher(v)
            importedVouchers++
          }
        }
      }

      setImporting(false)
      setImportSuccess({
        ledgers: importedLedgers,
        materials: importedMaterials,
        vouchers: importedVouchers,
      })

      // Notify other tabs
      window.dispatchEvent(new Event('accounting-data-updated'))
    } catch (err) {
      console.error(err)
      setError('Import error: ' + err.message)
      setImporting(false)
    }
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
    a.download = `Tally_Export_${new Date().toISOString().slice(0, 10)}.xml`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 font-sans pb-16">
      <Nav />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 pt-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-2">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight flex items-center gap-2.5">
                <FileSpreadsheet className="w-7 h-7 text-teal-400" />
                <span>Tally Integration Engine</span>
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-teal-500/20 text-teal-300 border border-teal-500/30">
                Tally ERP 9 / Prime XML & Excel
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-400 mt-1">
              Complete understanding of Tally exported vouchers, ledgers, and stock masters with 2-way import & export.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleExportTallyXml}
              className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5"
            >
              <Download className="w-4 h-4 text-blue-400" />
              <span>Export Tally XML</span>
            </button>

            <button
              type="button"
              onClick={loadSampleData}
              className="px-4 py-2 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 text-white rounded-xl text-xs font-bold shadow-md shadow-teal-600/30 flex items-center gap-1.5 transition-all active:scale-95"
            >
              <Sparkles className="w-4 h-4" />
              <span>Load Sample Tally File</span>
            </button>
          </div>
        </div>

        {/* Upload Box */}
        <div className="bg-slate-800/90 rounded-2xl p-6 border-2 border-dashed border-slate-700 hover:border-teal-500/60 transition-colors shadow-lg text-center space-y-4">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelect}
            accept=".xml,.xlsx,.xls,.csv"
            className="hidden"
          />

          <div className="w-14 h-14 rounded-2xl bg-teal-500/20 text-teal-400 flex items-center justify-center mx-auto shadow-inner">
            <Upload className="w-7 h-7" />
          </div>

          <div>
            <h3 className="text-base font-bold text-white">Upload Tally Export File</h3>
            <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
              Select standard Tally XML export (Vouchers &amp; Masters) or Tally Day Book Excel / CSV file.
            </p>
          </div>

          <div className="flex items-center justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-md shadow-blue-600/30 transition-all cursor-pointer"
            >
              Select File from Computer
            </button>
            <button
              type="button"
              onClick={loadSampleData}
              className="px-4 py-2.5 bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-bold rounded-xl transition-colors cursor-pointer"
            >
              Use Built-in Demo Data
            </button>
          </div>
        </div>

        {/* Status / Error Notices */}
        {error && (
          <div className="p-4 bg-rose-950/70 border border-rose-800 text-rose-200 rounded-2xl text-xs font-semibold flex items-center gap-2.5">
            <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {importSuccess && (
          <div className="p-4 bg-emerald-950/70 border border-emerald-800 text-emerald-200 rounded-2xl text-xs font-semibold flex items-center justify-between gap-2.5">
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
              <span>
                Successfully imported into accounting database: <strong>{importSuccess.vouchers} vouchers</strong>, <strong>{importSuccess.ledgers} masters/parties</strong>, and <strong>{importSuccess.materials} stock items</strong>.
              </span>
            </div>
            <a
              href="/daybook"
              className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-bold hover:bg-emerald-500 transition-colors"
            >
              View in Day Book →
            </a>
          </div>
        )}

        {/* Parsed Inspection Preview */}
        {parsedData && (
          <div className="bg-slate-800/90 rounded-2xl p-6 border border-slate-700/80 shadow-lg space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-700 gap-4">
              <div>
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <Database className="w-5 h-5 text-teal-400" />
                  <span>Parsed Tally Structure Preview</span>
                </h2>
                <p className="text-xs text-slate-400">Review discovered vouchers and masters before importing</p>
              </div>

              {!isOwner ? (
                <button
                  type="button"
                  onClick={executeImport}
                  disabled={importing}
                  className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-emerald-600/30 flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50"
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
                <div className="px-4 py-2 bg-slate-700 text-slate-400 rounded-xl text-xs font-bold">
                  Read & Track Only (Owner Mode)
                </div>
              )}
            </div>

            {/* Discovered Counts */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-slate-900/80 p-3.5 rounded-xl border border-slate-700">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Vouchers</span>
                <div className="text-xl font-black text-white mt-1">
                  {parsedData.vouchers?.length || 0}
                </div>
              </div>

              <div className="bg-slate-900/80 p-3.5 rounded-xl border border-slate-700">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Party / Ledgers</span>
                <div className="text-xl font-black text-teal-400 mt-1">
                  {parsedData.ledgers?.length || 0}
                </div>
              </div>

              <div className="bg-slate-900/80 p-3.5 rounded-xl border border-slate-700">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Stock Materials</span>
                <div className="text-xl font-black text-blue-400 mt-1">
                  {parsedData.stockItems?.length || 0}
                </div>
              </div>

              <div className="bg-slate-900/80 p-3.5 rounded-xl border border-slate-700">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Sales / Invoices</span>
                <div className="text-xl font-black text-emerald-400 mt-1">
                  {parsedData.stats?.salesCount || parsedData.vouchers?.filter(v => v.voucher_type === 'sales').length || 0}
                </div>
              </div>
            </div>

            {/* Sample Table Preview */}
            <div className="space-y-2">
              <span className="text-xs font-bold text-slate-300 uppercase tracking-wide">
                Discovered Vouchers Sample (First 5)
              </span>
              <div className="overflow-x-auto border border-slate-700 rounded-xl">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-900 text-slate-400 uppercase text-[10px] font-bold">
                    <tr>
                      <th className="py-2.5 px-3">Date</th>
                      <th className="py-2.5 px-3">Voucher No.</th>
                      <th className="py-2.5 px-3">Type</th>
                      <th className="py-2.5 px-3">Party Name</th>
                      <th className="py-2.5 px-3 text-right">Amount (₹)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 font-medium">
                    {parsedData.vouchers?.slice(0, 5).map((v, i) => (
                      <tr key={i} className="hover:bg-slate-800/40">
                        <td className="py-2.5 px-3 text-slate-300 font-mono">{v.date}</td>
                        <td className="py-2.5 px-3 font-mono text-white font-bold">{v.voucher_no}</td>
                        <td className="py-2.5 px-3 uppercase text-[10px] font-bold text-blue-400">{v.voucher_type}</td>
                        <td className="py-2.5 px-3 text-slate-200">{v.party_name}</td>
                        <td className="py-2.5 px-3 text-right font-bold text-white">
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
