import { useCallback, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabaseClient'
import { db, addToQueue } from '../lib/db'
import { submitQueue } from '../lib/sync'
import ScannerView from '../components/ScannerView'
import QueueList from '../components/QueueList'
import Nav from '../components/Nav'

export default function ScanPage() {
  const { user, isOwner } = useAuth()
  const [direction, setDirection] = useState('out') // 'in' | 'out'
  const [status, setStatus] = useState(null)
  const [statusType, setStatusType] = useState('info') // 'info' | 'success' | 'warning' | 'error'
  const [submitting, setSubmitting] = useState(false)
  const [unknownSku, setUnknownSku] = useState(null)
  const [quickAdd, setQuickAdd] = useState({ name: '', model: '' })
  const [addingMaterial, setAddingMaterial] = useState(false)
  const [manualSku, setManualSku] = useState('')

  const queueItems = useLiveQuery(() => db.queue.toArray(), []) || []
  const validItemsCount = queueItems.filter((i) => Number(i.qty) > 0).length

  const handleScan = useCallback(
    async (rawSku) => {
      const sku = rawSku.trim()
      if (!sku) return

      let name = null
      try {
        const { data } = await supabase.from('materials').select('name').eq('sku', sku).single()
        name = data?.name ?? null
        if (name) await db.materialsCache.put({ sku, name, updatedAt: new Date().toISOString() })
      } catch {
        const cached = await db.materialsCache.get(sku)
        name = cached?.name ?? null
      }

      if (!name && isOwner) {
        setUnknownSku(sku)
        setQuickAdd({ name: '', model: '' })
        setStatusType('warning')
        setStatus(`Unregistered SKU: ${sku}. Fill details to register.`)
        return
      }

      await addToQueue({ sku, name, direction })
      if (name) {
        setStatusType('success')
        setStatus(`✓ Added "${name}" to queue (${direction === 'in' ? 'Inward' : 'Outward'})`)
      } else {
        setStatusType('warning')
        setStatus(`Added unregistered SKU (${sku}) — ask owner to register before syncing`)
      }
    },
    [direction, isOwner]
  )

  function handleManualSubmit(e) {
    e.preventDefault()
    if (!manualSku.trim()) return
    handleScan(manualSku.trim())
    setManualSku('')
  }

  async function handleQuickAdd(e) {
    e.preventDefault()
    setAddingMaterial(true)
    const { error } = await supabase.from('materials').insert({
      sku: unknownSku,
      name: quickAdd.name.trim(),
      model: quickAdd.model.trim() || null,
    })
    setAddingMaterial(false)

    if (error) {
      setStatusType('error')
      setStatus(`Could not register: ${error.message}`)
      return
    }

    await db.materialsCache.put({
      sku: unknownSku,
      name: quickAdd.name.trim(),
      updatedAt: new Date().toISOString(),
    })
    await addToQueue({ sku: unknownSku, name: quickAdd.name.trim(), direction })
    setStatusType('success')
    setStatus(`✓ Registered "${quickAdd.name.trim()}" and added to queue`)
    setUnknownSku(null)
  }

  async function handleSubmit() {
    if (queueItems.length === 0) return
    setSubmitting(true)
    const result = await submitQueue(user.id)
    setSubmitting(false)

    if (result.succeeded > 0) {
      setStatusType('success')
      setStatus(
        `✓ Successfully synced ${result.succeeded} item(s)! ${
          result.skipped > 0 ? `(${result.skipped} skipped without qty)` : ''
        }`
      )
    } else if (result.skipped > 0) {
      setStatusType('warning')
      setStatus(`Fill in quantities before submitting (${result.skipped} pending)`)
    } else if (result.failed > 0) {
      setStatusType('error')
      setStatus(`Sync failed for ${result.failed} item(s). Will retry automatically when online.`)
    }
  }

  return (
    <div className="app-layout">
      <Nav />
      <main className="page-container">
        {/* Page Title & Direction Selector */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h1>QR Scanner</h1>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600 }}>
            Mode: <strong style={{ color: direction === 'in' ? 'var(--inward-dark)' : 'var(--outward-dark)' }}>{direction === 'in' ? 'INWARD' : 'OUTWARD'}</strong>
          </span>
        </div>

        {/* Direction Segmented Toggle */}
        <div className="direction-segmented">
          <button
            type="button"
            className={`segmented-option ${direction === 'in' ? 'active-in' : ''}`}
            onClick={() => setDirection('in')}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <polyline points="19 12 12 19 5 12" />
            </svg>
            Inward (Stock In)
          </button>
          <button
            type="button"
            className={`segmented-option ${direction === 'out' ? 'active-out' : ''}`}
            onClick={() => setDirection('out')}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="19" x2="12" y2="5" />
              <polyline points="5 12 12 5 19 12" />
            </svg>
            Outward (Stock Out)
          </button>
        </div>

        {/* Camera Scanner View */}
        <ScannerView onScan={handleScan} />

        {/* Manual SKU Entry Bar */}
        <form onSubmit={handleManualSubmit} className="manual-sku-bar">
          <input
            type="text"
            placeholder="Type or paste SKU manually..."
            value={manualSku}
            onChange={(e) => setManualSku(e.target.value)}
          />
          <button type="submit" className="btn-outline">
            Add
          </button>
        </form>

        {/* Status Toast Alert */}
        {status && (
          <div className={`toast-banner toast-${statusType}`}>
            <span>{status}</span>
          </div>
        )}

        {/* Quick Add Form Modal for Unregistered QR */}
        {unknownSku && (
          <div className="modal-backdrop">
            <div className="modal-content">
              <div className="modal-header">
                <div>
                  <h2>Register New Material</h2>
                  <p>QR SKU: <strong style={{ fontFamily: 'monospace' }}>{unknownSku}</strong></p>
                </div>
                <button type="button" className="btn-ghost btn-icon" onClick={() => setUnknownSku(null)}>✕</button>
              </div>

              <form onSubmit={handleQuickAdd}>
                <div className="form-group">
                  <label>Material Name</label>
                  <input
                    placeholder="e.g. Cotton T-Shirt White"
                    value={quickAdd.name}
                    onChange={(e) => setQuickAdd({ ...quickAdd, name: e.target.value })}
                    required
                    autoFocus
                  />
                </div>
                <div className="form-group">
                  <label>Model / Variant (Optional)</label>
                  <input
                    placeholder="e.g. Size L / SKU-01"
                    value={quickAdd.model}
                    onChange={(e) => setQuickAdd({ ...quickAdd, model: e.target.value })}
                  />
                </div>
                <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
                  <button type="submit" className="btn-primary" style={{ flex: 1 }} disabled={addingMaterial}>
                    {addingMaterial ? 'Registering...' : 'Register & Add to Queue'}
                  </button>
                  <button type="button" className="btn-outline" onClick={() => setUnknownSku(null)}>
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Queue Section */}
        <div className="section-header">
          <h2>Scan Queue</h2>
          {queueItems.length > 0 && (
            <span className="count-badge">
              {queueItems.length} {queueItems.length === 1 ? 'item' : 'items'} ({validItemsCount} ready)
            </span>
          )}
        </div>

        <QueueList />

        {/* Submit Action Bar */}
        {queueItems.length > 0 && (
          <div className="submit-action-bar">
            <button
              type="button"
              className="btn-submit-large"
              onClick={handleSubmit}
              disabled={submitting || validItemsCount === 0}
            >
              {submitting ? (
                'Syncing Queue to Cloud...'
              ) : (
                <>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                  Submit Queue ({validItemsCount} of {queueItems.length} items)
                </>
              )}
            </button>
          </div>
        )}
      </main>
    </div>
  )
}
