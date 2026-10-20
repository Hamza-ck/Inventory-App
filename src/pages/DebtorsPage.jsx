import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ChevronLeft,
  Search,
  Phone,
  MessageCircle,
  Plus,
  Check,
  User,
  AlertCircle,
  X,
  CreditCard,
  Shield,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { accDb } from '../lib/accountingDb'
import Nav from '../components/Nav'

export default function DebtorsPage() {
  const { isAdmin, shopName } = useAuth()
  const navigate = useNavigate()
  const [searchTerm, setSearchTerm] = useState('')
  const [whatsappSent, setWhatsappSent] = useState(null)
  const [callModal, setCallModal] = useState(null)
  const [addModalOpen, setAddModalOpen] = useState(false)
  const [newCustomer, setNewCustomer] = useState({ name: '', phone: '', amount: '', days: '15' })

  // Data from PDF Page 2
  const [customers, setCustomers] = useState([
    {
      id: 1,
      name: 'Rahul Mobile Hub',
      lastInvoice: '12 Oct',
      amount: 184200,
      displayAmount: '₹1,84,200',
      badge: '60d+',
      badgeTone: 'bg-[#feeae6] text-[#b73725]',
      phone: '+919876543210',
      dueDays: 68,
    },
    {
      id: 2,
      name: 'City Gadget Point',
      lastInvoice: '02 Oct',
      amount: 96500,
      displayAmount: '₹96,500',
      badge: '31–60d',
      badgeTone: 'bg-[#e2f3ec] text-[#0d786d]',
      phone: '+919811234567',
      dueDays: 42,
    },
    {
      id: 3,
      name: 'Sen Telecom',
      lastInvoice: '16 Oct',
      amount: 71900,
      displayAmount: '₹71,900',
      badge: '0–30d',
      badgeTone: 'bg-[#e4f1eb] text-[#146b60]',
      phone: '+919830123456',
      dueDays: 14,
    },
    {
      id: 4,
      name: 'Mitra Cover House',
      lastInvoice: '17 Oct',
      amount: 48300,
      displayAmount: '₹48,300',
      badge: '0–30d',
      badgeTone: 'bg-[#e4f1eb] text-[#146b60]',
      phone: '+919845098765',
      dueDays: 8,
    },
    {
      id: 5,
      name: 'Apex Mobile Zone',
      lastInvoice: '10 Oct',
      amount: 163500,
      displayAmount: '₹1,63,500',
      badge: '31–60d',
      badgeTone: 'bg-[#e2f3ec] text-[#0d786d]',
      phone: '+919820011223',
      dueDays: 35,
    },
    {
      id: 6,
      name: 'Vikas Digital Store',
      lastInvoice: '15 Oct',
      amount: 275600,
      displayAmount: '₹2,75,600',
      badge: '0–30d',
      badgeTone: 'bg-[#e4f1eb] text-[#146b60]',
      phone: '+919899044556',
      dueDays: 12,
    },
  ])

  // Filtered by search
  const filteredCustomers = useMemo(() => {
    if (!searchTerm.trim()) return customers
    const term = searchTerm.toLowerCase()
    return customers.filter(
      (c) => c.name.toLowerCase().includes(term) || c.phone.includes(term)
    )
  }, [customers, searchTerm])

  const handleCall = (cust) => {
    setCallModal(cust)
  }

  const handleWhatsApp = (cust) => {
    const text = encodeURIComponent(
      `Dear ${cust.name}, polite payment reminder from ${shopName} regarding your outstanding balance of ${cust.displayAmount} (aging ${cust.badge}). Kindly arrange transfer or settlement. Thank you!`
    )
    window.open(`https://wa.me/${cust.phone.replace(/[^0-9]/g, '')}?text=${text}`, '_blank')
    setWhatsappSent(cust.id)
    setTimeout(() => setWhatsappSent(null), 3500)
  }

  const handleAddDebtor = (e) => {
    e.preventDefault()
    if (!newCustomer.name) return
    const num = Number(newCustomer.amount) || 0
    const days = Number(newCustomer.days) || 15
    const badge = days > 60 ? '60d+' : days > 30 ? '31–60d' : '0–30d'
    const badgeTone =
      days > 60
        ? 'bg-[#feeae6] text-[#b73725]'
        : days > 30
        ? 'bg-[#e2f3ec] text-[#0d786d]'
        : 'bg-[#e4f1eb] text-[#146b60]'

    const created = {
      id: Date.now(),
      name: newCustomer.name,
      lastInvoice: 'Today',
      amount: num,
      displayAmount: `₹${num.toLocaleString('en-IN')}`,
      badge,
      badgeTone,
      phone: newCustomer.phone || '+919876543210',
      dueDays: days,
    }

    setCustomers([created, ...customers])
    setNewCustomer({ name: '', phone: '', amount: '', days: '15' })
    setAddModalOpen(false)
  }

  return (
    <div className="min-h-screen bg-[#f4f7f4] pb-24 lg:pl-64 lg:pb-10">
      <Nav />

      <main className="mx-auto max-w-2xl px-4 pt-4 sm:px-6 sm:pt-6">
        {/* Top Bar with Back Button (PDF Page 2) */}
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
              Debtors
            </h1>
          </div>

          {isAdmin && (
            <button
              type="button"
              onClick={() => setAddModalOpen(true)}
              className="flex items-center gap-1 rounded-xl bg-[#0e655d] px-3 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-[#0a4f49] transition"
            >
              <Plus size={15} /> Add debtor
            </button>
          )}
        </header>

        {/* Total Owed & Aging Breakdown Card (PDF Page 2) */}
        <div className="mb-5 rounded-3xl border border-[#e1e9e3] bg-white p-5 shadow-xs">
          <span className="text-xs font-bold text-[#627d75]">Total owed to you</span>
          <strong className="mt-1 block text-[34px] font-extrabold tracking-tight text-[#0e655d]">
            ₹8.4L
          </strong>

          {/* 3-segment aging bar */}
          <div className="mt-4 flex h-3 w-full overflow-hidden rounded-full bg-[#e8ecea]">
            <div
              className="bg-[#0e655d] transition-all"
              style={{ width: '48%' }}
              title="0–30d: ₹4.1L"
            />
            <div
              className="bg-[#4aa08d] transition-all"
              style={{ width: '31%' }}
              title="31–60d: ₹2.6L"
            />
            <div
              className="bg-[#c25e19] transition-all"
              style={{ width: '21%' }}
              title="60d+: ₹1.7L"
            />
          </div>

          {/* Aging labels */}
          <div className="mt-3 flex items-center justify-between text-xs font-bold">
            <span className="flex items-center gap-1.5 text-[#0e655d]">
              <span className="h-2 w-2 rounded-full bg-[#0e655d]" />
              0–30d ₹4.1L
            </span>
            <span className="flex items-center gap-1.5 text-[#3a8373]">
              <span className="h-2 w-2 rounded-full bg-[#4aa08d]" />
              31–60d ₹2.6L
            </span>
            <span className="flex items-center gap-1.5 text-[#c25e19]">
              <span className="h-2 w-2 rounded-full bg-[#c25e19]" />
              60d+ ₹1.7L
            </span>
          </div>
        </div>

        {/* Search Customer Input (PDF Page 2) */}
        <div className="mb-4 flex items-center gap-2 rounded-2xl border border-[#dbe6df] bg-white px-3.5 py-2.5 shadow-2xs focus-within:border-[#0e655d]">
          <Search size={18} className="text-[#7c978f]" />
          <input
            type="text"
            className="w-full bg-transparent text-xs font-medium text-[#11382f] outline-none placeholder:text-[#88a098]"
            placeholder="Search customer or phone"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          {searchTerm && (
            <button type="button" onClick={() => setSearchTerm('')} className="text-[#88a098]">
              <X size={14} />
            </button>
          )}
        </div>

        {/* Customer Cards List (PDF Page 2) */}
        <div className="space-y-3">
          {filteredCustomers.map((cust) => (
            <article
              key={cust.id}
              className="rounded-3xl border border-[#e1e9e3] bg-white p-5 shadow-xs transition hover:shadow-md"
            >
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-[16px] font-extrabold text-[#11382f]">
                    {cust.name}
                  </h2>
                  <span className="mt-0.5 block text-xs text-[#718d84]">
                    Last invoice {cust.lastInvoice}
                  </span>
                </div>
                <div className="text-right">
                  <strong className="block text-[17px] font-extrabold text-[#0e655d]">
                    {cust.displayAmount}
                  </strong>
                  <span
                    className={`mt-1 inline-block rounded-md px-2 py-0.5 text-[11px] font-bold ${cust.badgeTone}`}
                  >
                    {cust.badge}
                  </span>
                </div>
              </div>

              {/* Action Buttons: "Call" & "WhatsApp reminder" (PDF Page 2) */}
              <div className="mt-4 grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => handleCall(cust)}
                  className="flex items-center justify-center gap-2 rounded-2xl border border-[#c6dfd6] bg-white py-2.5 text-xs font-bold text-[#145347] hover:bg-[#f1f7f4] transition active:scale-98"
                >
                  <Phone size={14} />
                  Call
                </button>
                <button
                  type="button"
                  onClick={() => handleWhatsApp(cust)}
                  className="flex items-center justify-center gap-2 rounded-2xl bg-[#0e655d] py-2.5 text-xs font-bold text-white shadow-2xs hover:bg-[#0a4f49] transition active:scale-98"
                >
                  {whatsappSent === cust.id ? (
                    <>
                      <Check size={14} />
                      Reminder Sent!
                    </>
                  ) : (
                    <>
                      <MessageCircle size={14} />
                      WhatsApp reminder
                    </>
                  )}
                </button>
              </div>
            </article>
          ))}
        </div>

        {/* Call Customer Prompt Modal */}
        {callModal && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs"
            onClick={() => setCallModal(null)}
          >
            <div
              className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-[#e3f4ee] text-[#0e655d]">
                <Phone size={22} />
              </div>
              <h3 className="text-center text-lg font-extrabold text-[#11382f]">
                Call {callModal.name}
              </h3>
              <p className="mt-1 text-center text-xs text-[#6e8a81]">
                Outstanding balance: {callModal.displayAmount} ({callModal.badge})
              </p>
              <p className="mt-3 text-center text-sm font-bold text-[#0e655d]">
                {callModal.phone}
              </p>
              <div className="mt-5 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setCallModal(null)}
                  className="rounded-xl border border-[#d6e2dd] py-2.5 text-xs font-bold text-[#55736a]"
                >
                  Cancel
                </button>
                <a
                  href={`tel:${callModal.phone}`}
                  onClick={() => setCallModal(null)}
                  className="flex items-center justify-center gap-1.5 rounded-xl bg-[#0e655d] py-2.5 text-xs font-bold text-white no-underline shadow-xs"
                >
                  <Phone size={14} /> Dial now
                </a>
              </div>
            </div>
          </div>
        )}

        {/* Add Debtor Modal */}
        {addModalOpen && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs"
            onClick={() => setAddModalOpen(false)}
          >
            <form
              onSubmit={handleAddDebtor}
              className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between pb-3 border-b border-[#e5ebe7]">
                <h3 className="text-base font-extrabold text-[#11382f]">
                  Add New Debtor
                </h3>
                <button
                  type="button"
                  onClick={() => setAddModalOpen(false)}
                  className="text-[#6d8a81]"
                >
                  <X size={18} />
                </button>
              </div>
              <div className="mt-4 space-y-3">
                <div>
                  <label className="block text-xs font-bold text-[#44655b] mb-1">
                    Customer Name
                  </label>
                  <input
                    type="text"
                    required
                    className="w-full rounded-xl border border-[#d8e3de] px-3 py-2 text-xs text-[#11382f] outline-none focus:border-[#0e655d]"
                    placeholder="e.g. Apex Telecom"
                    value={newCustomer.name}
                    onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#44655b] mb-1">
                    Phone / WhatsApp Number
                  </label>
                  <input
                    type="text"
                    required
                    className="w-full rounded-xl border border-[#d8e3de] px-3 py-2 text-xs text-[#11382f] outline-none focus:border-[#0e655d]"
                    placeholder="+91 98765 00000"
                    value={newCustomer.phone}
                    onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#44655b] mb-1">
                    Outstanding Amount (₹)
                  </label>
                  <input
                    type="number"
                    required
                    className="w-full rounded-xl border border-[#d8e3de] px-3 py-2 text-xs text-[#11382f] outline-none focus:border-[#0e655d]"
                    placeholder="50000"
                    value={newCustomer.amount}
                    onChange={(e) => setNewCustomer({ ...newCustomer, amount: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#44655b] mb-1">
                    Due Age
                  </label>
                  <select
                    className="w-full rounded-xl border border-[#d8e3de] px-3 py-2 text-xs text-[#11382f] outline-none focus:border-[#0e655d]"
                    value={newCustomer.days}
                    onChange={(e) => setNewCustomer({ ...newCustomer, days: e.target.value })}
                  >
                    <option value="15">0–30 days (Healthy)</option>
                    <option value="45">31–60 days (Follow-up)</option>
                    <option value="75">60+ days (Critical)</option>
                  </select>
                </div>
              </div>
              <div className="mt-5 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setAddModalOpen(false)}
                  className="rounded-xl border border-[#d6e2dd] py-2.5 text-xs font-bold text-[#55736a]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-[#0e655d] py-2.5 text-xs font-bold text-white shadow-xs"
                >
                  Save Debtor
                </button>
              </div>
            </form>
          </div>
        )}
      </main>
    </div>
  )
}
