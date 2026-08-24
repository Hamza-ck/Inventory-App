import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
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

  const filteredMaterials = materials.filter(
    (m) =>
      m.name.toLowerCase().includes(search.toLowerCase()) ||
      m.sku.toLowerCase().includes(search.toLowerCase())
  )

  const visibleLabels = labels.filter((l) => selected.has(l.sku))

  return (
    <div className="app-layout">
      <Nav />
      <main className="page-container">
        <div className="no-print">
          <div style={{ marginBottom: 20 }}>
            <h1>QR Shelf Labels</h1>
            <p>Generate high-resolution printable QR code stickers for bins & shelves</p>
          </div>

          {loading ? (
            <p style={{ color: 'var(--text-muted)' }}>Generating QR label sheet...</p>
          ) : (
            <div className="labels-controls">
              {/* Batch Actions and Search */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'space-between', marginBottom: 14 }}>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" className="btn-outline" style={{ padding: '6px 12px', fontSize: '0.825rem' }} onClick={selectAll}>
                    Select All ({materials.length})
                  </button>
                  <button type="button" className="btn-ghost" style={{ padding: '6px 12px', fontSize: '0.825rem' }} onClick={selectNone}>
                    Clear All
                  </button>
                </div>

                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => window.print()}
                  disabled={visibleLabels.length === 0}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="6 9 6 2 18 2 18 9" />
                    <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                    <rect x="6" y="14" width="12" height="8" />
                  </svg>
                  Print {visibleLabels.length} Label{visibleLabels.length === 1 ? '' : 's'}
                </button>
              </div>

              {/* Quick Search */}
              <div className="search-input-wrapper" style={{ marginBottom: 12 }}>
                <svg className="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                  type="text"
                  placeholder="Filter labels to print..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>

              {/* Checkbox Grid */}
              <div className="label-checklist">
                {filteredMaterials.map((m) => (
                  <label key={m.sku} className="label-check-item">
                    <input
                      type="checkbox"
                      checked={selected.has(m.sku)}
                      onChange={() => toggle(m.sku)}
                      style={{ width: 16, height: 16, accentColor: 'var(--primary)' }}
                    />
                    <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {m.name}
                    </span>
                    <span style={{ fontSize: '0.725rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                      {m.sku}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Printable Grid Sheet */}
        <div className="label-sheet-grid">
          {visibleLabels.map((l) => (
            <div key={l.sku} className="label-qr-card">
              <img src={l.dataUrl} alt={`QR Code for ${l.name}`} />
              <div className="label-qr-name">{l.name}</div>
              {l.model && <div style={{ fontSize: '0.725rem', color: 'var(--text-muted)' }}>{l.model}</div>}
              <div className="label-qr-sku">{l.sku}</div>
            </div>
          ))}
        </div>
      </main>
    </div>
  )
}
