import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { 
  Landmark, 
  DollarSign, 
  ArrowRightLeft, 
  CreditCard, 
  Plus, 
  ArrowUpRight, 
  ArrowDownLeft, 
  History, 
  Building2, 
  ShieldCheck, 
  X, 
  Check 
} from 'lucide-react'
import { accDb, createVoucher } from '../lib/accountingDb'
import { useAuth } from '../context/AuthContext'
import Nav from '../components/Nav'

export default function BankingPage() {
  const { isAdmin, isOwner } = useAuth()
  const [ledgers, setLedgers] = useState([])
  const [vouchers, setVouchers] = useState([])
  const [loading, setLoading] = useState(true)

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
    opening_balance: 0,
  })

  useEffect(() => {
    load()
    function handleUpdate() { load() }
    window.addEventListener('accounting-data-updated', handleUpdate)
    return () => window.removeEventListener('accounting-data-updated', handleUpdate)
  }, [])

  async function load() {
    setLoading(true)
    const ldgs = await accDb.ledgers.toArray()
    const vchs = await accDb.vouchers.toArray()
    setLedgers(ldgs)
    setVouchers(vchs)
    setLoading(false)
  }

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
      alert('Source and destination accounts must be different')
      return
    }

    setContraPosting(true)
    try {
      const src = ledgers.find((l) => String(l.id) === String(sourceLedgerId))
      const dst = ledgers.find((l) => String(l.id) === String(destLedgerId))

      await createVoucher({
        voucher_type: 'contra',
        voucher_no: `CNT-${Date.now().toString().slice(-5)}`,
        date: new Date().toISOString().slice(0, 10),
        amount: amt,
        paid_amount: amt,
        due_amount: 0,
        credit_ledger_id: sourceLedgerId,
        debit_ledger_id: destLedgerId,
        party_name: `${src?.name} → ${dst?.name}`,
        narration: contraNarration || `Transfer from ${src?.name} to ${dst?.name}`,
      })

      setContraPosting(false)
      setIsContraModalOpen(false)
      setContraAmount('')
      setContraNarration('')
      load()
    } catch (err) {
      alert(err.message || 'Failed to post Contra voucher')
      setContraPosting(false)
    }
  }

  async function handleAddAccountSubmit(e) {
    e.preventDefault()
    if (isOwner) return
    if (!newAccForm.name.trim()) return

    await accDb.ledgers.add({
      name: newAccForm.name.trim(),
      group: newAccForm.group,
      opening_balance: Number(newAccForm.opening_balance) || 0,
      current_balance: Number(newAccForm.opening_balance) || 0,
      is_system: false,
    })

    setIsAccountModalOpen(false)
    setNewAccForm({ name: '', group: 'Bank Accounts', opening_balance: 0 })
    load()
  }

  return (
    <div className="min-h-screen bg-[#f4f7f4] text-[#172f2c] font-sans pb-28 lg:pb-0">
      <Nav />

      <main className="min-h-screen bg-[#f4f7f4] px-4 pb-28 pt-5 text-[#172f2c] sm:px-6 lg:ml-64 lg:w-[calc(100%-16rem)] lg:px-9 lg:pb-8 lg:pt-8 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-2">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl sm:text-3xl font-black text-[#172f2c] tracking-tight flex items-center gap-2.5">
                <Landmark className="w-7 h-7 text-[#0e7a70]" />
                <span>Loans & Advances</span>
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-[#e6f4ee] text-[#0e7669] border border-teal-500/30">
                Borrowings and advances
              </span>
            </div>
            <p className="text-xs sm:text-sm text-[#71827a] mt-1">
              Outstanding loans, supplier advances, staff advances, and cash or bank movement tracking.
            </p>
          </div>

          {isAdmin && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsContraModalOpen(true)}
                className="px-4 py-2 bg-gradient-to-r from-[#0e7a70] to-[#07675e] hover:from-[#086c63] hover:to-[#075b53] text-white rounded-xl text-xs font-bold shadow-lg shadow-[#0e7a70]/15 flex items-center gap-1.5 transition-all active:scale-95"
              >
                <ArrowRightLeft className="w-4 h-4" />
                <span>Contra Transfer (F4)</span>
              </button>

              <button
                type="button"
                onClick={() => setIsAccountModalOpen(true)}
                className="px-3.5 py-2 bg-white hover:bg-[#edf5f0] border border-[#e1e8e3] text-[#435b52] rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>Add Account</span>
              </button>
            </div>
          )}
        </div>

        {/* Loans and advances summary - matches the Owner view reference */}
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <article className="rounded-[18px] border border-[#c9e4d8] bg-[#e7f5ef] p-5">
            <span className="block text-xs font-bold uppercase tracking-wider text-[#526f62]">Net you owe</span>
            <strong className="mt-2 block text-[28px] font-extrabold tracking-tight text-[#153c34]">₹{(totalLoansPayable - totalLoansReceivable).toLocaleString('en-IN')}</strong>
            <p className="mt-2 text-[11px] text-[#71877c]">Loans payable less advances given</p>
          </article>
          <article className="rounded-[18px] border border-[#e1e8e3] bg-white p-5">
            <span className="block text-xs font-bold uppercase tracking-wider text-[#9a6116]">Loans you owe</span>
            <strong className="mt-2 block text-[28px] font-extrabold tracking-tight text-[#a6651e]">₹{totalLoansPayable.toLocaleString('en-IN')}</strong>
            <p className="mt-2 text-[11px] text-[#82908a]">Loan liabilities and borrowings</p>
          </article>
          <article className="rounded-[18px] border border-[#e1e8e3] bg-white p-5">
            <span className="block text-xs font-bold uppercase tracking-wider text-[#0e7669]">Advances given</span>
            <strong className="mt-2 block text-[28px] font-extrabold tracking-tight text-[#0e7a70]">₹{totalLoansReceivable.toLocaleString('en-IN')}</strong>
            <p className="mt-2 text-[11px] text-[#82908a]">Staff advances and supplier deposits</p>
          </article>
        </section>

        {/* Bank & Cash Accounts List */}
        <div className="bg-white rounded-2xl p-5 border border-[#e1e8e3] shadow-lg space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-[#172f2c] flex items-center gap-2">
                <Landmark className="w-5 h-5 text-[#0e7a70]" />
                <span>Cash & bank balances</span>
              </h2>
              <p className="text-xs text-[#71827a]">Cash ₹{totalCash.toLocaleString('en-IN')} · Bank ₹{totalBank.toLocaleString('en-IN')} · balances updated by receipts, payments, and contra entries</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {[...cashAccounts, ...bankAccounts].map((acc) => (
              <div
                key={acc.id}
                className="bg-[#f8fbf9] p-4 rounded-xl border border-[#e1e8e3] flex flex-col justify-between space-y-3"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#71827a]">
                      {acc.group}
                    </span>
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  </div>
                  <h3 className="font-bold text-[#172f2c] text-sm mt-1">{acc.name}</h3>
                </div>

                <div className="pt-2 border-t border-[#e1e8e3] flex items-center justify-between">
                  <span className="text-xs text-[#71827a]">Current Balance:</span>
                  <span className="text-base font-black text-[#172f2c]">
                    ₹{Number(acc.current_balance || 0).toLocaleString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Loans & Liabilities Section */}
        <div className="bg-white rounded-2xl p-5 border border-[#e1e8e3] shadow-lg space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-[#172f2c] flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-[#a6651e]" />
                <span>Loan Liabilities & Advances Ledgers</span>
              </h2>
              <p className="text-xs text-[#71827a]">Track principal loan obligations and employee salary advances</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {[...loanLiabilities, ...loanAdvances].map((loan) => (
              <div
                key={loan.id}
                className="bg-[#f8fbf9] p-4 rounded-xl border border-[#e1e8e3] flex flex-col justify-between space-y-3"
              >
                <div>
                  <span className={`text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded ${
                    loan.group.includes('Liability') ? 'bg-[#fff5e8] text-[#9c611c]' : 'bg-[#e6f4ee] text-[#0e7669]'
                  }`}>
                    {loan.group}
                  </span>
                  <h3 className="font-bold text-[#172f2c] text-sm mt-2">{loan.name}</h3>
                </div>

                <div className="pt-2 border-t border-[#e1e8e3] flex items-center justify-between">
                  <span className="text-xs text-[#71827a]">Outstanding Balance:</span>
                  <span className="text-base font-black text-[#172f2c]">
                    ₹{Number(loan.current_balance || 0).toLocaleString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Contra Transfers */}
        <div className="bg-white rounded-2xl p-5 border border-[#e1e8e3] shadow-lg space-y-3">
          <h2 className="text-base font-bold text-[#172f2c] flex items-center gap-2">
            <ArrowRightLeft className="w-5 h-5 text-[#0e7a70]" />
            <span>Recent Contra Transfers (F4)</span>
          </h2>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#f4f7f4] text-[#71827a] uppercase text-[10px] font-bold">
                <tr>
                  <th className="py-2.5 px-3">Date</th>
                  <th className="py-2.5 px-3">Vch No.</th>
                  <th className="py-2.5 px-3">Transfer Details</th>
                  <th className="py-2.5 px-3">Narration</th>
                  <th className="py-2.5 px-3 text-right">Transfer Amount (₹)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e8eee9] font-medium">
                {contraVouchers.length > 0 ? (
                  contraVouchers.map((v) => (
                    <tr key={v.id} className="hover:bg-[#f3f8f5]">
                      <td className="py-2.5 px-3 text-[#52685e] font-mono">{v.date}</td>
                      <td className="py-2.5 px-3 font-mono font-bold text-[#172f2c]">{v.voucher_no}</td>
                      <td className="py-2.5 px-3 text-[#0e7669] font-semibold">{v.party_name}</td>
                      <td className="py-2.5 px-3 text-[#71827a]">{v.narration || '-'}</td>
                      <td className="py-2.5 px-3 text-right font-black text-[#172f2c]">
                        ₹{Number(v.amount || 0).toLocaleString()}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-[#8a9991]">
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-xs">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-md bg-[#f4f7f4] rounded-2xl p-6 border border-[#e1e8e3] shadow-2xl text-[#172f2c] font-sans"
          >
            <div className="flex items-center justify-between pb-3 border-b border-[#e1e8e3]">
              <div>
                <span className="text-[10px] font-mono font-bold uppercase text-[#0e7a70]">Voucher F4</span>
                <h2 className="text-base font-bold text-[#172f2c] mt-0.5">Contra Transfer (Cash / Bank)</h2>
              </div>
              <button onClick={() => setIsContraModalOpen(false)} className="text-[#71827a] hover:text-[#172f2c]">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleContraSubmit} className="space-y-4 pt-4">
              <div>
                <label className="block text-xs font-bold text-[#52685e] mb-1">Transfer From (Credit Source) *</label>
                <select
                  value={sourceLedgerId}
                  onChange={(e) => setSourceLedgerId(e.target.value)}
                  required
                  className="w-full px-3 py-2 bg-white border border-[#e1e8e3] rounded-xl text-xs text-[#172f2c]"
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
                <label className="block text-xs font-bold text-[#52685e] mb-1">Transfer To (Debit Destination) *</label>
                <select
                  value={destLedgerId}
                  onChange={(e) => setDestLedgerId(e.target.value)}
                  required
                  className="w-full px-3 py-2 bg-white border border-[#e1e8e3] rounded-xl text-xs text-[#172f2c]"
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
                <label className="block text-xs font-bold text-[#52685e] mb-1">Transfer Amount (₹) *</label>
                <input
                  type="number"
                  min="1"
                  step="any"
                  required
                  placeholder="0.00"
                  value={contraAmount}
                  onChange={(e) => setContraAmount(e.target.value)}
                  className="w-full px-3 py-2.5 bg-white border border-[#e1e8e3] rounded-xl text-base font-black text-[#172f2c] focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#52685e] mb-1">Narration / Cheque No.</label>
                <input
                  type="text"
                  placeholder="e.g. Cash deposited via CDM slip #1241"
                  value={contraNarration}
                  onChange={(e) => setContraNarration(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-[#e1e8e3] rounded-xl text-xs text-[#172f2c]"
                />
              </div>

              <div className="pt-3 border-t border-[#e1e8e3] flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsContraModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs text-[#71827a] hover:text-[#172f2c]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={contraPosting}
                  className="px-5 py-2 rounded-xl bg-[#0e7a70] hover:bg-[#086c63] text-white text-xs font-bold shadow-md shadow-[#0e7a70]/15 flex items-center gap-1.5"
                >
                  {contraPosting ? 'Posting...' : 'Execute Contra Transfer'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* Add Ledger Account Modal */}
      {isAccountModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-xs">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-md bg-[#f4f7f4] rounded-2xl p-6 border border-[#e1e8e3] shadow-2xl text-[#172f2c] font-sans"
          >
            <div className="flex items-center justify-between pb-3 border-b border-[#e1e8e3]">
              <h2 className="text-base font-bold text-[#172f2c]">Create New Account Ledger</h2>
              <button onClick={() => setIsAccountModalOpen(false)} className="text-[#71827a] hover:text-[#172f2c]">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddAccountSubmit} className="space-y-4 pt-4">
              <div>
                <label className="block text-xs font-bold text-[#52685e] mb-1">Account / Ledger Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. ICICI Bank Current A/c"
                  value={newAccForm.name}
                  onChange={(e) => setNewAccForm({ ...newAccForm, name: e.target.value })}
                  className="w-full px-3 py-2 bg-white border border-[#e1e8e3] rounded-xl text-xs text-[#172f2c] focus:outline-none focus:ring-2 focus:ring-[#0e7a70]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#52685e] mb-1">Parent Group (Tally Group)</label>
                <select
                  value={newAccForm.group}
                  onChange={(e) => setNewAccForm({ ...newAccForm, group: e.target.value })}
                  className="w-full px-3 py-2 bg-white border border-[#e1e8e3] rounded-xl text-xs text-[#172f2c]"
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
                <label className="block text-xs font-bold text-[#52685e] mb-1">Opening Balance (₹)</label>
                <input
                  type="number"
                  step="any"
                  value={newAccForm.opening_balance}
                  onChange={(e) => setNewAccForm({ ...newAccForm, opening_balance: e.target.value })}
                  className="w-full px-3 py-2 bg-white border border-[#e1e8e3] rounded-xl text-xs text-[#172f2c]"
                />
              </div>

              <div className="pt-3 border-t border-[#e1e8e3] flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAccountModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs text-[#71827a] hover:text-[#172f2c]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-[#0e7a70] hover:bg-[#086c63] text-white text-xs font-bold shadow-md shadow-[#0e7a70]/15"
                >
                  Save Account
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </div>
  )
}
