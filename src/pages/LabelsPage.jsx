import { useEffect, useState, useMemo } from 'react'
import QRCode from 'qrcode'
import { motion, AnimatePresence } from 'framer-motion'
import { Printer, Search, CheckSquare, Square, QrCode, Tag, Trash2, Link2, Unlink, X, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { getAllSupplierModelLabels, deleteSupplierModelLabel } from '../lib/modelLabelResolver'
import Nav from '../components/Nav'

export default function LabelsPage() {
  const [materials, setMaterials] = useState([])
  const [labels, setLabels] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(new Set())
  const [search, setSearch] = useState('')

  // Supplier label mappings state
  const [activeTab, setActiveTab] = useState('qr') // 'qr' | 'supplier'
  const [supplierLabels, setSupplierLabels] = useState([])
  const [supplierLoading, setSupplierLoading] = useState(false)
  const [supplierSearch, setSupplierSearch] = useState('')
  const [deletingId, setDeletingId] = useState(null)
  const [toast, setToast] = useState(null)

  useEffect(() => {
    load()
  }, [])

  useEffect(() => {
    if (activeTab === 'supplier') loadSupplierLabels()
  }, [activeTab])

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('materials').select('sku, name, model').order('name')
    const list = data || []
    setMaterials(list)
    setSelected(new Set(list.map((m) => m.sku)))

    const generated = await Promise.all(
      list.map(async (m) => ({
        ...m,
        dataUrl: await QRCode.toDataURL(m.sku, {
          width: 320,
          margin: 1,
          color: {
            dark: '#0f172a',
            light: '#ffffff',
          },
        }),
      }))
    )
    setLabels(generated)
    setLoading(false)
  }

  async function loadSupplierLabels() {
    setSupplierLoading(true)
    const { data } = await getAllSupplierModelLabels(supabase)
    setSupplierLabels(data || [])
    setSupplierLoading(false)
  }

  async function handleDeleteMapping(id) {
    setDeletingId(id)
    const { error } = await deleteSupplierModelLabel(supabase, id)
    setDeletingId(null)
    if (error) {
      setToast({ type: 'error', message: `Could not delete: ${error.message}` })
    } else {
      setToast({ type: 'success', message: 'Label mapping deleted' })
      setSupplierLabels((prev) => prev.filter((l) => l.id !== id))
    }
    setTimeout(() => setToast(null), 3000)
  }

  function toggle(sku) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(sku)) next.delete(sku)
      else next.add(sku)
      return next
    })
  }

  function selectAll() {
    setSelected(new Set(materials.map((m) => m.sku)))
  }

  function selectNone() {
    setSelected(new Set())
  }

  const filteredMaterials = useMemo(() => {
    const q = search.toLowerCase().trim()
    return materials.filter(
      (m) =>
        !q ||
        m.name?.toLowerCase().includes(q) ||
        m.sku?.toLowerCase().includes(q) ||
        (m.model && m.model.toLowerCase().includes(q))
    )
  }, [materials, search])

  const filteredSupplierLabels = useMemo(() => {
    const q = supplierSearch.toLowerCase().trim()
    if (!q) return supplierLabels
    return supplierLabels.filter(
      (l) =>
        l.label_code?.toLowerCase().includes(q) ||
        l.canonical_model?.toLowerCase().includes(q) ||
        l.material?.name?.toLowerCase().includes(q) ||
        l.material?.sku?.toLowerCase().includes(q)
    )
  }, [supplierLabels, supplierSearch])

  const visibleLabels = labels.filter((l) => selected.has(l.sku))

  const linkedCount = supplierLabels.filter((l) => l.material_id).length
  const unllinkedCount = supplierLabels.length - linkedCount

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      <Nav />

      <main className="w-full max-w-6xl mx-auto px-4 pt-5 pb-28 sm:py-8 flex-1">
        <div className="no-print">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
            <div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2.5">
                <Tag className="w-7 h-7 text-blue-600" />
                Labels & Mappings
              </h1>
              <p className="text-xs sm:text-sm text-slate-500 mt-1">
                Generate QR shelf labels & manage supplier label → material mappings
              </p>
            </div>
          </div>

          {/* Tab Switcher */}
          <div className="grid grid-cols-2 gap-2 p-1.5 bg-slate-200/80 rounded-2xl border border-slate-300/60 mb-6 shadow-inner">
            <button
              type="button"
              onClick={() => setActiveTab('qr')}
              className={`flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-bold text-sm transition-all duration-200 active:scale-[0.98] ${
                activeTab === 'qr'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                  : 'text-slate-700 hover:text-slate-900 hover:bg-slate-200/50'
              }`}
            >
              <QrCode className={`w-5 h-5 ${activeTab === 'qr' ? 'text-white' : 'text-blue-600'}`} />
              <span>QR Shelf Labels</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('supplier')}
              className={`relative flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-bold text-sm transition-all duration-200 active:scale-[0.98] ${
                activeTab === 'supplier'
                  ? 'bg-amber-600 text-white shadow-md shadow-amber-600/30'
                  : 'text-slate-700 hover:text-slate-900 hover:bg-slate-200/50'
              }`}
            >
              <Tag className={`w-5 h-5 ${activeTab === 'supplier' ? 'text-white' : 'text-amber-600'}`} />
              <span>Supplier Mappings</span>
              {supplierLabels.length > 0 && (
                <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-black ${
                  activeTab === 'supplier' ? 'bg-white/20 text-white' : 'bg-amber-100 text-amber-700'
                }`}>
                  {supplierLabels.length}
                </span>
              )}
            </button>
          </div>

          {/* Toast notification */}
          <AnimatePresence>
            {toast && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className={`flex items-center justify-between gap-3 p-3 rounded-xl text-xs font-medium mb-4 border ${
                  toast.type === 'success'
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                    : 'bg-rose-50 text-rose-800 border-rose-200'
                }`}
              >
                <div className="flex items-center gap-2">
                  {toast.type === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-rose-600" />
                  )}
                  <span>{toast.message}</span>
                </div>
                <button type="button" onClick={() => setToast(null)} className="p-1 text-slate-400 hover:text-slate-600">
                  <X className="w-3.5 h-3.5" />
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* QR Shelf Labels Tab */}
        {activeTab === 'qr' && (
          <>
            <div className="no-print">
              <div className="flex items-center justify-between mb-4">
                <div />
                <button
                  type="button"
                  onClick={() => window.print()}
                  disabled={visibleLabels.length === 0}
                  className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm rounded-2xl shadow-md shadow-blue-600/25 active:scale-95 transition-all disabled:opacity-50"
                >
                  <Printer className="w-4 h-4" />
                  <span>Print {visibleLabels.length} Label{visibleLabels.length === 1 ? '' : 's'}</span>
                </button>
              </div>

              {loading ? (
                <div className="py-16 text-center text-slate-400">
                  <div className="w-8 h-8 border-3 border-slate-300 border-t-blue-600 rounded-full animate-spin mx-auto mb-2" />
                  <p className="text-xs font-medium">Generating QR label sheet...</p>
                </div>
              ) : (
                <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200 shadow-sm mb-8">
                  {/* Batch Actions & Search */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={selectAll}
                        className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-colors flex items-center gap-1.5"
                      >
                        <CheckSquare className="w-3.5 h-3.5" /> Select All ({materials.length})
                      </button>
                      <button
                        type="button"
                        onClick={selectNone}
                        className="px-3.5 py-1.5 text-slate-500 hover:text-slate-800 font-bold text-xs rounded-xl transition-colors flex items-center gap-1.5"
                      >
                        <Square className="w-3.5 h-3.5" /> Clear All
                      </button>
                    </div>

                    <div className="relative w-full sm:w-72">
                      <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input
                        type="text"
                        placeholder="Filter labels..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full pl-9 pr-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                      />
                    </div>
                  </div>

                  {/* Checklist Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 max-h-56 overflow-y-auto p-1">
                    {filteredMaterials.map((m) => (
                      <label
                        key={m.sku}
                        className={`flex items-center gap-2.5 p-2.5 rounded-xl border cursor-pointer transition-all ${
                          selected.has(m.sku)
                            ? 'bg-blue-50/60 border-blue-200 text-blue-900'
                            : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={selected.has(m.sku)}
                          onChange={() => toggle(m.sku)}
                          className="w-4 h-4 rounded text-blue-600 accent-blue-600"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-bold truncate">{m.name}</div>
                          <div className="text-[11px] font-mono text-slate-400 truncate">{m.sku}</div>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Printable Grid Sheet */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 print:grid-cols-3 print:gap-4">
              {visibleLabels.map((l) => (
                <div
                  key={l.sku}
                  className="bg-white border-2 border-slate-900 rounded-2xl p-4 flex flex-col items-center justify-center text-center shadow-sm break-inside-avoid print:shadow-none print:rounded-none"
                >
                  <img
                    src={l.dataUrl}
                    alt={`QR for ${l.name}`}
                    className="w-32 h-32 object-contain block mb-2"
                  />
                  <div className="font-extrabold text-slate-900 text-xs line-clamp-2 leading-snug">
                    {l.name}
                  </div>
                  {l.model && (
                    <div className="text-[11px] font-medium text-slate-500 mt-0.5">{l.model}</div>
                  )}
                  <div className="font-mono font-black text-xs text-slate-950 mt-1 bg-slate-100 px-2 py-0.5 rounded border border-slate-300">
                    {l.sku}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Supplier Label Mappings Tab */}
        {activeTab === 'supplier' && (
          <div className="no-print">
            {/* Stats Bar */}
            <div className="grid grid-cols-3 gap-3 mb-5">
              <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm text-center">
                <div className="text-2xl font-black text-slate-900">{supplierLabels.length}</div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mt-1">Total Mappings</div>
              </div>
              <div className="bg-white rounded-2xl p-4 border border-emerald-200 shadow-sm text-center">
                <div className="text-2xl font-black text-emerald-700">{linkedCount}</div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-500 mt-1 flex items-center justify-center gap-1">
                  <Link2 className="w-3 h-3" /> Linked
                </div>
              </div>
              <div className="bg-white rounded-2xl p-4 border border-amber-200 shadow-sm text-center">
                <div className="text-2xl font-black text-amber-700">{unllinkedCount}</div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-amber-500 mt-1 flex items-center justify-center gap-1">
                  <Unlink className="w-3 h-3" /> Model Only
                </div>
              </div>
            </div>

            <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                <div>
                  <h2 className="text-base font-bold text-slate-900">Supplier Label → Material Mappings</h2>
                  <p className="text-[11px] text-slate-500 mt-0.5">These are learned during inward scanning. <span className="font-bold text-emerald-600">Linked</span> labels auto-queue during sales.</p>
                </div>
                <div className="relative w-full sm:w-72">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search labels, models, materials..."
                    value={supplierSearch}
                    onChange={(e) => setSupplierSearch(e.target.value)}
                    className="w-full pl-9 pr-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              </div>

              {supplierLoading ? (
                <div className="py-12 text-center text-slate-400">
                  <div className="w-8 h-8 border-3 border-slate-300 border-t-amber-500 rounded-full animate-spin mx-auto mb-2" />
                  <p className="text-xs font-medium">Loading supplier label mappings...</p>
                </div>
              ) : filteredSupplierLabels.length === 0 ? (
                <div className="py-12 text-center">
                  <Tag className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                  <p className="text-sm font-semibold text-slate-500">
                    {supplierLabels.length === 0
                      ? 'No supplier labels mapped yet'
                      : 'No mappings match your search'}
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    {supplierLabels.length === 0
                      ? 'Scan an unknown label during Inward mode to teach the app'
                      : 'Try a different search term'}
                  </p>
                </div>
              ) : (
                <div className="space-y-2 max-h-[60vh] overflow-y-auto">
                  {filteredSupplierLabels.map((label) => (
                    <div
                      key={label.id}
                      className={`flex items-center justify-between gap-3 p-3.5 rounded-2xl border transition-colors ${
                        label.material_id
                          ? 'bg-emerald-50/50 border-emerald-200 hover:bg-emerald-50'
                          : 'bg-amber-50/50 border-amber-200 hover:bg-amber-50'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-mono font-black text-sm text-slate-900 bg-white px-2 py-0.5 rounded-lg border border-slate-200 shadow-xs">
                            {label.label_code}
                          </span>
                          <span className="text-slate-400 text-xs">→</span>
                          <span className="font-bold text-sm text-slate-800">{label.canonical_model}</span>
                        </div>
                        <div className="flex items-center gap-2 text-[11px]">
                          {label.material_id && label.material ? (
                            <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold">
                              <Link2 className="w-3 h-3" />
                              Linked to: <span className="font-bold">{label.material.name}</span>
                              <span className="font-mono text-slate-400 ml-1">({label.material.sku})</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-amber-700 font-semibold">
                              <Unlink className="w-3 h-3" />
                              Model only — will show material picker during scan
                            </span>
                          )}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleDeleteMapping(label.id)}
                        disabled={deletingId === label.id}
                        className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors disabled:opacity-50 shrink-0"
                        title="Delete this mapping"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
