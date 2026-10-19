import { useState, useMemo } from 'react'
import { 
  Users, 
  Search, 
  Plus, 
  ShieldCheck, 
  Phone, 
  Mail, 
  MapPin, 
  X, 
  FileText, 
  History, 
  Building2
} from 'lucide-react'
import { accDb, createVoucher, isPartyNameTaken } from '../lib/accountingDb'
import { useLiveQuery } from 'dexie-react-hooks'
import { useTable, useRows, EMPTY } from '../lib/useTable'
import { useUI } from '../context/UIContext'
import { todayISO } from '../lib/format'
import { useAuth } from '../context/AuthContext'

export default function PartiesPage() {
  const { isAdmin, isOwner } = useAuth()
  const ui = useUI()
  const partiesRaw = useTable('parties')
  const parties = useMemo(() => partiesRaw ?? [], [partiesRaw])
  const ledgers = useRows('ledgers')
  const accounts = ledgers.filter((l) => l.group === 'Cash-in-hand' || l.group === 'Bank Accounts')
  const [activeTab, setActiveTab] = useState('debtor') // 'debtor' | 'creditor'
  const [searchTerm, setSearchTerm] = useState('')

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
    opening_balance: 0 })

  // Quick Receipt / Payment Modal
  const [quickSettleParty, setQuickSettleParty] = useState(null)
  const [settleAmount, setSettleAmount] = useState(0)
  const [settleMode, setSettleMode] = useState('')
  const [settleNarration, setSettleNarration] = useState('')
  const [isSettleModalOpen, setIsSettleModalOpen] = useState(false)
  const [settling, setSettling] = useState(false)

  // Statement Drilldown Modal
  const [statementParty, setStatementParty] = useState(null)
  const [isStatementOpen, setIsStatementOpen] = useState(false)

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
      opening_balance: 0 })
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
      opening_balance: party.opening_balance || 0 })
    setIsPartyModalOpen(true)
  }

  async function handleSaveParty(e) {
    e.preventDefault()
    if (isOwner) return
    const name = partyForm.name.trim()
    if (!name) return

    if (await isPartyNameTaken(name, partyForm.type, editingParty?.id ?? null)) {
      ui.toast(`A ${partyForm.type === 'debtor' ? 'customer' : 'supplier'} named "${name}" already exists`, 'error')
      return
    }

    // UID is system-assigned and permanent: never taken from the form.
    const { uid: _uid, ...fields } = partyForm
    if (editingParty) {
      // Changing the opening balance must move the running balance by the same amount.
      const delta = (Number(fields.opening_balance) || 0) - (Number(editingParty.opening_balance) || 0)
      await accDb.parties.update(editingParty.id, {
        ...fields,
        name,
        opening_balance: Number(fields.opening_balance) || 0,
        current_balance: Math.round(((Number(editingParty.current_balance) || 0) + delta) * 100) / 100 })
    } else {
      await accDb.parties.add({
        ...fields,
        name,
        uid: null,
        opening_balance: Number(fields.opening_balance) || 0,
        current_balance: Number(fields.opening_balance) || 0,
        created_at: new Date().toISOString() })
    }
    ui.toast(editingParty ? 'Party updated' : 'Party added')
    setIsPartyModalOpen(false)
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
      const account = accounts.find((l) => String(l.id) === String(settleMode)) || accounts.find((l) => l.group === 'Cash-in-hand') || accounts[0]
      await createVoucher({
        voucher_type: vchType,
        date: todayISO(),
        party_id: quickSettleParty.id,
        party_name: quickSettleParty.name,
        party_uid: quickSettleParty.uid || null,
        amount: amt,
        paid_amount: amt,
        due_amount: 0,
        payment_ledger_id: Number(account?.id) || null,
        payment_mode: account?.name || '',
        narration: settleNarration })

      setSettling(false)
      ui.toast(`${vchType === 'receipt' ? 'Received' : 'Paid'} ₹${amt.toLocaleString('en-IN')}`)
      setIsSettleModalOpen(false)
      } catch (err) {
      ui.toast(err.message || 'Failed to post settlement', 'error')
      setSettling(false)
    }
  }

  // Vouchers are only read while a statement is open
  const vouchers = useLiveQuery(() => (statementParty ? accDb.vouchers.toArray() : []), [statementParty?.id]) ?? EMPTY

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
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans pb-16">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 pt-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-2">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight flex items-center gap-2.5">
                <Users className="w-7 h-7 text-indigo-600" />
                <span>Debtors & Creditors Directory</span>
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                Tally Party Ledger
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-600 mt-1">
              Customers with closing due balances have permanent UIDs permanently linked for circulating future transactions.
            </p>
          </div>

          {isAdmin && (
            <button
              type="button"
              onClick={openCreateParty}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-xs flex items-center gap-2 transition-all active:scale-95"
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
            className={`p-5 rounded-xl border transition-all cursor-pointer shadow-xs ${
              activeTab === 'debtor'
                ? 'bg-blue-50 border-2 border-blue-600'
                : 'bg-white border-slate-200 hover:border-slate-300'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-blue-700 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-blue-600" />
                <span>Sundry Debtors (Receivables)</span>
              </span>
              <span className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded text-xs font-bold">
                {parties.filter((p) => p.type === 'debtor').length} Parties
              </span>
            </div>
            <div className="text-2xl font-black text-slate-900 mt-2">
              ₹{totalReceivables.toLocaleString()}
            </div>
            <p className="text-xs text-slate-500 mt-1 font-medium">
              Money due to you from customers with permanent UIDs
            </p>
          </div>

          <div
            onClick={() => setActiveTab('creditor')}
            className={`p-5 rounded-xl border transition-all cursor-pointer shadow-xs ${
              activeTab === 'creditor'
                ? 'bg-rose-50 border-2 border-rose-600'
                : 'bg-white border-slate-200 hover:border-slate-300'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-rose-700 flex items-center gap-1.5">
                <Building2 className="w-4 h-4 text-rose-600" />
                <span>Sundry Creditors (Payables)</span>
              </span>
              <span className="px-2 py-0.5 bg-rose-100 text-rose-800 rounded text-xs font-bold">
                {parties.filter((p) => p.type === 'creditor').length} Parties
              </span>
            </div>
            <div className="text-2xl font-black text-slate-900 mt-2">
              ₹{totalPayables.toLocaleString()}
            </div>
            <p className="text-xs text-slate-500 mt-1 font-medium">
              Money owed to suppliers for materials and goods
            </p>
          </div>
        </div>

        {/* Filter Toolbar */}
        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder={`Search ${activeTab === 'debtor' ? 'customer name, UID, phone...' : 'supplier name, phone...'}`}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          <span className="text-xs text-slate-600 font-bold">
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
                  className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex flex-col justify-between hover:border-slate-300 transition-all space-y-4"
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="font-bold text-slate-900 text-base leading-snug">{party.name}</h3>
                        {party.uid ? (
                          <div className="mt-1 inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-blue-50 text-blue-700 text-xs font-mono font-bold border border-blue-200">
                            <ShieldCheck className="w-3.5 h-3.5 text-blue-600" />
                            <span>UID: {party.uid}</span>
                          </div>
                        ) : (
                          <span className="text-[11px] text-slate-400 italic block mt-0.5 font-medium">No UID (Cash walk-in)</span>
                        )}
                      </div>

                      <div className="text-right">
                        <span className="text-[10px] text-slate-500 uppercase tracking-wider block font-bold">
                          {party.type === 'debtor' ? 'Outstanding Due' : 'Balance Payable'}
                        </span>
                        <div className={`text-lg font-black ${hasDue ? (party.type === 'debtor' ? 'text-rose-700' : 'text-amber-800') : 'text-slate-400'}`}>
                          ₹{due.toLocaleString()}
                        </div>
                      </div>
                    </div>

                    <div className="text-xs text-slate-600 space-y-1 pt-1 font-medium">
                      {party.phone && (
                        <div className="flex items-center gap-2">
                          <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span>{party.phone}</span>
                        </div>
                      )}
                      {party.email && (
                        <div className="flex items-center gap-2">
                          <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span className="truncate">{party.email}</span>
                        </div>
                      )}
                      {party.address && (
                        <div className="flex items-center gap-2">
                          <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span className="truncate">{party.address}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => { setStatementParty(party); setIsStatementOpen(true) }}
                      className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold flex items-center gap-1.5 transition-colors"
                      title="View bill-by-bill ledger statement"
                    >
                      <History className="w-3.5 h-3.5 text-blue-600" />
                      <span>Statement</span>
                    </button>

                    <div className="flex items-center gap-2">
                      {isAdmin && (
                        <>
                          {hasDue && (
                            <button
                              type="button"
                              onClick={() => openQuickSettle(party)}
                              className={`px-3 py-1.5 rounded-xl text-white text-xs font-bold transition-all shadow-xs ${
                                party.type === 'debtor'
                                  ? 'bg-teal-600 hover:bg-teal-700'
                                  : 'bg-rose-600 hover:bg-rose-700'
                              }`}
                            >
                              {party.type === 'debtor' ? 'Receive (F6)' : 'Pay (F5)'}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => openEditParty(party)}
                            className="p-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
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
            <div className="col-span-full py-12 text-center text-slate-500 bg-white rounded-xl border border-slate-200 font-medium">
              No {activeTab === 'debtor' ? 'debtor customers' : 'creditor suppliers'} found.
            </div>
          )}
        </div>
      </main>

      {/* Add / Edit Party Modal */}
      {isPartyModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50">
          <div
            className="w-full max-w-md bg-white rounded-2xl p-6 border border-slate-200 shadow-xl text-slate-900 font-sans"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h2 className="text-base font-bold text-slate-900">
                {editingParty ? `Edit ${editingParty.type === 'debtor' ? 'Customer' : 'Supplier'}` : `Add New ${partyForm.type === 'debtor' ? 'Customer' : 'Supplier'}`}
              </h2>
              <button onClick={() => setIsPartyModalOpen(false)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveParty} className="space-y-3.5 pt-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Party / Company Name *</label>
                <input
                  type="text"
                  required
                  value={partyForm.name}
                  onChange={(e) => setPartyForm({ ...partyForm, name: e.target.value })}
                  placeholder="e.g. Apex Infotech Pvt Ltd"
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Account Type</label>
                  <select
                    value={partyForm.type}
                    onChange={(e) => setPartyForm({ ...partyForm, type: e.target.value })}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  >
                    <option value="debtor">Sundry Debtor (Customer)</option>
                    <option value="creditor">Sundry Creditor (Supplier)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Permanent UID</label>
                  <input
                    type="text"
                    value={partyForm.uid}
                    readOnly
                    placeholder="Assigned automatically on the first credit sale"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono font-bold text-blue-700 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Phone Number</label>
                <input
                  type="text"
                  value={partyForm.phone}
                  onChange={(e) => setPartyForm({ ...partyForm, phone: e.target.value })}
                  placeholder="+91 98450 11223"
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Email Address</label>
                <input
                  type="email"
                  value={partyForm.email}
                  onChange={(e) => setPartyForm({ ...partyForm, email: e.target.value })}
                  placeholder="accounts@company.com"
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Billing Address</label>
                <textarea
                  rows={2}
                  value={partyForm.address}
                  onChange={(e) => setPartyForm({ ...partyForm, address: e.target.value })}
                  placeholder="Plot #, Street, City, State"
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none"
                />
              </div>

              <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsPartyModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:text-slate-900"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs"
                >
                  {editingParty ? 'Save Changes' : 'Create Party Master'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Quick Settlement Modal (Receipt F6 / Payment F5) */}
      {isSettleModalOpen && quickSettleParty && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50">
          <div
            className="w-full max-w-md bg-white rounded-2xl p-6 border border-slate-200 shadow-xl text-slate-900 font-sans"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div>
                <span className="text-[10px] font-mono font-bold uppercase text-teal-700">
                  {quickSettleParty.type === 'debtor' ? 'Voucher F6: Receipt' : 'Voucher F5: Payment'}
                </span>
                <h2 className="text-base font-bold text-slate-900 mt-0.5">
                  Settle with {quickSettleParty.name}
                </h2>
              </div>
              <button onClick={() => setIsSettleModalOpen(false)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleQuickSettleSubmit} className="space-y-4 pt-4">
              {quickSettleParty.uid && (
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl flex items-center gap-2 text-xs text-blue-900 font-medium">
                  <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0" />
                  <span>Circulating through Permanent UID: <strong>{quickSettleParty.uid}</strong></span>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Settlement Amount (₹) *</label>
                <input
                  type="number"
                  min="1"
                  step="any"
                  required
                  value={settleAmount}
                  onChange={(e) => setSettleAmount(e.target.value)}
                  className="w-full px-3 py-2.5 bg-white border border-slate-300 rounded-xl text-base font-black text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-600"
                />
                <span className="text-[11px] text-slate-500 mt-1 block font-medium">
                  Current pending balance: ₹{Number(quickSettleParty.current_balance || 0).toLocaleString()}
                </span>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Deposit Into / Paid From</label>
                <select
                  value={settleMode}
                  onChange={(e) => setSettleMode(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-600"
                >
                  <option value="">Cash in Hand (default)</option>
                  {accounts.map((l) => (
                    <option key={l.id} value={l.id}>{l.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Narration / Reference</label>
                <input
                  type="text"
                  value={settleNarration}
                  onChange={(e) => setSettleNarration(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-900"
                />
              </div>

              <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsSettleModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:text-slate-900"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={settling}
                  className="px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold shadow-xs flex items-center gap-1.5"
                >
                  {settling ? 'Processing...' : 'Post Settlement'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bill-by-bill Party Statement Modal */}
      {isStatementOpen && statementParty && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-900/50">
          <div
            className="w-full max-w-3xl bg-white rounded-2xl p-6 border border-slate-200 shadow-xl text-slate-900 font-sans max-h-[90vh] flex flex-col"
          >
            <div className="flex items-center justify-between pb-4 border-b border-slate-200 shrink-0">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-bold uppercase text-blue-700">Ledger Statement</span>
                  {statementParty.uid && (
                    <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 text-[10px] font-mono font-bold border border-blue-200">
                      Permanent UID: {statementParty.uid}
                    </span>
                  )}
                </div>
                <h2 className="text-lg font-bold text-slate-900 mt-1">{statementParty.name}</h2>
              </div>
              <button onClick={() => setIsStatementOpen(false)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="py-4 overflow-y-auto flex-1">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 text-slate-700 uppercase text-[10px] font-bold border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-3">Date</th>
                    <th className="py-2.5 px-3">Voucher No.</th>
                    <th className="py-2.5 px-3">Type</th>
                    <th className="py-2.5 px-3">Particulars / Items</th>
                    <th className="py-2.5 px-3 text-right">Debit (₹)</th>
                    <th className="py-2.5 px-3 text-right">Credit (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {statementVouchers.length > 0 ? (
                    statementVouchers.map((v) => {
                      const isDebit = v.voucher_type === 'sales'
                      return (
                        <tr key={v.id} className="hover:bg-slate-50 transition-colors">
                          <td className="py-3 px-3 text-slate-600 font-mono">{v.date}</td>
                          <td className="py-3 px-3 font-mono text-slate-900 font-black">{v.voucher_no}</td>
                          <td className="py-3 px-3 uppercase text-[10px] font-bold text-slate-700">{v.voucher_type}</td>
                          <td className="py-3 px-3 text-slate-600 font-medium">
                            {Array.isArray(v.items) && v.items.length > 0
                              ? v.items.map((i) => `${i.name} (${i.qty})`).join(', ')
                              : v.narration || '-'}
                          </td>
                          <td className="py-3 px-3 text-right text-rose-700 font-black">
                            {isDebit ? `₹${Number(v.amount || 0).toLocaleString()}` : '-'}
                          </td>
                          <td className="py-3 px-3 text-right text-emerald-700 font-black">
                            {!isDebit ? `₹${Number(v.amount || 0).toLocaleString()}` : '-'}
                          </td>
                        </tr>
                      )
                    })
                  ) : (
                    <tr>
                      <td colSpan={6} className="py-6 text-center text-slate-500 font-medium">
                        No transactions recorded yet for this party.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="pt-4 border-t border-slate-200 flex justify-between items-center text-xs shrink-0">
              <span className="text-slate-600 font-semibold">Total Running Outstanding Balance:</span>
              <span className="text-lg font-black text-slate-900">
                ₹{Number(statementParty.current_balance || 0).toLocaleString()}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
