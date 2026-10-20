import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ChevronLeft,
  Plus,
  MinusCircle,
  TrendingDown,
  Calendar,
  X,
  CheckCircle,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import Nav from '../components/Nav'

export default function ExpensesPage() {
  const { isAdmin } = useAuth()
  const navigate = useNavigate()
  const [addModal, setAddModal] = useState(false)
  const [newExpense, setNewExpense] = useState({ category: 'Transport', amount: '', note: '' })

  // Expenses data matching PDF Page 8
  const [categories, setCategories] = useState([
    {
      id: 1,
      name: 'Rent',
      amount: '₹1.2L',
      rawAmount: 120000,
      barWidth: '82%',
      barColor: 'bg-[#b8521a]',
    },
    {
      id: 2,
      name: 'Salaries',
      amount: '₹1.1L',
      rawAmount: 110000,
      barWidth: '75%',
      barColor: 'bg-[#b8521a]',
    },
    {
      id: 3,
      name: 'Electricity',
      amount: '₹28K',
      rawAmount: 28000,
      barWidth: '32%',
      barColor: 'bg-[#cfa472]',
    },
    {
      id: 4,
      name: 'Transport',
      amount: '₹22K',
      rawAmount: 22000,
      barWidth: '24%',
      barColor: 'bg-[#cfa472]',
    },
    {
      id: 5,
      name: 'Packaging & Supplies',
      amount: '₹32K',
      rawAmount: 32000,
      barWidth: '35%',
      barColor: 'bg-[#cfa472]',
    },
  ])

  const handleAddExpense = (e) => {
    e.preventDefault()
    const amt = Number(newExpense.amount) || 0
    const display = amt >= 100000 ? `₹${(amt / 100000).toFixed(1)}L` : `₹${(amt / 1000).toFixed(0)}K`

    setCategories([
      ...categories,
      {
        id: Date.now(),
        name: newExpense.category,
        amount: display,
        rawAmount: amt,
        barWidth: `${Math.min(90, Math.max(15, (amt / 150000) * 100))}%`,
        barColor: amt > 50000 ? 'bg-[#b8521a]' : 'bg-[#cfa472]',
      },
    ])
    setNewExpense({ category: 'Transport', amount: '', note: '' })
    setAddModal(false)
  }

  return (
    <div className="min-h-screen bg-[#f4f7f4] pb-24 lg:pl-64 lg:pb-10">
      <Nav />

      <main className="mx-auto max-w-2xl px-4 pt-4 sm:px-6 sm:pt-6">
        {/* Top Header with Back button (PDF Page 8) */}
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
              Expenses
            </h1>
          </div>

          {isAdmin && (
            <button
              type="button"
              onClick={() => setAddModal(true)}
              className="flex items-center gap-1.5 rounded-xl bg-[#0e655d] px-3 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-[#0a4f49] transition"
            >
              <Plus size={15} /> Add expense
            </button>
          )}
        </header>

        {/* This Month Header Card (PDF Page 8) */}
        <div className="mb-6 rounded-3xl border border-[#e1e9e3] bg-white p-5 shadow-xs">
          <span className="text-xs font-bold text-[#627d75]">This month</span>
          <strong className="mt-1 block text-[34px] font-extrabold tracking-tight text-[#b8521a]">
            ₹3.1L
          </strong>
          <div className="mt-2 flex items-center gap-1.5 text-xs font-bold text-[#678278]">
            <span>▼ 4% vs last month</span>
          </div>
        </div>

        {/* By Category Section (PDF Page 8) */}
        <section className="rounded-3xl border border-[#e1e9e3] bg-white p-5 sm:p-6 shadow-xs">
          <h2 className="text-[17px] font-extrabold text-[#11382f] mb-6">
            By category
          </h2>

          <div className="space-y-6">
            {categories.map((cat) => (
              <div key={cat.id}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-extrabold text-[#11382f]">
                    {cat.name}
                  </span>
                  <strong className="text-sm font-extrabold text-[#11382f]">
                    {cat.amount}
                  </strong>
                </div>

                {/* Styled solid progress bar matching PDF Page 8 */}
                <div className="h-3 w-full overflow-hidden rounded-full bg-[#e8ecea]">
                  <div
                    className={`h-full rounded-full ${cat.barColor} transition-all duration-300`}
                    style={{ width: cat.barWidth }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Add Expense Modal */}
        {addModal && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs"
            onClick={() => setAddModal(false)}
          >
            <form
              onSubmit={handleAddExpense}
              className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between pb-3 border-b border-[#e5ebe7]">
                <h3 className="text-base font-extrabold text-[#11382f]">
                  Record Operating Expense
                </h3>
                <button
                  type="button"
                  onClick={() => setAddModal(false)}
                  className="text-[#6d8a81]"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="mt-4 space-y-3">
                <div>
                  <label className="block text-xs font-bold text-[#44655b] mb-1">
                    Expense Category
                  </label>
                  <input
                    type="text"
                    required
                    className="w-full rounded-xl border border-[#d8e3de] px-3 py-2 text-xs text-[#11382f] outline-none focus:border-[#0e655d]"
                    placeholder="e.g. Courier & Freight"
                    value={newExpense.category}
                    onChange={(e) => setNewExpense({ ...newExpense, category: e.target.value })}
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#44655b] mb-1">
                    Amount (₹)
                  </label>
                  <input
                    type="number"
                    required
                    className="w-full rounded-xl border border-[#d8e3de] px-3 py-2 text-xs text-[#11382f] outline-none focus:border-[#0e655d]"
                    placeholder="15000"
                    value={newExpense.amount}
                    onChange={(e) => setNewExpense({ ...newExpense, amount: e.target.value })}
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#44655b] mb-1">
                    Note / Narration
                  </label>
                  <input
                    type="text"
                    className="w-full rounded-xl border border-[#d8e3de] px-3 py-2 text-xs text-[#11382f] outline-none focus:border-[#0e655d]"
                    placeholder="Monthly payment"
                    value={newExpense.note}
                    onChange={(e) => setNewExpense({ ...newExpense, note: e.target.value })}
                  />
                </div>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setAddModal(false)}
                  className="rounded-xl border border-[#d6e2dd] py-2.5 text-xs font-bold text-[#55736a]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-[#0e655d] py-2.5 text-xs font-bold text-white shadow-xs"
                >
                  Save Expense
                </button>
              </div>
            </form>
          </div>
        )}
      </main>
    </div>
  )
}
