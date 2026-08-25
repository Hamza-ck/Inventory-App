import { useEffect, useState, useMemo } from 'react'
import QRCode from 'qrcode'
import { motion } from 'framer-motion'
import { Printer, Search, CheckSquare, Square, QrCode } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import Nav from '../components/Nav'

export default function LabelsPage() {
  const [materials, setMaterials] = useState([])
  const [labels, setLabels] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(new Set())
  const [search, setSearch] = useState('')

  useEffect(() => {
    load()
  }, [])

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

  const visibleLabels = labels.filter((l) => selected.has(l.sku))

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      <Nav />

      <main className="w-full max-w-6xl mx-auto px-4 pt-5 pb-28 sm:py-8 flex-1">
        <div className="no-print">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
            <div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2.5">
                <Printer className="w-7 h-7 text-blue-600" />
                QR Shelf Labels
              </h1>
              <p className="text-xs sm:text-sm text-slate-500 mt-1">
                Generate high-resolution printable QR code stickers for warehouse bins & shelves
              </p>
            </div>

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
      </main>
    </div>
  )
}
