import { useState, useMemo, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ChevronLeft,
  FileSpreadsheet,
  Edit3,
  TrendingDown,
} from 'lucide-react'
import Nav from '../components/Nav'
import { accDb } from '../lib/accountingDb'
import AdminEditModal from '../components/AdminEditModal'

const DEFAULT_EXPENSES = [
  {
    id: 1,
    name: 'Rent',
    rawAmount: 120000,
  },
  {
    id: 2,
    name: 'Salaries',
    rawAmount: 110000,
  },
  {
    id: 3,
    name: 'Electricity',
    rawAmount: 28000,
  },
  {
    id: 4,
    name: 'Transport',
    rawAmount: 22000,
  },
  {
    id: 5,
    name: 'Packaging & Supplies',
    rawAmount: 32000,
  },
]

export default function ExpensesPage() {
  const navigate = useNavigate()
  const [categories, setCategories] = useState(DEFAULT_EXPENSES)
  const [editingExpense, setEditingExpense] = useState(null)

  // Load expenses from Dexie ledgers/vouchers
  const loadExpenses = useCallback(async () => {
    try {
      const expLedgers = await accDb.ledgers.where('category').equals('expense').toArray()
      if (expLedgers && expLedgers.length > 0) {
        setCategories(
          expLedgers.map((l) => ({
            id: l.id,
            name: l.name,
            rawAmount: Number(l.current_balance) || 0,
          }))
        )
      } else {
        setCategories(DEFAULT_EXPENSES)
      }
    } catch {
      setCategories(DEFAULT_EXPENSES)
    }
  }, [])

  useEffect(() => {
    loadExpenses()
    const onUpdate = () => loadExpenses()
    window.addEventListener('accounting-data-updated', onUpdate)
    return () => window.removeEventListener('accounting-data-updated', onUpdate)
  }, [loadExpenses])

  // Total monthly expenses
  const totalExpenses = useMemo(() => {
    return categories.reduce((sum, c) => sum + (Number(c.rawAmount) || 0), 0)
  }, [categories])

  const maxExpense = useMemo(() => {
    return Math.max(...categories.map((c) => Number(c.rawAmount) || 0), 120000)
  }, [categories])

  const formatAmount = (amt) => {
    if (amt >= 100000) return `₹${(amt / 100000).toFixed(1)}L`
    if (amt >= 1000) return `₹${(amt / 1000).toFixed(0)}K`
    return `₹${amt}`
  }

  return (
    <div className="min-h-screen bg-[#f4f7f4] pb-24 lg:pl-64 lg:pb-10 font-sans">
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

          <button
            type="button"
            onClick={() => navigate('/tally')}
            className="flex items-center gap-1.5 rounded-2xl bg-[#0e655d] px-3.5 py-2 text-xs font-extrabold text-white shadow-xs hover:bg-[#0a4f49] transition active:scale-95"
            title="Import vouchers from Tally XML"
          >
            <FileSpreadsheet size={16} />
            <span>Tally import</span>
          </button>
        </header>

        {/* Featured This Month Card (PDF Page 8) */}
        <div className="mb-6 rounded-3xl border border-[#e1e9e3] bg-white p-6 shadow-xs">
          <span className="text-xs font-bold text-[#6a847c]">This month</span>
          <strong className="mt-1 block text-[38px] font-extrabold tracking-tight text-[#c25e19]">
            {formatAmount(totalExpenses)}
          </strong>
          <span className="mt-1 inline-flex items-center gap-1 text-xs font-bold text-[#147366]">
            <TrendingDown size={14} /> 4% vs last month
          </span>
        </div>

        {/* By Category Section (PDF Page 8) */}
        <section className="rounded-3xl border border-[#e1e9e3] bg-white p-6 shadow-xs">
          <h2 className="text-[17px] font-extrabold text-[#11382f] mb-4">
            By category
          </h2>

          <div className="space-y-5">
            {categories.map((cat) => {
              const amt = Number(cat.rawAmount) || 0
              const percentage = Math.min(100, Math.max(8, Math.round((amt / maxExpense) * 100)))
              const barColor = amt >= 80000 ? 'bg-[#b8521a]' : 'bg-[#cfa472]'

              return (
                <div key={cat.id || cat.name} className="group">
                  <div className="flex items-center justify-between text-sm font-extrabold text-[#11382f] mb-1.5">
                    <div className="flex items-center gap-2">
                      <span>{cat.name}</span>
                      <button
                        type="button"
                        onClick={() => setEditingExpense({ id: cat.id, name: cat.name, current_balance: amt, category: 'expense' })}
                        className="opacity-75 group-hover:opacity-100 inline-flex items-center gap-1 rounded-md border border-[#cfded6] bg-[#f8faf9] px-2 py-0.5 text-[10px] font-bold text-[#0e655d] hover:bg-[#ebf3ef] transition"
                        title="Admin Edit expense"
                      >
                        <Edit3 size={11} />
                        <span>Edit</span>
                      </button>
                    </div>
                    <span>{formatAmount(amt)}</span>
                  </div>
                  <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-[#edebe9]">
                    <div
                      className={`h-full rounded-full ${barColor} transition-all duration-300`}
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </section>

        {/* Admin Edit Modal */}
        <AdminEditModal
          isOpen={Boolean(editingExpense)}
          onClose={() => setEditingExpense(null)}
          type="ledger"
          item={editingExpense}
          onSaved={() => loadExpenses()}
        />
      </main>
    </div>
  )
}
