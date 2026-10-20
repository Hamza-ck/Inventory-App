import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ChevronLeft,
  Banknote,
  Plus,
  CreditCard,
  Building2,
  Calendar,
  X,
  CheckCircle,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import Nav from '../components/Nav'

export default function LoansPage() {
  const { isAdmin } = useAuth()
  const navigate = useNavigate()
  const [modal, setModal] = useState(false)
  const [entry, setEntry] = useState({ type: 'loan', name: '', amount: '', note: '' })

  return (
    <div className="min-h-screen bg-[#f4f7f4] pb-24 lg:pl-64 lg:pb-10">
      <Nav />

      <main className="mx-auto max-w-2xl px-4 pt-4 sm:px-6 sm:pt-6">
        {/* Top Header with Back button (PDF Page 9) */}
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
              Loans &amp; Advances
            </h1>
          </div>

          {isAdmin && (
            <button
              type="button"
              onClick={() => setModal(true)}
              className="flex items-center gap-1.5 rounded-xl bg-[#0e655d] px-3 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-[#0a4f49] transition"
            >
              <Plus size={15} /> Record entry
            </button>
          )}
        </header>

        {/* Featured Net You Owe Card (PDF Page 9) */}
        <div className="mb-6 rounded-3xl bg-[#0e655d] p-6 text-white shadow-xs">
          <span className="text-xs font-semibold text-[#a5dcd0]">
            Net you owe
          </span>
          <strong className="mt-2 block text-[38px] font-extrabold tracking-tight sm:text-[44px]">
            ₹3.0L
          </strong>
        </div>

        {/* Section 1: Loans you owe (PDF Page 9) */}
        <section className="mb-5 rounded-3xl border border-[#e1e9e3] border-l-4 border-l-[#c25e19] bg-white p-5 sm:p-6 shadow-xs">
          <div className="flex items-center justify-between pb-4 border-b border-[#edf3f0]">
            <h2 className="text-[17px] font-extrabold text-[#11382f]">
              Loans you owe
            </h2>
            <strong className="text-[18px] font-extrabold text-[#c25e19]">
              ₹4.5L
            </strong>
          </div>

          <div className="divide-y divide-[#edf3f0]">
            {/* Term Loan */}
            <div className="py-4 flex items-start justify-between">
              <div>
                <strong className="block text-sm font-extrabold text-[#11382f]">
                  Term loan
                </strong>
                <span className="mt-1 block text-xs text-[#718d84]">
                  EMI ₹18,500 due 5 Nov
                </span>
              </div>
              <strong className="text-base font-extrabold text-[#11382f]">
                ₹4.0L
              </strong>
            </div>

            {/* Vendor Loan */}
            <div className="pt-4 flex items-start justify-between">
              <div>
                <strong className="block text-sm font-extrabold text-[#11382f]">
                  Vendor loan
                </strong>
                <span className="mt-1 block text-xs text-[#718d84]">
                  Repay by 30 Nov
                </span>
              </div>
              <strong className="text-base font-extrabold text-[#11382f]">
                ₹0.5L
              </strong>
            </div>
          </div>
        </section>

        {/* Section 2: Advances given (PDF Page 9) */}
        <section className="rounded-3xl border border-[#e1e9e3] border-l-4 border-l-[#0e655d] bg-white p-5 sm:p-6 shadow-xs">
          <div className="flex items-center justify-between pb-4 border-b border-[#edf3f0]">
            <h2 className="text-[17px] font-extrabold text-[#11382f]">
              Advances given
            </h2>
            <strong className="text-[18px] font-extrabold text-[#0e655d]">
              ₹1.5L
            </strong>
          </div>

          <div className="divide-y divide-[#edf3f0]">
            {/* Staff Advances */}
            <div className="py-4 flex items-start justify-between">
              <div>
                <strong className="block text-sm font-extrabold text-[#11382f]">
                  Staff advances
                </strong>
                <span className="mt-1 block text-xs text-[#718d84]">
                  3 people
                </span>
              </div>
              <strong className="text-base font-extrabold text-[#11382f]">
                ₹0.15L
              </strong>
            </div>

            {/* Supplier Advance */}
            <div className="pt-4 flex items-start justify-between">
              <div>
                <strong className="block text-sm font-extrabold text-[#11382f]">
                  Supplier advance
                </strong>
                <span className="mt-1 block text-xs text-[#718d84]">
                  Metro Steel
                </span>
              </div>
              <strong className="text-base font-extrabold text-[#11382f]">
                ₹1.35L
              </strong>
            </div>
          </div>
        </section>

        {/* Modal */}
        {modal && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs"
            onClick={() => setModal(false)}
          >
            <form
              onSubmit={(e) => {
                e.preventDefault()
                setModal(false)
              }}
              className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between pb-3 border-b border-[#e5ebe7]">
                <h3 className="text-base font-extrabold text-[#11382f]">
                  Record Loan / Advance
                </h3>
                <button
                  type="button"
                  onClick={() => setModal(false)}
                  className="text-[#6d8a81]"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="mt-4 space-y-3">
                <div>
                  <label className="block text-xs font-bold text-[#44655b] mb-1">
                    Entry Type
                  </label>
                  <select
                    className="w-full rounded-xl border border-[#d8e3de] px-3 py-2 text-xs text-[#11382f] outline-none focus:border-[#0e655d]"
                    value={entry.type}
                    onChange={(e) => setEntry({ ...entry, type: e.target.value })}
                  >
                    <option value="loan">Loan Liability (You owe)</option>
                    <option value="advance">Advance Given (They owe you)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#44655b] mb-1">
                    Entity / Person Name
                  </label>
                  <input
                    type="text"
                    required
                    className="w-full rounded-xl border border-[#d8e3de] px-3 py-2 text-xs text-[#11382f] outline-none focus:border-[#0e655d]"
                    placeholder="e.g. HDFC Business Loan"
                    value={entry.name}
                    onChange={(e) => setEntry({ ...entry, name: e.target.value })}
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
                    placeholder="100000"
                    value={entry.amount}
                    onChange={(e) => setEntry({ ...entry, amount: e.target.value })}
                  />
                </div>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setModal(false)}
                  className="rounded-xl border border-[#d6e2dd] py-2.5 text-xs font-bold text-[#55736a]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-[#0e655d] py-2.5 text-xs font-bold text-white shadow-xs"
                >
                  Save Entry
                </button>
              </div>
            </form>
          </div>
        )}
      </main>
    </div>
  )
}
