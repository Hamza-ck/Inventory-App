import { useState } from 'react'
import { 
  Landmark, 
  ArrowRightLeft, 
  CreditCard, 
  Plus, 
  X 
} from 'lucide-react'
import { accDb, createVoucher } from '../lib/accountingDb'
import { useRows } from '../lib/useTable'
import { useUI } from '../context/UIContext'
import { todayISO } from '../lib/format'
import { useAuth } from '../context/AuthContext'

export default function BankingPage() {
  const { isAdmin, isOwner } = useAuth()
  const ui = useUI()
  const ledgers = useRows('ledgers')
  const vouchers = useRows('vouchers')

  // Contra Transfer Modal State
  const [isContraModalOpen, setIsContraModalOpen] = useState(false)
  const [sourceLedgerId, setSourceLedgerId] = useState('')
  const [destLedgerId, setDestLedgerId] = useState('')
  const [contraAmount, setContraAmount] = useState('')
  const [contraNarration, setContraNarration] = useState('')
  const [contraPosting, setContraPosting] = useState(false)

  // Add Account Modal
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false)
  const [newAccForm, setNewAccForm] = useState({
    name: '',
    group: 'Bank Accounts',
    opening_balance: 0 })

  // Split ledgers by group
  const cashAccounts = ledgers.filter((l) => l.group === 'Cash-in-hand')
  const bankAccounts = ledgers.filter((l) => l.group === 'Bank Accounts')
  const loanLiabilities = ledgers.filter((l) => l.group === 'Loans (Liability)')
  const loanAdvances = ledgers.filter((l) => l.group === 'Loans & Advances (Asset)')

  const totalCash = cashAccounts.reduce((sum, l) => sum + (Number(l.current_balance) || 0), 0)
  const totalBank = bankAccounts.reduce((sum, l) => sum + (Number(l.current_balance) || 0), 0)
  const totalLoansPayable = loanLiabilities.reduce((sum, l) => sum + (Number(l.current_balance) || 0), 0)
  const totalLoansReceivable = loanAdvances.reduce((sum, l) => sum + (Number(l.current_balance) || 0), 0)

  // Contra Vouchers
  const contraVouchers = vouchers
    .filter((v) => v.voucher_type === 'contra')
    .sort((a, b) => new Date(b.date || b.createdAt) - new Date(a.date || a.createdAt))

  async function handleContraSubmit(e) {
    e.preventDefault()
    if (isOwner) return
    const amt = Number(contraAmount)
    if (!sourceLedgerId || !destLedgerId || amt <= 0) return
    if (sourceLedgerId === destLedgerId) {
      ui.toast('Source and destination accounts must be different', 'error')
      return
    }

    setContraPosting(true)
    try {
      const src = ledgers.find((l) => String(l.id) === String(sourceLedgerId))
      const dst = ledgers.find((l) => String(l.id) === String(destLedgerId))

      await createVoucher({
        voucher_type: 'contra',
        date: todayISO(),
        amount: amt,
        paid_amount: amt,
        due_amount: 0,
        credit_ledger_id: sourceLedgerId,
        debit_ledger_id: destLedgerId,
        party_name: `${src?.name} → ${dst?.name}`,
        narration: contraNarration || `Transfer from ${src?.name} to ${dst?.name}` })

      setContraPosting(false)
      ui.toast('Transfer posted')
      setIsContraModalOpen(false)
      setContraAmount('')
      setContraNarration('')
    } catch (err) {
      ui.toast(err.message || 'Failed to post Contra voucher', 'error')
      setContraPosting(false)
    }
  }

  async function handleAddAccountSubmit(e) {
    e.preventDefault()
    if (isOwner) return
    if (!newAccForm.name.trim()) return
    if (await accDb.ledgers.where('name').equalsIgnoreCase(newAccForm.name.trim()).first()) {
      ui.toast('An account with this name already exists', 'error')
      return
    }

    await accDb.ledgers.add({
      name: newAccForm.name.trim(),
      group: newAccForm.group,
      opening_balance: Number(newAccForm.opening_balance) || 0,
      current_balance: Number(newAccForm.opening_balance) || 0,
      is_system: false })

    setIsAccountModalOpen(false)
    setNewAccForm({ name: '', group: 'Bank Accounts', opening_balance: 0 })
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans pb-16">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 pt-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-2">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight flex items-center gap-2.5">
                <Landmark className="w-7 h-7 text-teal-600" />
                <span>Cash, Bank & Loan Ledgers</span>
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-teal-50 text-teal-700 border border-teal-200">
                Liquid Accounts & Liabilities
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-600 mt-1">
              Live balances, internal contra transfers (F4), and loan liability tracking.
            </p>
          </div>

          {isAdmin && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsContraModalOpen(true)}
                className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold shadow-xs flex items-center gap-1.5 transition-all active:scale-95"
              >
                <ArrowRightLeft className="w-4 h-4" />
                <span>Contra Transfer (F4)</span>
              </button>

              <button
                type="button"
                onClick={() => setIsAccountModalOpen(true)}
                className="px-3.5 py-2 bg-white hover:bg-slate-50 border border-slate-300 text-slate-800 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 shadow-xs"
              >
                <Plus className="w-4 h-4" />
                <span>Add Account</span>
              </button>
            </div>
          )}
        </div>

        {/* 4 Cards: Cash, Bank, Loans Payable, Advances */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
            <span className="text-xs font-bold text-slate-600 uppercase tracking-wider block mb-1">Total Cash-in-Hand</span>
            <div className="text-2xl font-black text-slate-900">₹{totalCash.toLocaleString()}</div>
            <div className="text-[11px] text-slate-500 mt-2 pt-2 border-t border-slate-100 font-medium">
              Counter drawer & petty cash
            </div>
          </div>

          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
            <span className="text-xs font-bold text-teal-700 uppercase tracking-wider block mb-1">Total Bank Accounts</span>
            <div className="text-2xl font-black text-teal-700">₹{totalBank.toLocaleString()}</div>
            <div className="text-[11px] text-slate-500 mt-2 pt-2 border-t border-slate-100 font-medium">
              Across {bankAccounts.length} operational bank accounts
            </div>
          </div>

          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
            <span className="text-xs font-bold text-amber-700 uppercase tracking-wider block mb-1">Loans & Borrowings</span>
            <div className="text-2xl font-black text-amber-700">₹{totalLoansPayable.toLocaleString()}</div>
            <div className="text-[11px] text-slate-500 mt-2 pt-2 border-t border-slate-100 font-medium">
              Bank term loans & private debts
            </div>
          </div>

          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
            <span className="text-xs font-bold text-blue-700 uppercase tracking-wider block mb-1">Loans & Advances (Given)</span>
            <div className="text-2xl font-black text-blue-700">₹{totalLoansReceivable.toLocaleString()}</div>
            <div className="text-[11px] text-slate-500 mt-2 pt-2 border-t border-slate-100 font-medium">
              Staff advances & security deposits
            </div>
          </div>
        </div>

        {/* Bank & Cash Accounts List */}
        <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Landmark className="w-5 h-5 text-teal-600" />
                <span>Liquid Cash & Bank Ledgers</span>
              </h2>
              <p className="text-xs text-slate-500 font-medium">Running balances updated continuously by receipts, payments, and contra entries</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {[...cashAccounts, ...bankAccounts].map((acc) => (
              <div
                key={acc.id}
                className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex flex-col justify-between space-y-3"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-500">
                      {acc.group}
                    </span>
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  </div>
                  <h3 className="font-bold text-slate-900 text-sm mt-1">{acc.name}</h3>
                </div>

                <div className="pt-2 border-t border-slate-200 flex items-center justify-between">
                  <span className="text-xs text-slate-500 font-medium">Current Balance:</span>
                  <span className="text-base font-black text-slate-900">
                    ₹{Number(acc.current_balance || 0).toLocaleString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Loans & Liabilities Section */}
        <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-amber-600" />
                <span>Loan Liabilities & Advances Ledgers</span>
              </h2>
              <p className="text-xs text-slate-500 font-medium">Track principal loan obligations and employee salary advances</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {[...loanLiabilities, ...loanAdvances].map((loan) => (
              <div
                key={loan.id}
                className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex flex-col justify-between space-y-3"
              >
                <div>
                  <span className={`text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded ${
                    loan.group.includes('Liability') ? 'bg-amber-100 text-amber-900 border border-amber-200' : 'bg-blue-100 text-blue-900 border border-blue-200'
                  }`}>
                    {loan.group}
                  </span>
                  <h3 className="font-bold text-slate-900 text-sm mt-2">{loan.name}</h3>
                </div>

                <div className="pt-2 border-t border-slate-200 flex items-center justify-between">
                  <span className="text-xs text-slate-500 font-medium">Outstanding Balance:</span>
                  <span className="text-base font-black text-slate-900">
                    ₹{Number(loan.current_balance || 0).toLocaleString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Contra Transfers */}
        <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs space-y-3">
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <ArrowRightLeft className="w-5 h-5 text-teal-600" />
            <span>Recent Contra Transfers (F4)</span>
          </h2>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100 text-slate-700 uppercase text-[10px] font-bold border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-3">Date</th>
                  <th className="py-2.5 px-3">Vch No.</th>
                  <th className="py-2.5 px-3">Transfer Details</th>
                  <th className="py-2.5 px-3">Narration</th>
                  <th className="py-2.5 px-3 text-right">Transfer Amount (₹)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {contraVouchers.length > 0 ? (
                  contraVouchers.map((v) => (
                    <tr key={v.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-2.5 px-3 text-slate-600 font-mono">{v.date}</td>
                      <td className="py-2.5 px-3 font-mono font-black text-slate-900">{v.voucher_no}</td>
                      <td className="py-2.5 px-3 text-teal-700 font-bold">{v.party_name}</td>
                      <td className="py-2.5 px-3 text-slate-600 font-medium">{v.narration || '-'}</td>
                      <td className="py-2.5 px-3 text-right font-black text-slate-900">
                        ₹{Number(v.amount || 0).toLocaleString()}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-slate-500 font-medium">
                      No contra vouchers recorded yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* Contra Transfer Modal (F4) */}
      {isContraModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50">
          <div
            className="w-full max-w-md bg-white rounded-2xl p-6 border border-slate-200 shadow-xl text-slate-900 font-sans"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div>
                <span className="text-[10px] font-mono font-bold uppercase text-teal-700">Voucher F4</span>
                <h2 className="text-base font-bold text-slate-900 mt-0.5">Contra Transfer (Cash / Bank)</h2>
              </div>
              <button onClick={() => setIsContraModalOpen(false)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleContraSubmit} className="space-y-4 pt-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Transfer From (Credit Source) *</label>
                <select
                  value={sourceLedgerId}
                  onChange={(e) => setSourceLedgerId(e.target.value)}
                  required
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-600"
                >
                  <option value="">-- Select Source Ledger --</option>
                  {[...cashAccounts, ...bankAccounts].map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name} ({l.group}) - Bal: ₹{Number(l.current_balance || 0).toLocaleString()}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Transfer To (Debit Destination) *</label>
                <select
                  value={destLedgerId}
                  onChange={(e) => setDestLedgerId(e.target.value)}
                  required
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-600"
                >
                  <option value="">-- Select Destination Ledger --</option>
                  {[...cashAccounts, ...bankAccounts].map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name} ({l.group}) - Bal: ₹{Number(l.current_balance || 0).toLocaleString()}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Transfer Amount (₹) *</label>
                <input
                  type="number"
                  min="1"
                  step="any"
                  required
                  placeholder="0.00"
                  value={contraAmount}
                  onChange={(e) => setContraAmount(e.target.value)}
                  className="w-full px-3 py-2.5 bg-white border border-slate-300 rounded-xl text-base font-black text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-600"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Narration / Cheque No.</label>
                <input
                  type="text"
                  placeholder="e.g. Cash deposited via CDM slip #1241"
                  value={contraNarration}
                  onChange={(e) => setContraNarration(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-900"
                />
              </div>

              <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsContraModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:text-slate-900"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={contraPosting}
                  className="px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold shadow-xs flex items-center gap-1.5"
                >
                  {contraPosting ? 'Posting...' : 'Execute Contra Transfer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Ledger Account Modal */}
      {isAccountModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50">
          <div
            className="w-full max-w-md bg-white rounded-2xl p-6 border border-slate-200 shadow-xl text-slate-900 font-sans"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h2 className="text-base font-bold text-slate-900">Create New Account Ledger</h2>
              <button onClick={() => setIsAccountModalOpen(false)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddAccountSubmit} className="space-y-4 pt-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Account / Ledger Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. ICICI Bank Current A/c"
                  value={newAccForm.name}
                  onChange={(e) => setNewAccForm({ ...newAccForm, name: e.target.value })}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Parent Group (Tally Group)</label>
                <select
                  value={newAccForm.group}
                  onChange={(e) => setNewAccForm({ ...newAccForm, group: e.target.value })}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-900"
                >
                  <option value="Bank Accounts">Bank Accounts</option>
                  <option value="Cash-in-hand">Cash-in-hand</option>
                  <option value="Loans (Liability)">Loans (Liability)</option>
                  <option value="Loans & Advances (Asset)">Loans & Advances (Asset)</option>
                  <option value="Indirect Expenses">Indirect Expenses</option>
                  <option value="Direct Expenses">Direct Expenses</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Opening Balance (₹)</label>
                <input
                  type="number"
                  step="any"
                  value={newAccForm.opening_balance}
                  onChange={(e) => setNewAccForm({ ...newAccForm, opening_balance: e.target.value })}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-900"
                />
              </div>

              <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAccountModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:text-slate-900"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs"
                >
                  Save Account
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
