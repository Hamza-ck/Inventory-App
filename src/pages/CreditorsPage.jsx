import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ChevronLeft,
  Search,
  Plus,
  CreditCard,
  Phone,
  MessageCircle,
  Clock,
  CheckCircle,
  X,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import Nav from '../components/Nav'

export default function CreditorsPage() {
  const { isAdmin } = useAuth()
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [payModal, setPayModal] = useState(null)
  const [paymentSuccess, setPaymentSuccess] = useState(false)

  // Creditors list matching PDF Page 6
  const [suppliers, setSuppliers] = useState([
    {
      id: 1,
      name: 'Metro Steel and Hardware',
      nextPayment: '20 Oct',
      amount: 192000,
      displayAmount: '₹1,92,000',
      dueStatus: 'Due in 1d',
      dueTone: 'bg-[#fceee9] text-[#b84628]',
      phone: '+919821099887',
      isDueNow: true,
    },
    {
      id: 2,
      name: 'Supreme Fabrics Mill',
      nextPayment: '02 Nov',
      amount: 130500,
      displayAmount: '₹1,30,500',
      dueStatus: 'Due in 14d',
      dueTone: 'bg-[#e3f3ec] text-[#0f7366]',
      phone: '+919876543210',
      isDueNow: false,
    },
    {
      id: 3,
      name: 'Bright Cases Wholesale',
      nextPayment: '12 Nov',
      amount: 86200,
      displayAmount: '₹86,200',
      dueStatus: 'Due in 24d',
      dueTone: 'bg-[#e3f3ec] text-[#0f7366]',
      phone: '+919831188776',
      isDueNow: false,
    },
    {
      id: 4,
      name: 'Universal Displays Ltd',
      nextPayment: '25 Nov',
      amount: 101300,
      displayAmount: '₹1,01,300',
      dueStatus: 'Due in 37d',
      dueTone: 'bg-[#e3f3ec] text-[#0f7366]',
      phone: '+919840033221',
      isDueNow: false,
    },
  ])

  const filteredSuppliers = useMemo(() => {
    if (!search.trim()) return suppliers
    const q = search.toLowerCase()
    return suppliers.filter(
      (s) => s.name.toLowerCase().includes(q) || s.phone.includes(q)
    )
  }, [suppliers, search])

  const handleRecordPayment = (e) => {
    e.preventDefault()
    setPaymentSuccess(true)
    setTimeout(() => {
      setPaymentSuccess(false)
      setPayModal(null)
    }, 1500)
  }

  return (
    <div className="min-h-screen bg-[#f4f7f4] pb-24 lg:pl-64 lg:pb-10">
      <Nav />

      <main className="mx-auto max-w-2xl px-4 pt-4 sm:px-6 sm:pt-6">
        {/* Top Header with Back button (PDF Page 6) */}
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
              Creditors
            </h1>
          </div>
        </header>

        {/* Total You Owe & 3-segment Aging Bar (PDF Page 6) */}
        <div className="mb-5 rounded-3xl border border-[#e1e9e3] bg-white p-5 shadow-xs">
          <span className="text-xs font-bold text-[#627d75]">Total you owe</span>
          <strong className="mt-1 block text-[34px] font-extrabold tracking-tight text-[#c25e19]">
            ₹5.1L
          </strong>

          {/* 3-segment horizontal progress bar */}
          <div className="mt-4 flex h-3 w-full overflow-hidden rounded-full bg-[#e8ecea]">
            <div
              className="bg-[#c25e19] transition-all"
              style={{ width: '37%' }}
              title="Due now: ₹1.9L"
            />
            <div
              className="bg-[#d4995f] transition-all"
              style={{ width: '31%' }}
              title="Next 15d: ₹1.6L"
            />
            <div
              className="bg-[#e4cbaf] transition-all"
              style={{ width: '32%' }}
              title="Later: ₹1.6L"
            />
          </div>

          {/* Aging labels */}
          <div className="mt-3 flex items-center justify-between text-xs font-bold">
            <span className="flex items-center gap-1.5 text-[#c25e19]">
              <span className="h-2 w-2 rounded-full bg-[#c25e19]" />
              Due now ₹1.9L
            </span>
            <span className="flex items-center gap-1.5 text-[#ad7339]">
              <span className="h-2 w-2 rounded-full bg-[#d4995f]" />
              Next 15d ₹1.6L
            </span>
            <span className="flex items-center gap-1.5 text-[#977b5a]">
              <span className="h-2 w-2 rounded-full bg-[#e4cbaf]" />
              Later ₹1.6L
            </span>
          </div>
        </div>

        {/* Search Supplier Input (PDF Page 6) */}
        <div className="mb-4 flex items-center gap-2 rounded-2xl border border-[#dbe6df] bg-white px-3.5 py-2.5 shadow-2xs">
          <Search size={18} className="text-[#7c978f]" />
          <input
            type="text"
            className="w-full bg-transparent text-xs font-medium text-[#11382f] outline-none placeholder:text-[#88a098]"
            placeholder="Search supplier"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Supplier Cards List (PDF Page 6) */}
        <div className="space-y-3">
          {filteredSuppliers.map((supp) => (
            <article
              key={supp.id}
              className="rounded-3xl border border-[#e1e9e3] bg-white p-5 shadow-xs transition hover:shadow-md"
            >
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-[16px] font-extrabold text-[#11382f]">
                    {supp.name}
                  </h2>
                  <span className="mt-0.5 block text-xs text-[#718d84]">
                    Next payment {supp.nextPayment}
                  </span>
                </div>
                <div className="text-right">
                  <strong className="block text-[17px] font-extrabold text-[#c25e19]">
                    {supp.displayAmount}
                  </strong>
                  <span
                    className={`mt-1 inline-block rounded-md px-2.5 py-0.5 text-[11px] font-bold ${supp.dueTone}`}
                  >
                    {supp.dueStatus}
                  </span>
                </div>
              </div>

              {/* Action buttons */}
              <div className="mt-4 flex items-center justify-end gap-2">
                <a
                  href={`tel:${supp.phone}`}
                  className="flex items-center gap-1.5 rounded-xl border border-[#cbe1d7] px-3 py-1.5 text-xs font-bold text-[#145347] no-underline hover:bg-[#eef7f3]"
                >
                  <Phone size={13} /> Call
                </a>
                <button
                  type="button"
                  onClick={() => setPayModal(supp)}
                  className="flex items-center gap-1.5 rounded-xl bg-[#0e655d] px-3.5 py-1.5 text-xs font-bold text-white shadow-2xs hover:bg-[#0a4f49] transition"
                >
                  <CreditCard size={13} /> Pay supplier
                </button>
              </div>
            </article>
          ))}
        </div>

        {/* Payment Modal */}
        {payModal && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs"
            onClick={() => setPayModal(null)}
          >
            <form
              onSubmit={handleRecordPayment}
              className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between pb-3 border-b border-[#e5ebe7]">
                <h3 className="text-base font-extrabold text-[#11382f]">
                  Record Supplier Payment
                </h3>
                <button
                  type="button"
                  onClick={() => setPayModal(null)}
                  className="text-[#6d8a81]"
                >
                  <X size={18} />
                </button>
              </div>

              {paymentSuccess ? (
                <div className="py-8 text-center text-[#0e655d]">
                  <CheckCircle size={40} className="mx-auto mb-2 text-[#0e655d]" />
                  <p className="font-extrabold text-sm">Payment Recorded Successfully!</p>
                </div>
              ) : (
                <>
                  <div className="mt-4 space-y-3">
                    <div>
                      <span className="block text-xs text-[#6e8a81]">Supplier</span>
                      <strong className="block text-sm font-bold text-[#11382f]">
                        {payModal.name}
                      </strong>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-[#44655b] mb-1">
                        Amount to Pay (₹)
                      </label>
                      <input
                        type="number"
                        defaultValue={payModal.amount}
                        className="w-full rounded-xl border border-[#d8e3de] px-3 py-2 text-xs text-[#11382f] outline-none focus:border-[#0e655d]"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-[#44655b] mb-1">
                        Payment Mode
                      </label>
                      <select className="w-full rounded-xl border border-[#d8e3de] px-3 py-2 text-xs text-[#11382f] outline-none focus:border-[#0e655d]">
                        <option value="HDFC Bank">HDFC Bank (NEFT / RTGS)</option>
                        <option value="Cash">Cash-in-hand</option>
                        <option value="UPI">Business UPI</option>
                      </select>
                    </div>
                  </div>
                  <div className="mt-5 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setPayModal(null)}
                      className="rounded-xl border border-[#d6e2dd] py-2.5 text-xs font-bold text-[#55736a]"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="rounded-xl bg-[#0e655d] py-2.5 text-xs font-bold text-white shadow-xs"
                    >
                      Confirm Payment
                    </button>
                  </div>
                </>
              )}
            </form>
          </div>
        )}
      </main>
    </div>
  )
}
