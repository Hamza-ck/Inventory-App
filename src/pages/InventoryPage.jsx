import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ChevronLeft,
  Search,
  X,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import Nav from '../components/Nav'

export default function InventoryPage() {
  const { isAdmin } = useAuth()
  const navigate = useNavigate()
  const [filter, setFilter] = useState('All') // 'All' | 'Low stock' | 'Slow moving'
  const [search, setSearch] = useState('')
  const [adjustModal, setAdjustModal] = useState(null)
  const [newQty, setNewQty] = useState('')

  // Inventory items matching PDF Page 7
  const [items, setItems] = useState([
    {
      id: 1,
      name: 'iPhone 15 · Clear Case',
      sku: 'CC-IP15-CLR',
      qty: 6,
      unit: 'pcs',
      threshold: 15,
      status: 'Low',
      statusTone: 'bg-[#faece6] text-[#c05423]',
      barFill: 'bg-[#c05423]',
      barWidth: '22%',
      rate: 350,
      isSlowMoving: false,
    },
    {
      id: 2,
      name: 'Redmi Note 13 · Silicone',
      sku: 'SL-RN13-BLK',
      qty: 112,
      unit: 'pcs',
      threshold: 20,
      status: 'Healthy',
      statusTone: 'bg-[#e3f3ed] text-[#157a6c]',
      barFill: 'bg-[#157a6c]',
      barWidth: '78%',
      rate: 250,
      isSlowMoving: false,
    },
    {
      id: 3,
      name: 'Samsung A15 · Flip Cover',
      sku: 'FC-SA15-BRN',
      qty: 0,
      unit: 'pcs',
      threshold: 10,
      status: 'Out of stock',
      statusTone: 'bg-[#fbeee8] text-[#b84825]',
      barFill: 'bg-[#b84825]',
      barWidth: '0%',
      rate: 450,
      isSlowMoving: true,
    },
    {
      id: 4,
      name: 'iPhone 15 Pro Max 9D Glass',
      sku: 'TG-IP15-PRM',
      qty: 8,
      unit: 'pcs',
      threshold: 25,
      status: 'Low',
      statusTone: 'bg-[#faece6] text-[#c05423]',
      barFill: 'bg-[#c05423]',
      barWidth: '28%',
      rate: 199,
      isSlowMoving: false,
    },
    {
      id: 5,
      name: '65W Fast GaN Dual Charger',
      sku: 'CHG-65W-GAN',
      qty: 1450,
      unit: 'pcs',
      threshold: 50,
      status: 'Healthy',
      statusTone: 'bg-[#e3f3ed] text-[#157a6c]',
      barFill: 'bg-[#157a6c]',
      barWidth: '95%',
      rate: 1299,
      isSlowMoving: false,
    },
    {
      id: 6,
      name: 'Braided Type-C Fast Cable',
      sku: 'CBL-BRD-TPE',
      qty: 4800,
      unit: 'pcs',
      threshold: 200,
      status: 'Healthy',
      statusTone: 'bg-[#e3f3ed] text-[#157a6c]',
      barFill: 'bg-[#157a6c]',
      barWidth: '100%',
      rate: 199,
      isSlowMoving: false,
    },
    {
      id: 7,
      name: 'ANC Pro True Wireless Earbuds',
      sku: 'AUD-TWS-AIR',
      qty: 1200,
      unit: 'pcs',
      threshold: 40,
      status: 'Healthy',
      statusTone: 'bg-[#e3f3ed] text-[#157a6c]',
      barFill: 'bg-[#157a6c]',
      barWidth: '85%',
      rate: 1699,
      isSlowMoving: true,
    },
  ])

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const matchSearch =
        item.name.toLowerCase().includes(search.toLowerCase()) ||
        item.sku.toLowerCase().includes(search.toLowerCase())

      if (!matchSearch) return false

      if (filter === 'Low stock') {
        return item.status === 'Low' || item.status === 'Out of stock'
      }
      if (filter === 'Slow moving') {
        return item.isSlowMoving
      }
      return true
    })
  }, [items, search, filter])

  const handleSaveStock = (e) => {
    e.preventDefault()
    if (!adjustModal) return
    const num = Number(newQty)
    if (isNaN(num)) return

    const status = num === 0 ? 'Out of stock' : num <= adjustModal.threshold ? 'Low' : 'Healthy'
    const statusTone =
      status === 'Out of stock'
        ? 'bg-[#fbeee8] text-[#b84825]'
        : status === 'Low'
        ? 'bg-[#faece6] text-[#c05423]'
        : 'bg-[#e3f3ed] text-[#157a6c]'

    const barFill = status === 'Healthy' ? 'bg-[#157a6c]' : 'bg-[#c05423]'
    const barWidth = num === 0 ? '0%' : num <= adjustModal.threshold ? '25%' : '80%'

    setItems(
      items.map((it) =>
        it.id === adjustModal.id
          ? { ...it, qty: num, status, statusTone, barFill, barWidth }
          : it
      )
    )
    setAdjustModal(null)
  }

  return (
    <div className="min-h-screen bg-[#f4f7f4] pb-24 lg:pl-64 lg:pb-10">
      <Nav />

      <main className="mx-auto max-w-2xl px-4 pt-4 sm:px-6 sm:pt-6">
        {/* Top Header with Back button (PDF Page 7) */}
        <header className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => navigate('/')}
              className="grid h-9 w-9 place-items-center rounded-xl bg-white text-[#153e34] shadow-2xs hover:bg-[#ebf4ef] transition"
              aria-label="Back to dashboard"
            >
              <ChevronLeft size={20} />
            </button>
            <h1 className="text-[22px] font-extrabold tracking-tight text-[#11382f]">
              Inventory
            </h1>
          </div>
        </header>

        {/* 2 Top Metric Cards (PDF Page 7) */}
        <div className="mb-5 grid grid-cols-2 gap-3 sm:gap-4">
          <div className="rounded-3xl border border-[#e1e9e3] bg-white p-5 shadow-xs">
            <span className="text-xs font-bold text-[#6a847c]">Stock value</span>
            <strong className="mt-1 block text-[26px] font-extrabold tracking-tight text-[#11382f] sm:text-[32px]">
              ₹22.6L
            </strong>
          </div>

          <div className="rounded-3xl border border-[#e1e9e3] border-l-4 border-l-[#c25e19] bg-white p-5 shadow-xs">
            <span className="text-xs font-bold text-[#6a847c]">Low stock</span>
            <strong className="mt-1 block text-[26px] font-extrabold tracking-tight text-[#c25e19] sm:text-[32px]">
              14 items
            </strong>
          </div>
        </div>

        {/* Search Phone model or case input (PDF Page 7) */}
        <div className="mb-4 flex items-center gap-2 rounded-2xl border border-[#dbe6df] bg-white px-3.5 py-2.5 shadow-2xs">
          <Search size={18} className="text-[#7c978f]" />
          <input
            type="text"
            className="w-full bg-transparent text-xs font-medium text-[#11382f] outline-none placeholder:text-[#88a098]"
            placeholder="Search phone model or case"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Filter Pills: All / Low stock / Slow moving (PDF Page 7) */}
        <div className="mb-4 flex items-center gap-2">
          {['All', 'Low stock', 'Slow moving'].map((pill) => (
            <button
              key={pill}
              type="button"
              onClick={() => setFilter(pill)}
              className={`rounded-xl px-4 py-1.5 text-xs font-bold transition ${
                filter === pill
                  ? 'bg-[#0e655d] text-white shadow-xs'
                  : 'bg-white border border-[#dce5df] text-[#557369] hover:bg-[#eef5f1]'
              }`}
            >
              {pill}
            </button>
          ))}
        </div>

        {/* Items List (PDF Page 7) */}
        <div className="space-y-3">
          {filteredItems.map((item) => (
            <article
              key={item.id}
              className="rounded-3xl border border-[#e1e9e3] bg-white p-5 shadow-xs transition hover:shadow-md"
            >
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-[16px] font-extrabold text-[#11382f]">
                    {item.name}
                  </h2>
                  <span className="mt-0.5 block font-mono text-xs text-[#718d84]">
                    SKU {item.sku}
                  </span>
                </div>

                <div className="text-right">
                  <strong className="block text-[17px] font-extrabold text-[#11382f]">
                    {item.qty} {item.unit}
                  </strong>
                  <span
                    className={`mt-1 inline-block rounded-md px-2.5 py-0.5 text-[11px] font-bold ${item.statusTone}`}
                  >
                    {item.status}
                  </span>
                </div>
              </div>

              {/* Progress bar matching PDF */}
              <div className="mt-4 flex h-2 w-full overflow-hidden rounded-full bg-[#e8ecea]">
                <div
                  className={`h-full rounded-full ${item.barFill} transition-all`}
                  style={{ width: item.barWidth }}
                />
              </div>

              {isAdmin && (
                <div className="mt-3 flex items-center justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setAdjustModal(item)
                      setNewQty(String(item.qty))
                    }}
                    className="text-[11px] font-bold text-[#0e655d] hover:underline"
                  >
                    Adjust stock quantity
                  </button>
                </div>
              )}
            </article>
          ))}
        </div>

        {/* Adjust Stock Modal */}
        {adjustModal && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs"
            onClick={() => setAdjustModal(null)}
          >
            <form
              onSubmit={handleSaveStock}
              className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between pb-3 border-b border-[#e5ebe7]">
                <h3 className="text-base font-extrabold text-[#11382f]">
                  Adjust Stock Quantity
                </h3>
                <button
                  type="button"
                  onClick={() => setAdjustModal(null)}
                  className="text-[#6d8a81]"
                >
                  <X size={18} />
                </button>
              </div>
              <div className="mt-4 space-y-3">
                <div>
                  <span className="block text-xs text-[#6e8a81]">Item</span>
                  <strong className="block text-sm font-bold text-[#11382f]">
                    {adjustModal.name}
                  </strong>
                  <span className="text-xs text-[#7c978f] font-mono">
                    SKU: {adjustModal.sku}
                  </span>
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#44655b] mb-1">
                    New Current Quantity ({adjustModal.unit})
                  </label>
                  <input
                    type="number"
                    min="0"
                    required
                    className="w-full rounded-xl border border-[#d8e3de] px-3 py-2 text-xs text-[#11382f] outline-none focus:border-[#0e655d]"
                    value={newQty}
                    onChange={(e) => setNewQty(e.target.value)}
                  />
                </div>
              </div>
              <div className="mt-5 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setAdjustModal(null)}
                  className="rounded-xl border border-[#d6e2dd] py-2.5 text-xs font-bold text-[#55736a]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-[#0e655d] py-2.5 text-xs font-bold text-white shadow-xs"
                >
                  Save Stock
                </button>
              </div>
            </form>
          </div>
        )}
      </main>
    </div>
  )
}
