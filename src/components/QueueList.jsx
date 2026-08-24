import { useLiveQuery } from 'dexie-react-hooks'
import { db, updateQueueQty, removeFromQueue } from '../lib/db'

export default function QueueList() {
  const items = useLiveQuery(() => db.queue.orderBy('createdAt').reverse().toArray(), [])

  if (!items) return null
  if (items.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '36px 16px', background: 'var(--bg-card)', border: '1px dashed var(--border)', borderRadius: 'var(--radius-lg)', marginBottom: 20 }}>
        <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--bg-surface)', margin: '0 auto 12px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-subtle)' }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
            <line x1="3" y1="6" x2="21" y2="6" />
            <path d="M16 10a4 4 0 0 1-8 0" />
          </svg>
        </div>
        <p style={{ fontWeight: 600, color: 'var(--text-main)', marginBottom: 4 }}>Scan Queue is Empty</p>
        <p style={{ fontSize: '0.825rem', color: 'var(--text-muted)' }}>Scan a QR code or type a SKU above to add inward or outward items.</p>
      </div>
    )
  }

  function adjustQty(id, currentQty, delta) {
    const current = Number(currentQty) || 0
    const next = Math.max(0, current + delta)
    updateQueueQty(id, next === 0 ? '' : String(next))
  }

  return (
    <div className="queue-cards">
      {items.map((item) => {
        const qtyNum = Number(item.qty) || 0
        return (
          <div key={item.id} className="queue-card">
            <div className="queue-card-top">
              <div>
                <div className="queue-card-title">{item.name || 'Unregistered Material'}</div>
                <span className="queue-card-sku">SKU: {item.sku}</span>
              </div>
              <span className={`dir-badge ${item.direction}`}>
                {item.direction === 'in' ? '⬇ Inward' : '⬆ Outward'}
              </span>
            </div>

            <div className="queue-card-bottom">
              {/* Stepper Input */}
              <div className="stepper-container">
                <button
                  type="button"
                  className="stepper-btn"
                  onClick={() => adjustQty(item.id, item.qty, -1)}
                  aria-label="Decrease quantity"
                >
                  −
                </button>
                <input
                  type="number"
                  min="0"
                  inputMode="numeric"
                  placeholder="Qty"
                  value={item.qty}
                  onChange={(e) => updateQueueQty(item.id, e.target.value)}
                  className="stepper-input"
                />
                <button
                  type="button"
                  className="stepper-btn"
                  onClick={() => adjustQty(item.id, item.qty, 1)}
                  aria-label="Increase quantity"
                >
                  +
                </button>
              </div>

              {/* Quick Presets */}
              <div className="preset-chips">
                <button
                  type="button"
                  className="preset-chip"
                  onClick={() => adjustQty(item.id, item.qty, 5)}
                >
                  +5
                </button>
                <button
                  type="button"
                  className="preset-chip"
                  onClick={() => adjustQty(item.id, item.qty, 10)}
                >
                  +10
                </button>
                <button
                  type="button"
                  className="preset-chip"
                  onClick={() => adjustQty(item.id, item.qty, 50)}
                >
                  +50
                </button>
              </div>

              {/* Delete Button */}
              <button
                type="button"
                className="btn-ghost"
                style={{ color: 'var(--outward)', padding: '6px', marginLeft: 'auto' }}
                onClick={() => removeFromQueue(item.id)}
                aria-label="Remove item"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
