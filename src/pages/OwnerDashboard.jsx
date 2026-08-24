import { useEffect, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { supabase } from '../lib/supabaseClient'
import Nav from '../components/Nav'

export default function OwnerDashboard() {
  const [materials, setMaterials] = useState([])
  const [recent, setRecent] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)
    const { data: materialsData } = await supabase
      .from('materials')
      .select('sku, name, current_qty, reorder_threshold')
      .order('current_qty', { ascending: true })

    const { data: txData } = await supabase
      .from('transactions')
      .select('qty, direction, created_at, materials(name)')
      .order('created_at', { ascending: false })
      .limit(10)

    setMaterials(materialsData || [])
    setRecent(txData || [])
    setLoading(false)
  }

  const lowStock = materials.filter((m) => Number(m.current_qty) <= Number(m.reorder_threshold ?? 0))
  const totalStockUnits = materials.reduce((acc, m) => acc + (Number(m.current_qty) || 0), 0)
  const chartData = materials.slice(0, 10).map((m) => ({
    name: m.name.length > 12 ? m.name.slice(0, 12) + '…' : m.name,
    fullName: m.name,
    qty: Number(m.current_qty),
  }))

  const inwardCount = recent.filter((r) => r.direction === 'in').length
  const outwardCount = recent.filter((r) => r.direction === 'out').length

  return (
    <div className="app-layout">
      <Nav />
      <main className="page-container">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <h1>Dashboard</h1>
            <p>Real-time stock analytics & inventory flow</p>
          </div>
          <button type="button" className="btn-outline" onClick={load} style={{ padding: '8px 12px' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 4 23 10 17 10" />
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
            </svg>
            <span className="desktop-nav-links">Refresh</span>
          </button>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)' }}>
            <div style={{ width: 40, height: 40, border: '3px solid var(--border)', borderTopColor: 'var(--primary)', borderRadius: '50%', margin: '0 auto 16px', animation: 'spin 1s linear infinite' }} />
            <p>Loading inventory metrics...</p>
            <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
          </div>
        ) : (
          <>
            {/* Stat Cards Grid */}
            <div className="stats-grid">
              <div className="stat-card">
                <span className="stat-label">Total SKUs</span>
                <span className="stat-value">{materials.length}</span>
              </div>
              <div className="stat-card">
                <span className="stat-label">Total Units</span>
                <span className="stat-value">{totalStockUnits.toLocaleString()}</span>
              </div>
              <div className={`stat-card ${lowStock.length > 0 ? 'warning' : ''}`}>
                <span className="stat-label">Low Stock</span>
                <span className="stat-value">{lowStock.length}</span>
              </div>
              <div className="stat-card">
                <span className="stat-label">Recent Moves</span>
                <span className="stat-value" style={{ fontSize: '1.2rem', display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ color: 'var(--inward-dark)' }}>+{inwardCount}</span>
                  <span style={{ color: 'var(--outward-dark)' }}>-{outwardCount}</span>
                </span>
              </div>
            </div>

            {/* Low Stock Warning Banner */}
            {lowStock.length > 0 && (
              <div className="toast-banner toast-warning" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 8, padding: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: '0.95rem' }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                    <line x1="12" y1="9" x2="12" y2="13" />
                    <line x1="12" y1="17" x2="12.01" y2="17" />
                  </svg>
                  <span>Action Needed: {lowStock.length} Material(s) at or below reorder threshold</span>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                  {lowStock.map((m) => (
                    <span key={m.sku} style={{ background: 'rgba(255,255,255,0.7)', border: '1px solid rgba(0,0,0,0.06)', borderRadius: 6, padding: '3px 8px', fontSize: '0.8rem', fontWeight: 600 }}>
                      {m.name}: <strong>{m.current_qty}</strong> left (min: {m.reorder_threshold})
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Stock Level Chart */}
            <div className="content-card">
              <h2>Current Stock Levels</h2>
              <div style={{ width: '100%', height: 260 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} interval={0} angle={-25} textAnchor="end" />
                    <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} allowDecimals={false} />
                    <Tooltip
                      contentStyle={{ background: '#0f172a', borderRadius: 8, color: '#fff', border: 'none', fontSize: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.2)' }}
                      formatter={(val, name, item) => [`${val} units`, item.payload.fullName]}
                      labelFormatter={() => 'Stock Qty'}
                    />
                    <Bar dataKey="qty" fill="#2563eb" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Recent Activity Timeline */}
            <div className="content-card">
              <div className="section-header">
                <h2>Recent Inventory Activity</h2>
                <span className="count-badge">Last 10 Moves</span>
              </div>

              {recent.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>No transactions recorded yet.</p>
              ) : (
                <div className="activity-feed">
                  {recent.map((tx, idx) => {
                    const isIn = tx.direction === 'in'
                    const dateStr = new Date(tx.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' })
                    return (
                      <div key={idx} className="activity-item">
                        <div className="activity-left">
                          <div className={`activity-badge ${tx.direction}`}>
                            {isIn ? '↓' : '↑'}
                          </div>
                          <div>
                            <div className="activity-title">
                              {isIn ? 'Stock In: ' : 'Stock Out: '}
                              <strong>{tx.qty}</strong> × {tx.materials?.name || 'Item'}
                            </div>
                            <div className="activity-time">{dateStr}</div>
                          </div>
                        </div>
                        <span className={`dir-badge ${tx.direction}`}>
                          {isIn ? '+ Inward' : '- Outward'}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  )
}
