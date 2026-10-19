import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  X, 
  Plus, 
  Trash2, 
  Check, 
  AlertCircle, 
  CreditCard, 
  FileText, 
  DollarSign, 
  Layers,
  ArrowRightLeft,
  Calendar,
  User,
  Hash,
  ShieldCheck,
  Building2,
  Package
} from 'lucide-react'
import { accDb, createVoucher, updateVoucher } from '../lib/accountingDb'
import { useAuth } from '../context/AuthContext'

const VOUCHER_TYPES = [
  { id: 'sales', label: 'Sales (F8)', color: 'bg-emerald-600 text-white', border: 'border-emerald-600' },
  { id: 'purchase', label: 'Purchase (F9)', color: 'bg-blue-600 text-white', border: 'border-blue-600' },
  { id: 'receipt', label: 'Receipt (F6)', color: 'bg-teal-600 text-white', border: 'border-teal-600' },
  { id: 'payment', label: 'Payment (F5)', color: 'bg-rose-600 text-white', border: 'border-rose-600' },
  { id: 'contra', label: 'Contra (F4)', color: 'bg-amber-600 text-white', border: 'border-amber-600' },
  { id: 'journal', label: 'Journal (F7)', color: 'bg-indigo-600 text-white', border: 'border-indigo-600' },
]

export default function VoucherModal({ isOpen, onClose, editingVoucher = null, onSuccess, initialVoucherType = 'sales' }) {
  const { isAdmin, isOwner } = useAuth()

  // Form State
  const [voucherType, setVoucherType] = useState('sales')
  const [voucherNo, setVoucherNo] = useState('')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [partyName, setPartyName] = useState('')
  const [partyPhone, setPartyPhone] = useState('')
  const [paymentMode, setPaymentMode] = useState('HDFC Bank')
  const [narration, setNarration] = useState('')
  const [referenceNo, setReferenceNo] = useState('')

  // Ledgers for Contra, Receipt, Payment, Journal
  const [debitLedgerId, setDebitLedgerId] = useState('')
  const [creditLedgerId, setCreditLedgerId] = useState('')

  // Sales / Purchase Inventory Line Items
  const [items, setItems] = useState([
    { material_id: '', sku: '', name: '', qty: 1, rate: 0, cost_rate: 0, unit: 'pcs', amount: 0 }
  ])

  // Paid amount (for split credit/cash sales)
  const [paidAmount, setPaidAmount] = useState(0)

  // Direct Amount for non-inventory vouchers (Receipt, Payment, Contra, Journal)
  const [directAmount, setDirectAmount] = useState(0)

  // Data Sources
  const [materials, setMaterials] = useState([])
  const [parties, setParties] = useState([])
  const [ledgers, setLedgers] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // Load master data on open
  useEffect(() => {
    if (!isOpen) return
    loadMasters()
  }, [isOpen])

  // Populate editing data if modifying existing voucher
  useEffect(() => {
    if (editingVoucher) {
      setVoucherType(editingVoucher.voucher_type || 'sales')
      setVoucherNo(editingVoucher.voucher_no || '')
      setDate(editingVoucher.date || new Date().toISOString().slice(0, 10))
      setPartyName(editingVoucher.party_name || '')
      setPartyPhone(editingVoucher.party_phone || '')
      setPaymentMode(editingVoucher.payment_mode || 'HDFC Bank')
      setNarration(editingVoucher.narration || '')
      setReferenceNo(editingVoucher.reference_no || '')
      setPaidAmount(Number(editingVoucher.paid_amount) || 0)
      setDirectAmount(Number(editingVoucher.amount) || 0)
      setDebitLedgerId(editingVoucher.debit_ledger_id || '')
      setCreditLedgerId(editingVoucher.credit_ledger_id || '')

      if (Array.isArray(editingVoucher.items) && editingVoucher.items.length > 0) {
        setItems(editingVoucher.items.map((it) => ({
          ...it,
          amount: (Number(it.qty) || 0) * (Number(it.rate) || 0),
        })))
      } else {
        setItems([{ material_id: '', sku: '', name: '', qty: 1, rate: 0, cost_rate: 0, unit: 'pcs', amount: 0 }])
      }
    } else {
      // Reset defaults
      setVoucherType(initialVoucherType)
      setVoucherNo(`${initialVoucherType === 'payment' ? 'PAY' : initialVoucherType === 'purchase' ? 'PUR' : initialVoucherType === 'receipt' ? 'REC' : 'INV'}-${Date.now().toString().slice(-5)}`)
      setDate(new Date().toISOString().slice(0, 10))
      setPartyName('')
      setPartyPhone('')
      setPaymentMode('HDFC Bank')
      setNarration('')
      setReferenceNo('')
      setPaidAmount(0)
      setDirectAmount(0)
      setDebitLedgerId('')
      setCreditLedgerId('')
      setItems([{ material_id: '', sku: '', name: '', qty: 1, rate: 0, cost_rate: 0, unit: 'pcs', amount: 0 }])
      setError(null)
    }
  }, [editingVoucher, isOpen, initialVoucherType])

  async function loadMasters() {
    const mats = await accDb.materials.toArray()
    const pts = await accDb.parties.toArray()
    const ldgs = await accDb.ledgers.toArray()
    setMaterials(mats)
    setParties(pts)
    setLedgers(ldgs)
  }

  // Calculate items total
  const itemsTotal = items.reduce((acc, it) => acc + (Number(it.amount) || 0), 0)
  const totalAmount = voucherType === 'sales' || voucherType === 'purchase' ? itemsTotal : Number(directAmount) || 0
  const dueAmount = Math.max(0, totalAmount - Number(paidAmount || 0))

  // Find if current party has permanent UID
  const matchedParty = parties.find(
    (p) => p.name.trim().toLowerCase() === partyName.trim().toLowerCase()
  )
  const existingPartyUid = matchedParty?.uid || null

  // Handle line item changes
  function updateItem(index, field, value) {
    const newItems = [...items]
    const item = { ...newItems[index], [field]: value }

    if (field === 'material_id') {
      const mat = materials.find((m) => String(m.id) === String(value))
      if (mat) {
        item.sku = mat.sku
        item.name = mat.name
        item.unit = mat.unit || 'pcs'
        item.cost_rate = Number(mat.purchase_rate) || 0
        item.rate = voucherType === 'purchase' ? Number(mat.purchase_rate) || 0 : Number(mat.sales_rate) || 0
      }
    }

    if (field === 'qty' || field === 'rate' || field === 'material_id') {
      const q = Number(field === 'qty' ? value : item.qty) || 0
      const r = Number(field === 'rate' ? value : item.rate) || 0
      item.amount = q * r
    }

    newItems[index] = item
    setItems(newItems)

    // Auto set paid amount if user hasn't modified it
    if (!editingVoucher && paidAmount === 0 && (field === 'qty' || field === 'rate')) {
      const newTotal = newItems.reduce((acc, it) => acc + (Number(it.amount) || 0), 0)
      // default paid amount to 0 (credit) or full
    }
  }

  function addItem() {
    setItems([
      ...items,
      { material_id: '', sku: '', name: '', qty: 1, rate: 0, cost_rate: 0, unit: 'pcs', amount: 0 }
    ])
  }

  function removeItem(index) {
    if (items.length <= 1) return
    setItems(items.filter((_, i) => i !== index))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (isOwner) {
      alert('Owner account is in Read and Track mode. Only Admin has full data entry access.')
      return
    }

    if (!partyName && (voucherType === 'sales' || voucherType === 'purchase' || voucherType === 'receipt' || voucherType === 'payment')) {
      setError('Please select or enter Party Name')
      return
    }

    if ((voucherType === 'sales' || voucherType === 'purchase') && itemsTotal <= 0) {
      setError('Please select at least one material with a valid quantity and rate')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const voucherPayload = {
        voucher_type: voucherType,
        voucher_no: voucherNo || `VCH-${Date.now().toString().slice(-6)}`,
        date,
        party_name: partyName.trim(),
        party_phone: partyPhone.trim(),
        payment_mode: paymentMode,
        narration: narration.trim(),
        reference_no: referenceNo.trim(),
        amount: totalAmount,
        paid_amount: voucherType === 'sales' || voucherType === 'purchase' ? Number(paidAmount) || 0 : totalAmount,
        due_amount: voucherType === 'sales' || voucherType === 'purchase' ? dueAmount : 0,
        debit_ledger_id: debitLedgerId || null,
        credit_ledger_id: creditLedgerId || null,
        items: voucherType === 'sales' || voucherType === 'purchase' ? items : [],
      }

      if (editingVoucher?.id) {
        await updateVoucher(editingVoucher.id, voucherPayload)
      } else {
        await createVoucher(voucherPayload)
      }

      setLoading(false)
      onSuccess?.()
      onClose()
    } catch (err) {
      console.error(err)
      setError(err.message || 'Failed to save voucher')
      setLoading(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-950/70 backdrop-blur-xs overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 15 }}
        className="w-full max-w-4xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden my-auto max-h-[92vh] flex flex-col font-sans"
      >
        {/* Header with Tally Voucher Types */}
        <div className="bg-slate-900 text-white p-4 sm:p-5 flex items-center justify-between border-b border-slate-800 shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded text-[11px] font-mono font-bold uppercase tracking-wider bg-blue-500/20 text-blue-400 border border-blue-500/30">
                Tally Accounting Engine
              </span>
              {isOwner && (
                <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                  Read & Track Only (Owner)
                </span>
              )}
            </div>
            <h2 className="text-xl font-bold text-white mt-1">
              {editingVoucher ? `Modify Voucher: ${editingVoucher.voucher_no}` : 'Create New Accounting Voucher'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Voucher Type Tabs (Sales F8, Purchase F9, Receipt F6, Payment F5, Contra F4, Journal F7) */}
        {!editingVoucher && (
          <div className="bg-slate-100 p-2 border-b border-slate-200 flex flex-wrap gap-1.5 shrink-0">
            {VOUCHER_TYPES.map((vt) => (
              <button
                key={vt.id}
                type="button"
                onClick={() => {
                  setVoucherType(vt.id)
                  setError(null)
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                  voucherType === vt.id
                    ? `${vt.color} shadow-xs scale-102`
                    : 'bg-white text-slate-700 hover:bg-slate-200/80 border border-slate-200'
                }`}
              >
                <span>{vt.label}</span>
              </button>
            ))}
          </div>
        )}

        {/* Body Form */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-6 overflow-y-auto space-y-5 flex-1">
          {error && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs font-semibold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{error}</span>
            </div>
          )}

          {/* Top Fields: Voucher No, Date, Reference */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Voucher No</label>
              <div className="relative">
                <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  value={voucherNo}
                  onChange={(e) => setVoucherNo(e.target.value)}
                  disabled={isOwner}
                  required
                  placeholder="e.g. INV-001"
                  className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600 disabled:opacity-60"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Voucher Date</label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  disabled={isOwner}
                  required
                  className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600 disabled:opacity-60"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Payment Mode / Bank</label>
              <select
                value={paymentMode}
                onChange={(e) => setPaymentMode(e.target.value)}
                disabled={isOwner}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600 disabled:opacity-60"
              >
                <option value="HDFC Bank">HDFC Bank Current A/c</option>
                <option value="State Bank of India">SBI Current A/c</option>
                <option value="Cash">Cash in Hand</option>
                <option value="Credit / Due">Credit / On Account</option>
              </select>
            </div>
          </div>

          {/* Party Selection & Internal UID Notification */}
          {(voucherType === 'sales' || voucherType === 'purchase' || voucherType === 'receipt' || voucherType === 'payment') && (
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <User className="w-4 h-4 text-blue-600" />
                  <span>
                    {voucherType === 'sales' || voucherType === 'receipt' ? 'Customer / Debtor Party' : 'Supplier / Creditor Party'}
                  </span>
                </label>

                {/* Live UID Indicator Badge */}
                {voucherType === 'sales' && (
                  <div className="text-[11px] font-semibold">
                    {existingPartyUid ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-800 border border-blue-300">
                        <ShieldCheck className="w-3.5 h-3.5 text-blue-600" />
                        <span>Permanent UID: <strong>{existingPartyUid}</strong></span>
                      </span>
                    ) : dueAmount > 0 ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300 animate-pulse">
                        <ShieldCheck className="w-3.5 h-3.5 text-amber-600" />
                        <span>Closing Due (₹{dueAmount.toLocaleString()}) → Auto assigns permanent UID</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Settled Upfront → Direct Sales (No UID)</span>
                      </span>
                    )}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <input
                    type="text"
                    list="party-suggestions"
                    placeholder="Type or select customer/party name..."
                    value={partyName}
                    onChange={(e) => setPartyName(e.target.value)}
                    disabled={isOwner}
                    required
                    className="w-full px-3 py-2.5 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600 disabled:opacity-60"
                  />
                  <datalist id="party-suggestions">
                    {parties.map((p) => (
                      <option key={p.id} value={p.name}>
                        {p.uid ? `[${p.uid}] ` : ''}Due: ₹{Number(p.current_balance || 0).toLocaleString()}
                      </option>
                    ))}
                  </datalist>
                </div>

                <div>
                  <input
                    type="text"
                    placeholder="Party Phone (optional)"
                    value={partyPhone}
                    onChange={(e) => setPartyPhone(e.target.value)}
                    disabled={isOwner}
                    className="w-full px-3 py-2.5 bg-white border border-slate-300 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600 disabled:opacity-60"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Contra & Journal Ledger Pickers */}
          {voucherType === 'contra' && (
            <div className="bg-amber-50/50 p-4 rounded-xl border border-amber-200 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-amber-900 mb-1">Source Account (Credit - From)</label>
                <select
                  value={creditLedgerId}
                  onChange={(e) => setCreditLedgerId(e.target.value)}
                  disabled={isOwner}
                  required
                  className="w-full px-3 py-2 bg-white border border-amber-300 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                >
                  <option value="">-- Select Source Ledger --</option>
                  {ledgers.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name} ({l.group}) - Bal: ₹{Number(l.current_balance || 0).toLocaleString()}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-amber-900 mb-1">Destination Account (Debit - To)</label>
                <select
                  value={debitLedgerId}
                  onChange={(e) => setDebitLedgerId(e.target.value)}
                  disabled={isOwner}
                  required
                  className="w-full px-3 py-2 bg-white border border-amber-300 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                >
                  <option value="">-- Select Destination Ledger --</option>
                  {ledgers.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name} ({l.group}) - Bal: ₹{Number(l.current_balance || 0).toLocaleString()}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Inventory Table for Sales & Purchase */}
          {(voucherType === 'sales' || voucherType === 'purchase') && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800 uppercase tracking-wide flex items-center gap-1.5">
                  <Package className="w-4 h-4 text-emerald-600" />
                  <span>Material Line Items ({items.length})</span>
                </span>
                {!isOwner && (
                  <button
                    type="button"
                    onClick={addItem}
                    className="inline-flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-bold bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Item</span>
                  </button>
                )}
              </div>

              <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-100/90 text-slate-600 font-bold uppercase text-[10px] border-b border-slate-200">
                      <tr>
                        <th className="py-2.5 px-3">Material / Item</th>
                        <th className="py-2.5 px-3 w-24">Qty</th>
                        <th className="py-2.5 px-3 w-20">Unit</th>
                        <th className="py-2.5 px-3 w-28">Rate (₹)</th>
                        <th className="py-2.5 px-3 w-32 text-right">Amount (₹)</th>
                        {!isOwner && <th className="py-2.5 px-2 w-10 text-center"></th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {items.map((item, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/60">
                          <td className="p-2 px-3">
                            <select
                              value={item.material_id}
                              onChange={(e) => updateItem(idx, 'material_id', e.target.value)}
                              disabled={isOwner}
                              required
                              className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-600 disabled:opacity-60"
                            >
                              <option value="">-- Choose Material --</option>
                              {materials.map((m) => (
                                <option key={m.id} value={m.id}>
                                  {m.name} [Stock: {m.current_qty} {m.unit}] - ₹{voucherType === 'purchase' ? m.purchase_rate : m.sales_rate}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="p-2 px-3">
                            <input
                              type="number"
                              min="0.01"
                              step="any"
                              value={item.qty}
                              onChange={(e) => updateItem(idx, 'qty', e.target.value)}
                              disabled={isOwner}
                              required
                              className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-600 text-right disabled:opacity-60"
                            />
                          </td>
                          <td className="p-2 px-3 text-slate-500 font-medium">{item.unit || 'pcs'}</td>
                          <td className="p-2 px-3">
                            <input
                              type="number"
                              min="0"
                              step="any"
                              value={item.rate}
                              onChange={(e) => updateItem(idx, 'rate', e.target.value)}
                              disabled={isOwner}
                              required
                              className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-600 text-right disabled:opacity-60"
                            />
                          </td>
                          <td className="p-2 px-3 text-right font-bold text-slate-900">
                            ₹{Number(item.amount || 0).toLocaleString()}
                          </td>
                          {!isOwner && (
                            <td className="p-2 px-2 text-center">
                              {items.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => removeItem(idx)}
                                  className="text-slate-400 hover:text-rose-600 p-1 transition-colors"
                                  title="Remove item"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Total & Split Payment (Paid vs Due) */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="w-full sm:w-auto space-y-1">
                  <div className="text-xs text-slate-500">Invoice Net Total</div>
                  <div className="text-2xl font-black text-slate-900">
                    ₹{itemsTotal.toLocaleString()}
                  </div>
                </div>

                <div className="w-full sm:w-auto flex flex-wrap items-center gap-4">
                  <div>
                    <label className="block text-[11px] font-bold text-emerald-800 mb-0.5">Paid Upfront (₹)</label>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={paidAmount}
                      onChange={(e) => setPaidAmount(e.target.value)}
                      disabled={isOwner}
                      className="w-32 px-3 py-1.5 bg-white border border-emerald-300 rounded-lg text-xs font-bold text-emerald-900 text-right focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-60"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-rose-800 mb-0.5">Closing Due (Credit)</label>
                    <div className="w-32 px-3 py-1.5 bg-rose-50 border border-rose-200 rounded-lg text-xs font-bold text-rose-900 text-right">
                      ₹{dueAmount.toLocaleString()}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Direct Amount for Receipt, Payment, Contra, Journal */}
          {(voucherType === 'receipt' || voucherType === 'payment' || voucherType === 'contra' || voucherType === 'journal') && (
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
              <label className="block text-xs font-bold text-slate-800 mb-1.5">
                Voucher Amount (₹)
              </label>
              <div className="relative max-w-xs">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="number"
                  min="1"
                  step="any"
                  value={directAmount}
                  onChange={(e) => setDirectAmount(e.target.value)}
                  disabled={isOwner}
                  required
                  placeholder="0.00"
                  className="w-full pl-9 pr-3 py-2.5 bg-white border border-slate-300 rounded-xl text-base font-black text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600 disabled:opacity-60"
                />
              </div>
            </div>
          )}

          {/* Narration */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Narration / Remarks</label>
            <textarea
              rows={2}
              value={narration}
              onChange={(e) => setNarration(e.target.value)}
              disabled={isOwner}
              placeholder="e.g. Sold on 30-day credit terms, transport via SafeXpress"
              className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600 disabled:opacity-60"
            />
          </div>

          {/* Actions */}
          <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors"
            >
              Cancel
            </button>

            {!isOwner ? (
              <button
                type="submit"
                disabled={loading}
                className="px-6 py-2.5 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-600/30 transition-all flex items-center gap-1.5 disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    <span>{editingVoucher ? 'Update Voucher' : 'Post Voucher (Save)'}</span>
                  </>
                )}
              </button>
            ) : (
              <div className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-200 text-slate-500 cursor-not-allowed">
                Read-Only (Owner Mode)
              </div>
            )}
          </div>
        </form>
      </motion.div>
    </div>
  )
}
