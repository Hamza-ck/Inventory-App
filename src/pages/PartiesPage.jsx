import { useEffect, useState, useMemo } from 'react'
import { useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import { 
  Users, 
  Search, 
  Plus, 
  ShieldCheck, 
  Phone, 
  Mail, 
  MapPin, 
  DollarSign, 
  ArrowUpRight, 
  ArrowDownLeft, 
  Check, 
  X, 
  FileText, 
  History, 
  Receipt,
  CreditCard,
  Building2
} from 'lucide-react'
import { accDb, createVoucher } from '../lib/accountingDb'
import { useAuth } from '../context/AuthContext'
import Nav from '../components/Nav'
import VoucherModal from '../components/VoucherModal'

export default function PartiesPage() {
  const { isAdmin, isOwner } = useAuth()
  const location = useLocation()
  const [parties, setParties] = useState([])
  const [vouchers, setVouchers] = useState([])
  const [activeTab, setActiveTab] = useState(location.pathname === '/creditors' ? 'creditor' : 'debtor') // 'debtor' | 'creditor'
  const [searchTerm, setSearchTerm] = useState('')
  const [loading, setLoading] = useState(true)

  // Party CRUD Modal
  const [isPartyModalOpen, setIsPartyModalOpen] = useState(false)
  const [editingParty, setEditingParty] = useState(null)
  const [partyForm, setPartyForm] = useState({
    name: '',
    type: 'debtor',
    uid: '',
    phone: '',
    email: '',
    address: '',
    opening_balance: 0,
  })

  // Quick Receipt / Payment Modal
  const [quickSettleParty, setQuickSettleParty] = useState(null)
  const [settleAmount, setSettleAmount] = useState(0)
  const [settleMode, setSettleMode] = useState('HDFC Bank')
  const [settleNarration, setSettleNarration] = useState('')
  const [isSettleModalOpen, setIsSettleModalOpen] = useState(false)
  const [settling, setSettling] = useState(false)

  // Statement Drilldown Modal
  const [statementParty, setStatementParty] = useState(null)
  const [isStatementOpen, setIsStatementOpen] = useState(false)

  useEffect(() => {
    setActiveTab(location.pathname === '/creditors' ? 'creditor' : 'debtor')
  }, [location.pathname])

  useEffect(() => {
    load()
    function handleUpdate() { load() }
    window.addEventListener('accounting-data-updated', handleUpdate)
    return () => window.removeEventListener('accounting-data-updated', handleUpdate)
  }, [])

  async function load() {
    setLoading(true)
    const pts = await accDb.parties.toArray()
    const vchs = await accDb.vouchers.toArray()
    setParties(pts)
    setVouchers(vchs)
    setLoading(false)
  }

  const currentList = useMemo(() => {
    return parties.filter((p) => {
      const matchType = p.type === activeTab
      const q = searchTerm.toLowerCase().trim()
      const matchSearch = !q || 
        p.name.toLowerCase().includes(q) ||
        (p.uid && p.uid.toLowerCase().includes(q)) ||
        (p.phone && p.phone.includes(q))
      return matchType && matchSearch
    })
  }, [parties, activeTab, searchTerm])

  const totalReceivables = parties
    .filter((p) => p.type === 'debtor')
    .reduce((sum, p) => sum + (Number(p.current_balance) || 0), 0)

  const totalPayables = parties
    .filter((p) => p.type === 'creditor')
    .reduce((sum, p) => sum + (Number(p.current_balance) || 0), 0)

  function openCreateParty() {
    setEditingParty(null)
    setPartyForm({
      name: '',
      type: activeTab,
      uid: '',
      phone: '',
      email: '',
      address: '',
      opening_balance: 0,
    })
    setIsPartyModalOpen(true)
  }

  function openEditParty(party) {
    setEditingParty(party)
    setPartyForm({
      name: party.name,
      type: party.type,
      uid: party.uid || '',
      phone: party.phone || '',
      email: party.email || '',
      address: party.address || '',
      opening_balance: party.opening_balance || 0,
    })
    setIsPartyModalOpen(true)
  }

  async function handleSaveParty(e) {
    e.preventDefault()
    if (isOwner) return

    if (!partyForm.name.trim()) return

    if (editingParty) {
      await accDb.parties.update(editingParty.id, {
        ...partyForm,
        name: partyForm.name.trim(),
      })
    } else {
      await accDb.parties.add({
        ...partyForm,
        name: partyForm.name.trim(),
        current_balance: Number(partyForm.opening_balance) || 0,
        created_at: new Date().toISOString(),
      })
    }

    setIsPartyModalOpen(false)
    load()
  }

  function openQuickSettle(party) {
    setQuickSettleParty(party)
    setSettleAmount(Number(party.current_balance || 0))
    setSettleNarration(party.type === 'debtor' ? `Payment received from ${party.name} (${party.uid || 'Debtor'})` : `Payment made to ${party.name}`)
    setIsSettleModalOpen(true)
  }

  async function handleQuickSettleSubmit(e) {
    e.preventDefault()
    if (isOwner || !quickSettleParty) return
    const amt = Number(settleAmount)
    if (amt <= 0) return

    setSettling(true)
    try {
      const vchType = quickSettleParty.type === 'debtor' ? 'receipt' : 'payment'
      await createVoucher({
        voucher_type: vchType,
        voucher_no: `${vchType.toUpperCase().slice(0, 3)}-${Date.now().toString().slice(-5)}`,
        date: new Date().toISOString().slice(0, 10),
        party_id: quickSettleParty.id,
        party_name: quickSettleParty.name,
        party_uid: quickSettleParty.uid || null,
        amount: amt,
        paid_amount: amt,
        due_amount: 0,
        payment_mode: settleMode,
        narration: settleNarration,
      })

      setSettling(false)
      setIsSettleModalOpen(false)
      load()
    } catch (err) {
      alert(err.message || 'Failed to post settlement')
      setSettling(false)
    }
  }

  // Get Party statement vouchers
  const statementVouchers = useMemo(() => {
    if (!statementParty) return []
    return vouchers.filter((v) => {
      if (v.party_id && String(v.party_id) === String(statementParty.id)) return true
      if (v.party_uid && statementParty.uid && v.party_uid === statementParty.uid) return true
      if (v.party_name && statementParty.name && v.party_name.toLowerCase().trim() === statementParty.name.toLowerCase().trim()) return true
      return false
    }).sort((a, b) => new Date(a.date || a.createdAt) - new Date(b.date || b.createdAt))
  }, [vouchers, statementParty])

  return (
    <div className="min-h-screen bg-[#f4f7f4] text-[#172f2c] font-sans pb-28 lg:pb-0">
      <Nav />

      <main className="min-h-screen bg-[#f4f7f4] px-4 pb-28 pt-5 text-[#172f2c] sm:px-6 lg:ml-64 lg:w-[calc(100%-16rem)] lg:px-9 lg:pb-8 lg:pt-8 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-2">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl sm:text-3xl font-black text-[#172f2c] tracking-tight flex items-center gap-2.5">
                <Users className="w-7 h-7 text-[#0e7a70]" />
                <span>Debtors & Creditors Directory</span>
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-[#e6f4ee] text-[#0e7669] border border-[#c6e5d9]">
                Tally Party Ledger
              </span>
            </div>
            <p className="text-xs sm:text-sm text-[#71827a] mt-1">
              Customers with closing due balances have permanent UIDs permanently linked for circulating future transactions.
            </p>
          </div>

          {isAdmin && (
            <button
              type="button"
              onClick={openCreateParty}
              className="px-4 py-2 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 text-white rounded-xl text-xs font-bold shadow-lg shadow-indigo-600/30 flex items-center gap-2 transition-all active:scale-95"
            >
              <Plus className="w-4 h-4" />
              <span>+ Add {activeTab === 'debtor' ? 'Customer' : 'Supplier'}</span>
            </button>
          )}
        </div>

        {/* Tab & Metric Overview Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div
            onClick={() => setActiveTab('debtor')}
            className={`p-5 rounded-2xl border transition-all cursor-pointer ${
              activeTab === 'debtor'
                ? 'bg-[#e7f5ef] border-blue-500 shadow-lg shadow-blue-500/10'
                : 'bg-white border-[#e1e8e3] hover:border-[#d3e1d8]'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-[#0e7a70] flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-[#0e7a70]" />
                <span>Sundry Debtors (Receivables)</span>
              </span>
              <span className="px-2 py-0.5 bg-[#e6f4ee] text-[#0e7669] rounded text-xs font-bold">
                {parties.filter((p) => p.type === 'debtor').length} Parties
              </span>
            </div>
            <div className="text-2xl font-black text-[#172f2c] mt-2">
              ₹{totalReceivables.toLocaleString()}
            </div>
            <p className="text-xs text-[#71827a] mt-1">
              Money due to you from customers with permanent UIDs
            </p>
          </div>

          <div
            onClick={() => setActiveTab('creditor')}
            className={`p-5 rounded-2xl border transition-all cursor-pointer ${
              activeTab === 'creditor'
                ? 'bg-[#fff3ef] border-rose-500 shadow-lg shadow-rose-500/10'
                : 'bg-white border-[#e1e8e3] hover:border-[#d3e1d8]'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-[#ad5545] flex items-center gap-1.5">
                <Building2 className="w-4 h-4 text-[#ad5545]" />
                <span>Sundry Creditors (Payables)</span>
              </span>
              <span className="px-2 py-0.5 bg-[#fff0eb] text-[#a94a3f] rounded text-xs font-bold">
                {parties.filter((p) => p.type === 'creditor').length} Parties
              </span>
            </div>
            <div className="text-2xl font-black text-[#172f2c] mt-2">
              ₹{totalPayables.toLocaleString()}
            </div>
            <p className="text-xs text-[#71827a] mt-1">
              Money owed to suppliers for materials and goods
            </p>
          </div>
        </div>

        {/* Filter Toolbar */}
        <div className="bg-white p-3.5 rounded-2xl border border-[#e1e8e3] flex items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#71827a]" />
            <input
              type="text"
              placeholder={`Search ${activeTab === 'debtor' ? 'customer name, UID, phone...' : 'supplier name, phone...'}`}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 bg-[#f4f7f4] border border-[#e1e8e3] rounded-xl text-xs font-medium text-[#172f2c] placeholder:text-[#8a9991] focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <span className="text-xs text-[#71827a] font-semibold">
            Showing {currentList.length} {activeTab === 'debtor' ? 'Debtors' : 'Creditors'}
          </span>
        </div>

        {/* Parties Grid / Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {currentList.length > 0 ? (
            currentList.map((party) => {
              const due = Number(party.current_balance || 0)
              const hasDue = due > 0
              return (
                <div
                  key={party.id}
                  className="bg-white p-5 rounded-2xl border border-[#e1e8e3] shadow-md flex flex-col justify-between hover:border-[#d3e1d8] transition-all space-y-4"
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="font-bold text-[#172f2c] text-base leading-snug">{party.name}</h3>
                        {party.uid ? (
                          <div className="mt-1 inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-[#e6f4ee] text-[#0e7669] text-xs font-mono font-bold border border-[#c6e5d9]">
                            <ShieldCheck className="w-3.5 h-3.5 text-[#0e7a70]" />
                            <span>UID: {party.uid}</span>
                          </div>
                        ) : (
                          <span className="text-[11px] text-[#8a9991] italic block mt-0.5">No UID (Cash walk-in)</span>
                        )}
                      </div>

                      <div className="text-right">
                        <span className="text-[10px] text-[#71827a] uppercase tracking-wider block">
                          {party.type === 'debtor' ? 'Outstanding Due' : 'Balance Payable'}
                        </span>
                        <div className={`text-lg font-black ${hasDue ? (party.type === 'debtor' ? 'text-[#ad5545]' : 'text-[#a6651e]') : 'text-[#71827a]'}`}>
                          ₹{due.toLocaleString()}
                        </div>
                      </div>
                    </div>

                    <div className="text-xs text-[#71827a] space-y-1 pt-1">
                      {party.phone && (
                        <div className="flex items-center gap-2">
                          <Phone className="w-3.5 h-3.5 text-[#8a9991] shrink-0" />
                          <span>{party.phone}</span>
                        </div>
                      )}
                      {party.email && (
                        <div className="flex items-center gap-2">
                          <Mail className="w-3.5 h-3.5 text-[#8a9991] shrink-0" />
                          <span className="truncate">{party.email}</span>
                        </div>
                      )}
                      {party.address && (
                        <div className="flex items-center gap-2">
                          <MapPin className="w-3.5 h-3.5 text-[#8a9991] shrink-0" />
                          <span className="truncate">{party.address}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="pt-3 border-t border-[#e1e8e3] flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => { setStatementParty(party); setIsStatementOpen(true) }}
                      className="px-3 py-1.5 rounded-xl bg-slate-700/70 hover:bg-[#edf5f0] text-[#435b52] text-xs font-semibold flex items-center gap-1.5 transition-colors"
                      title="View bill-by-bill ledger statement"
                    >
                      <History className="w-3.5 h-3.5 text-[#0e7a70]" />
                      <span>Statement</span>
                    </button>

                    <div className="flex items-center gap-2">
                      {isAdmin && (
                        <>
                          {hasDue && (
                            <button
                              type="button"
                              onClick={() => openQuickSettle(party)}
                              className={`px-3 py-1.5 rounded-xl text-white text-xs font-bold transition-all ${
                                party.type === 'debtor'
                                  ? 'bg-teal-600 hover:bg-teal-500 shadow-xs shadow-teal-600/30'
                                  : 'bg-rose-600 hover:bg-rose-500 shadow-xs shadow-rose-600/30'
                              }`}
                            >
                              {party.type === 'debtor' ? 'Receive (F6)' : 'Pay (F5)'}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => openEditParty(party)}
                            className="p-1.5 rounded-xl bg-slate-700 hover:bg-slate-600 text-[#52685e] transition-colors"
                            title="Edit Party Details"
                          >
                            <FileText className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )
            })
          ) : (
            <div className="col-span-full py-12 text-center text-[#8a9991] bg-white/40 rounded-2xl border border-[#e1e8e3]">
              No {activeTab === 'debtor' ? 'debtor customers' : 'creditor suppliers'} found.
            </div>
          )}
        </div>
      </main>

      {/* Add / Edit Party Modal */}
      {isPartyModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-xs">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-md bg-[#f4f7f4] rounded-2xl p-6 border border-[#e1e8e3] shadow-2xl text-[#172f2c] font-sans"
          >
            <div className="flex items-center justify-between pb-3 border-b border-[#e1e8e3]">
              <h2 className="text-base font-bold text-[#172f2c]">
                {editingParty ? `Edit ${editingParty.type === 'debtor' ? 'Customer' : 'Supplier'}` : `Add New ${partyForm.type === 'debtor' ? 'Customer' : 'Supplier'}`}
              </h2>
              <button onClick={() => setIsPartyModalOpen(false)} className="text-[#71827a] hover:text-[#172f2c]">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveParty} className="space-y-3.5 pt-4">
              <div>
                <label className="block text-xs font-bold text-[#52685e] mb-1">Party / Company Name *</label>
                <input
                  type="text"
                  required
                  value={partyForm.name}
                  onChange={(e) => setPartyForm({ ...partyForm, name: e.target.value })}
                  placeholder="e.g. Apex Infotech Pvt Ltd"
                  className="w-full px-3 py-2 bg-white border border-[#e1e8e3] rounded-xl text-xs text-[#172f2c] focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-[#52685e] mb-1">Account Type</label>
                  <select
                    value={partyForm.type}
                    onChange={(e) => setPartyForm({ ...partyForm, type: e.target.value })}
                    className="w-full px-3 py-2 bg-white border border-[#e1e8e3] rounded-xl text-xs text-[#172f2c] focus:outline-none"
                  >
                    <option value="debtor">Sundry Debtor (Customer)</option>
                    <option value="creditor">Sundry Creditor (Supplier)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#52685e] mb-1">Permanent UID</label>
                  <input
                    type="text"
                    value={partyForm.uid}
                    onChange={(e) => setPartyForm({ ...partyForm, uid: e.target.value })}
                    placeholder="Auto or e.g. UID-CUST-1001"
                    className="w-full px-3 py-2 bg-white border border-[#e1e8e3] rounded-xl text-xs font-mono text-[#0e7669] focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#52685e] mb-1">Phone Number</label>
                <input
                  type="text"
                  value={partyForm.phone}
                  onChange={(e) => setPartyForm({ ...partyForm, phone: e.target.value })}
                  placeholder="+91 98450 11223"
                  className="w-full px-3 py-2 bg-white border border-[#e1e8e3] rounded-xl text-xs text-[#172f2c] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#52685e] mb-1">Email Address</label>
                <input
                  type="email"
                  value={partyForm.email}
                  onChange={(e) => setPartyForm({ ...partyForm, email: e.target.value })}
                  placeholder="accounts@company.com"
                  className="w-full px-3 py-2 bg-white border border-[#e1e8e3] rounded-xl text-xs text-[#172f2c] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#52685e] mb-1">Billing Address</label>
                <textarea
                  rows={2}
                  value={partyForm.address}
                  onChange={(e) => setPartyForm({ ...partyForm, address: e.target.value })}
                  placeholder="Plot #, Street, City, State"
                  className="w-full px-3 py-2 bg-white border border-[#e1e8e3] rounded-xl text-xs text-[#172f2c] focus:outline-none"
                />
              </div>

              <div className="pt-3 border-t border-[#e1e8e3] flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsPartyModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs text-[#71827a] hover:text-[#172f2c]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-md shadow-blue-600/30"
                >
                  {editingParty ? 'Save Changes' : 'Create Party Master'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* Quick Settlement Modal (Receipt F6 / Payment F5) */}
      {isSettleModalOpen && quickSettleParty && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-xs">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-md bg-[#f4f7f4] rounded-2xl p-6 border border-[#e1e8e3] shadow-2xl text-[#172f2c] font-sans"
          >
            <div className="flex items-center justify-between pb-3 border-b border-[#e1e8e3]">
              <div>
                <span className="text-[10px] font-mono font-bold uppercase text-[#0e7a70]">
                  {quickSettleParty.type === 'debtor' ? 'Voucher F6: Receipt' : 'Voucher F5: Payment'}
                </span>
                <h2 className="text-base font-bold text-[#172f2c] mt-0.5">
                  Settle with {quickSettleParty.name}
                </h2>
              </div>
              <button onClick={() => setIsSettleModalOpen(false)} className="text-[#71827a] hover:text-[#172f2c]">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleQuickSettleSubmit} className="space-y-4 pt-4">
              {quickSettleParty.uid && (
                <div className="p-3 bg-blue-950/50 border border-[#c6e5d9] rounded-xl flex items-center gap-2 text-xs">
                  <ShieldCheck className="w-4 h-4 text-[#0e7a70] shrink-0" />
                  <span>Circulating through Permanent UID: <strong>{quickSettleParty.uid}</strong></span>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-[#52685e] mb-1">Settlement Amount (₹) *</label>
                <input
                  type="number"
                  min="1"
                  step="any"
                  required
                  value={settleAmount}
                  onChange={(e) => setSettleAmount(e.target.value)}
                  className="w-full px-3 py-2.5 bg-white border border-[#e1e8e3] rounded-xl text-base font-black text-[#172f2c] focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
                <span className="text-[11px] text-[#71827a] mt-1 block">
                  Current pending balance: ₹{Number(quickSettleParty.current_balance || 0).toLocaleString()}
                </span>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#52685e] mb-1">Deposit Into / Paid From</label>
                <select
                  value={settleMode}
                  onChange={(e) => setSettleMode(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-[#e1e8e3] rounded-xl text-xs text-[#172f2c]"
                >
                  <option value="HDFC Bank">HDFC Bank Current A/c</option>
                  <option value="State Bank of India">SBI Current A/c</option>
                  <option value="Cash">Cash in Hand</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#52685e] mb-1">Narration / Reference</label>
                <input
                  type="text"
                  value={settleNarration}
                  onChange={(e) => setSettleNarration(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-[#e1e8e3] rounded-xl text-xs text-[#172f2c]"
                />
              </div>

              <div className="pt-3 border-t border-[#e1e8e3] flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsSettleModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs text-[#71827a] hover:text-[#172f2c]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={settling}
                  className="px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold shadow-md shadow-teal-600/30 flex items-center gap-1.5"
                >
                  {settling ? 'Processing...' : 'Post Settlement'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* Bill-by-bill Party Statement Modal */}
      {isStatementOpen && statementParty && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/80 backdrop-blur-xs">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-3xl bg-[#f4f7f4] rounded-2xl p-6 border border-[#e1e8e3] shadow-2xl text-[#172f2c] font-sans max-h-[90vh] flex flex-col"
          >
            <div className="flex items-center justify-between pb-4 border-b border-[#e1e8e3] shrink-0">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-bold uppercase text-[#0e7a70]">Ledger Statement</span>
                  {statementParty.uid && (
                    <span className="px-2 py-0.5 rounded bg-[#e6f4ee] text-[#0e7669] text-[10px] font-mono font-bold border border-[#c6e5d9]">
                      Permanent UID: {statementParty.uid}
                    </span>
                  )}
                </div>
                <h2 className="text-lg font-bold text-[#172f2c] mt-1">{statementParty.name}</h2>
              </div>
              <button onClick={() => setIsStatementOpen(false)} className="text-[#71827a] hover:text-[#172f2c]">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="py-4 overflow-y-auto flex-1">
              <table className="w-full text-left text-xs">
                <thead className="bg-white text-[#71827a] uppercase text-[10px] font-bold">
                  <tr>
                    <th className="py-2.5 px-3">Date</th>
                    <th className="py-2.5 px-3">Voucher No.</th>
                    <th className="py-2.5 px-3">Type</th>
                    <th className="py-2.5 px-3">Particulars / Items</th>
                    <th className="py-2.5 px-3 text-right">Debit (₹)</th>
                    <th className="py-2.5 px-3 text-right">Credit (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 font-medium">
                  {statementVouchers.length > 0 ? (
                    statementVouchers.map((v) => {
                      const isDebit = v.voucher_type === 'sales'
                      return (
                        <tr key={v.id} className="hover:bg-[#f3f8f5]">
                          <td className="py-3 px-3 text-[#52685e] font-mono">{v.date}</td>
                          <td className="py-3 px-3 font-mono text-[#172f2c] font-bold">{v.voucher_no}</td>
                          <td className="py-3 px-3 uppercase text-[10px] font-bold">{v.voucher_type}</td>
                          <td className="py-3 px-3 text-[#71827a]">
                            {Array.isArray(v.items) && v.items.length > 0
                              ? v.items.map((i) => `${i.name} (${i.qty})`).join(', ')
                              : v.narration || '-'}
                          </td>
                          <td className="py-3 px-3 text-right text-[#ad5545] font-bold">
                            {isDebit ? `₹${Number(v.amount || 0).toLocaleString()}` : '-'}
                          </td>
                          <td className="py-3 px-3 text-right text-[#0e7a70] font-bold">
                            {!isDebit ? `₹${Number(v.amount || 0).toLocaleString()}` : '-'}
                          </td>
                        </tr>
                      )
                    })
                  ) : (
                    <tr>
                      <td colSpan={6} className="py-6 text-center text-[#8a9991]">
                        No transactions recorded yet for this party.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="pt-4 border-t border-[#e1e8e3] flex justify-between items-center text-xs shrink-0">
              <span className="text-[#71827a]">Total Running Outstanding Balance:</span>
              <span className="text-lg font-black text-[#172f2c]">
                ₹{Number(statementParty.current_balance || 0).toLocaleString()}
              </span>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  )
}
