import { useEffect, useMemo, useRef, useState } from 'react'
import { X, Plus, Trash2, Check, AlertCircle, ShieldCheck, Package, User } from 'lucide-react'
import { createVoucher, updateVoucher, nextVoucherNo, isCashName } from '../lib/accountingDb'
import { useRows } from '../lib/useTable'
import { todayISO, r2, inr } from '../lib/format'
import { useAuth } from '../context/AuthContext'
import { useUI } from '../context/UIContext'
import { useVoucherEditor } from '../context/VoucherEditorContext'

const VOUCHER_TYPES = [
  { id: 'sales', label: 'Sales', color: 'bg-emerald-600 text-white' },
  { id: 'purchase', label: 'Purchase', color: 'bg-blue-600 text-white' },
  { id: 'receipt', label: 'Receipt', color: 'bg-teal-600 text-white' },
  { id: 'payment', label: 'Payment', color: 'bg-rose-600 text-white' },
  { id: 'contra', label: 'Contra', color: 'bg-amber-600 text-white' },
]
const TYPE_HELP = {
  sales: 'Sell materials to a customer',
  purchase: 'Buy materials from a supplier',
  receipt: 'Money received from a customer, or a loan taken',
  payment: 'Money paid to a supplier, an expense, or a loan EMI',
  contra: 'Move money between cash and bank' }

const inputCls =
  'w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600'
const labelCls = 'block text-xs font-bold text-slate-700 mb-1'
const blankLine = () => ({ key: Math.random().toString(36).slice(2), material_id: '', text: '', qty: 1, rate: 0, cost_rate: 0, unit: 'pcs', sku: '', name: '' })

const isAccount = (l) => l.group === 'Cash-in-hand' || l.group === 'Bank Accounts'
const isOtherLedger = (l) => !isAccount(l) && !/^(sales|purchase) accounts$/i.test(l.group || '')

// Legacy vouchers only stored a mode string ("HDFC Bank"); find the ledger it meant.
function guessAccount(mode, accounts) {
  const m = String(mode || '').toLowerCase()
  if (!m) return ''
  const exact = accounts.find((l) => l.name.toLowerCase() === m)
  if (exact) return String(exact.id)
  const tokens = m.split(/[^a-z0-9]+/).filter((t) => t.length > 2 && !['bank', 'account', 'accounts', 'current'].includes(t))
  const hit = accounts.find((l) => tokens.some((t) => l.name.toLowerCase().includes(t)))
  return hit ? String(hit.id) : ''
}

export default function VoucherModal({ isOpen, editingVoucher = null, initial = null, onClose }) {
  const { isOwner } = useAuth()
  if (!isOpen || isOwner) return null // owners are view-only; the entry buttons are hidden for them too
  return <VoucherForm editingVoucher={editingVoucher} initial={initial} onClose={onClose} />
}

function VoucherForm({ editingVoucher, initial, onClose }) {
  const editing = editingVoucher
  const ui = useUI()
  const { openVoucher } = useVoucherEditor()
  const materials = useRows('materials')
  const parties = useRows('parties')
  const ledgers = useRows('ledgers')
  const formRef = useRef(null)

  const [type, setType] = useState(editing?.voucher_type || initial?.type || 'sales')
  const [voucherNo, setVoucherNo] = useState(editing?.voucher_no || '')
  const [autoNo, setAutoNo] = useState('')
  const [date, setDate] = useState(editing?.date || todayISO())
  const [partyName, setPartyName] = useState(editing?.party_name || initial?.partyName || '')
  const [partyPhone, setPartyPhone] = useState(editing?.party_phone || '')
  const [narration, setNarration] = useState(editing?.narration || '')
  const [accountId, setAccountId] = useState(() => {
    if (editing?.payment_ledger_id) return String(editing.payment_ledger_id)
    if (editing?.voucher_type === 'receipt' && editing.debit_ledger_id) return String(editing.debit_ledger_id)
    if (editing?.voucher_type === 'payment' && editing.credit_ledger_id) return String(editing.credit_ledger_id)
    return ''
  })
  const [against, setAgainst] = useState(editing?.counter_ledger_id ? 'ledger' : 'party')
  const [counterId, setCounterId] = useState(editing?.counter_ledger_id ? String(editing.counter_ledger_id) : '')
  const [fromId, setFromId] = useState(editing?.credit_ledger_id ? String(editing.credit_ledger_id) : '')
  const [toId, setToId] = useState(editing?.debit_ledger_id ? String(editing.debit_ledger_id) : '')
  const [directAmount, setDirectAmount] = useState(editing && !editing.items?.length ? String(editing.amount || '') : initial?.amount ? String(initial.amount) : '')
  const [payStatus, setPayStatus] = useState(() => {
    if (!editing) return 'paid'
    const paid = Number(editing.paid_amount) || 0
    return paid <= 0 ? 'credit' : paid >= Number(editing.amount) ? 'paid' : 'part'
  })
  const [partAmount, setPartAmount] = useState(editing ? String(editing.paid_amount || '') : '')
  const [items, setItems] = useState(() =>
    editing?.items?.length
      ? editing.items.map((it) => ({ ...blankLine(), ...it, text: it.name || '', material_id: it.material_id ?? '' }))
      : [blankLine()]
  )
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  // Next sequential number shown as the placeholder (blank = use it)
  useEffect(() => {
    if (editing) return
    let live = true
    nextVoucherNo(type).then((n) => live && setAutoNo(n))
    return () => { live = false }
  }, [type, editing])

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const accounts = useMemo(() => ledgers.filter(isAccount), [ledgers])
  const otherLedgers = useMemo(() => ledgers.filter(isOtherLedger), [ledgers])
  const defaultAccountId = useMemo(() => {
    if (editing) return guessAccount(editing.payment_mode, accounts)
    const last = localStorage.getItem('last_account_id')
    if (last && accounts.some((l) => String(l.id) === last)) return last
    return String((accounts.find((l) => l.group === 'Cash-in-hand') || accounts[0])?.id ?? '')
  }, [accounts, editing])
  const effectiveAccountId = accountId || defaultAccountId

  const isTrade = type === 'sales' || type === 'purchase'
  const partyKind = type === 'sales' || type === 'receipt' ? 'debtor' : 'creditor'
  const partyOptions = parties.filter((p) => p.type === partyKind)
  const matchedParty = partyOptions.find((p) => p.name.trim().toLowerCase() === partyName.trim().toLowerCase())

  // ---- money ----
  const lines = items.map((it) => ({ ...it, amount: r2((Number(it.qty) || 0) * (Number(it.rate) || 0)) }))
  const itemsTotal = r2(lines.reduce((a, l) => a + l.amount, 0))
  const total = isTrade ? itemsTotal : r2(Number(directAmount) || 0)
  const paid = !isTrade || payStatus === 'paid' ? total : payStatus === 'credit' ? 0 : Math.min(r2(Number(partAmount) || 0), total)
  const due = r2(total - paid)
  const movesMoney = !isTrade || paid > 0

  // stock already taken by THIS voucher (when editing) is available again
  const ownQty = (m) =>
    editing?.voucher_type === 'sales'
      ? (editing.items || []).filter((it) => Number(it.material_id) === m.id || it.sku === m.sku).reduce((a, it) => a + (Number(it.qty) || 0), 0)
      : 0

  function setLine(i, patch) {
    setItems((list) => list.map((l, idx) => (idx === i ? { ...l, ...patch } : l)))
  }
  function onMaterialText(i, text) {
    const q = text.trim().toLowerCase()
    const m = materials.find((x) => x.name.toLowerCase() === q || String(x.sku).toLowerCase() === q)
    if (!m) return setLine(i, { text, material_id: '' })
    setLine(i, {
      text: m.name,
      material_id: m.id,
      sku: m.sku,
      name: m.name,
      unit: m.unit || 'pcs',
      cost_rate: Number(m.purchase_rate) || 0,
      rate: type === 'purchase' ? Number(m.purchase_rate) || 0 : Number(m.sales_rate) || 0 })
  }

  function validate() {
    if (isTrade) {
      for (let i = 0; i < lines.length; i++) {
        if (!lines[i].material_id) return `Line ${i + 1}: choose a material from the list`
        if (!(Number(lines[i].qty) > 0)) return `Line ${i + 1}: enter a quantity`
      }
      if (total <= 0) return 'Invoice total must be greater than zero'
      if (payStatus === 'part' && !(paid > 0 && paid < total)) return 'Part payment must be more than 0 and less than the total'
    } else if (total <= 0) {
      return 'Enter an amount'
    }

    const name = partyName.trim()
    if (type === 'sales' && due > 0 && isCashName(name)) return 'Enter the customer name: a balance is due from them'
    if (type === 'purchase' && !name) return 'Enter the supplier name'
    if ((type === 'receipt' || type === 'payment') && against === 'party' && !name) return 'Choose the party'
    if ((type === 'receipt' || type === 'payment') && against === 'ledger' && !counterId) return 'Choose the ledger (expense / loan)'
    if (type === 'contra') {
      if (!fromId || !toId) return 'Choose both accounts'
      if (fromId === toId) return 'From and To accounts must be different'
    } else if (movesMoney && !effectiveAccountId) {
      return 'Add a cash or bank account first (Cash & Loans page)'
    }
    return null
  }

  async function save(andNew = false) {
    const problem = validate()
    if (problem) return setError(problem)
    setSaving(true)
    setError(null)
    try {
      const account = accounts.find((l) => String(l.id) === String(effectiveAccountId))
      const byLedger = (type === 'receipt' || type === 'payment') && against === 'ledger'
      const payload = {
        voucher_type: type,
        voucher_no: voucherNo.trim(),
        date,
        party_name: byLedger || type === 'contra' ? '' : partyName.trim(),
        party_phone: partyPhone.trim(),
        payment_ledger_id: type !== 'contra' && movesMoney ? Number(effectiveAccountId) : null,
        payment_mode: type !== 'contra' && movesMoney ? account?.name || '' : '',
        counter_ledger_id: byLedger ? Number(counterId) : null,
        debit_ledger_id: type === 'contra' ? Number(toId) : null,
        credit_ledger_id: type === 'contra' ? Number(fromId) : null,
        narration: narration.trim(),
        amount: total,
        paid_amount: paid,
        due_amount: isTrade ? due : 0,
        items: isTrade
          ? lines.map(({ key: _k, text: _t, ...l }) => ({ ...l, material_id: Number(l.material_id), qty: Number(l.qty), rate: Number(l.rate) }))
          : [] }
      if (type === 'contra') {
        const f = ledgers.find((l) => String(l.id) === fromId)
        const t = ledgers.find((l) => String(l.id) === toId)
        payload.party_name = `${f?.name} → ${t?.name}`
      }

      const saved = editing?.id ? await updateVoucher(editing.id, payload) : await createVoucher(payload)
      if (payload.payment_ledger_id) localStorage.setItem('last_account_id', String(payload.payment_ledger_id))
      ui.toast(`${editing ? 'Updated' : 'Saved'} ${saved.voucher_no} · ${inr(total)}`)
      if (andNew && !editing) openVoucher(null, { type })
      else onClose()
    } catch (err) {
      setError(err.message || 'Failed to save voucher')
      setSaving(false)
    }
  }

  const accountLabel = type === 'sales' || type === 'receipt' ? 'Received in' : 'Paid from'
  const uidHint =
    type === 'sales' &&
    (matchedParty?.uid ? (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-800 border border-blue-300 text-[11px] font-semibold">
        <ShieldCheck className="w-3.5 h-3.5" /> {matchedParty.uid}
      </span>
    ) : due > 0 && !isCashName(partyName) ? (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300 text-[11px] font-semibold">
        <ShieldCheck className="w-3.5 h-3.5" /> Balance due → customer gets a permanent UID
      </span>
    ) : null)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-5 bg-slate-900/50" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label="Voucher" className="w-full max-w-3xl bg-white sm:rounded-2xl shadow-xl border border-slate-200 overflow-hidden h-full sm:h-auto sm:max-h-[94vh] flex flex-col text-slate-900">
        <div className="bg-white border-b border-slate-200 text-slate-900 px-4 py-3 flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-lg font-black text-slate-900">{editing ? `Edit ${editing.voucher_no}` : 'New voucher'}</h2>
            <p className="text-[11px] text-slate-500 font-medium">{TYPE_HELP[type] || 'Edit voucher'} · Ctrl+Enter to save · Esc to close</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {!editing && (
          <div className="bg-slate-100 p-2 border-b border-slate-200 flex gap-1.5 overflow-x-auto shrink-0" role="tablist">
            {VOUCHER_TYPES.map((vt) => (
              <button
                key={vt.id}
                type="button"
                role="tab"
                aria-selected={type === vt.id}
                onClick={() => { setType(vt.id); setError(null) }}
                className={`px-4 py-2 rounded-lg text-xs font-bold whitespace-nowrap ${type === vt.id ? vt.color : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-200/80'}`}
              >
                {vt.label}
              </button>
            ))}
          </div>
        )}

        <form
          ref={formRef}
          onSubmit={(e) => { e.preventDefault(); save(false) }}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); formRef.current.requestSubmit() }
            else if (e.key === 'Enter' && e.target.tagName === 'INPUT') e.preventDefault() // Enter must not save by accident
          }}
          className="flex flex-col flex-1 min-h-0"
        >
          <div className="p-4 sm:p-5 overflow-y-auto space-y-4 flex-1">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls} htmlFor="vm-no">Voucher no.</label>
                <input id="vm-no" className={inputCls} value={voucherNo} onChange={(e) => setVoucherNo(e.target.value)} placeholder={autoNo || 'Auto'} />
              </div>
              <div>
                <label className={labelCls} htmlFor="vm-date">Date</label>
                <input id="vm-date" type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} required />
              </div>
            </div>

            {/* ---- who ---- */}
            {type !== 'contra' && (
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-2.5">
                {(type === 'receipt' || type === 'payment') && (
                  <div className="flex gap-1.5">
                    {[['party', type === 'receipt' ? 'From customer' : 'To supplier'], ['ledger', type === 'receipt' ? 'Loan / other income' : 'Expense / loan EMI']].map(([id, label]) => (
                      <button key={id} type="button" onClick={() => setAgainst(id)} className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${against === id ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-300'}`}>
                        {label}
                      </button>
                    ))}
                  </div>
                )}

                {against === 'ledger' && (type === 'receipt' || type === 'payment') ? (
                  <div>
                    <label className={labelCls} htmlFor="vm-counter">Ledger</label>
                    <select id="vm-counter" className={inputCls} value={counterId} onChange={(e) => setCounterId(e.target.value)}>
                      <option value="">Select ledger…</option>
                      {otherLedgers.map((l) => <option key={l.id} value={l.id}>{l.name} ({l.group})</option>)}
                    </select>
                  </div>
                ) : (
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5" htmlFor="vm-party">
                        <User className="w-3.5 h-3.5 text-blue-600" />
                        {partyKind === 'debtor' ? 'Customer' : 'Supplier'}
                        {type === 'sales' && <span className="font-normal text-slate-500">(leave blank for a cash sale)</span>}
                      </label>
                      {uidHint}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <input id="vm-party" autoFocus={type !== 'sales'} list="vm-parties" className={inputCls} placeholder="Type or pick a name…" value={partyName} onChange={(e) => setPartyName(e.target.value)} autoComplete="off" />
                      {type === 'sales' && !matchedParty && !isCashName(partyName) && (
                        <input className={inputCls} inputMode="tel" placeholder="Phone (optional)" value={partyPhone} onChange={(e) => setPartyPhone(e.target.value)} />
                      )}
                    </div>
                    <datalist id="vm-parties">
                      {partyOptions.map((p) => <option key={p.id} value={p.name}>{`${p.uid ? `[${p.uid}] ` : ''}Balance ${inr(p.current_balance)}`}</option>)}
                    </datalist>
                    {(type === 'receipt' || type === 'payment') && matchedParty && Number(matchedParty.current_balance) > 0 && !editing && (
                      <div className="mt-2 flex items-center gap-2 text-xs text-slate-600">
                        Outstanding <strong className="text-rose-600">{inr(matchedParty.current_balance)}</strong>
                        <button type="button" onClick={() => setDirectAmount(String(matchedParty.current_balance))} className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-200 font-bold">
                          Fill full amount
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {type === 'contra' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-amber-50/60 p-3 rounded-xl border border-amber-200">
                {[['From', fromId, setFromId], ['To', toId, setToId]].map(([label, val, set]) => (
                  <div key={label}>
                    <label className={labelCls}>{label}</label>
                    <select className={inputCls} value={val} onChange={(e) => set(e.target.value)}>
                      <option value="">Select account…</option>
                      {accounts.map((l) => <option key={l.id} value={l.id}>{l.name} · {inr(l.current_balance)}</option>)}
                    </select>
                  </div>
                ))}
              </div>
            )}

            {/* ---- items ---- */}
            {isTrade && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800 uppercase tracking-wide flex items-center gap-1.5">
                    <Package className="w-4 h-4 text-emerald-600" /> Items ({items.length})
                  </span>
                  <button type="button" onClick={() => setItems((l) => [...l, blankLine()])} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200">
                    <Plus className="w-3.5 h-3.5" /> Add item
                  </button>
                </div>
                <datalist id="vm-materials">
                  {materials.map((m) => <option key={m.id} value={m.name}>{`${m.sku} · ${m.current_qty} ${m.unit} in stock`}</option>)}
                </datalist>

                <div className="space-y-2">
                  {lines.map((l, i) => {
                    const m = materials.find((x) => x.id === Number(l.material_id))
                    const short = type === 'sales' && m && Number(l.qty) > (Number(m.current_qty) || 0) + ownQty(m)
                    return (
                      <div key={l.key} className="grid grid-cols-12 gap-2 items-start p-2 rounded-xl border border-slate-200 bg-white">
                        <div className="col-span-12 sm:col-span-5">
                          <input aria-label={`Material ${i + 1}`} list="vm-materials" className={inputCls} placeholder="Search material or SKU…" value={l.text} onChange={(e) => onMaterialText(i, e.target.value)} autoComplete="off" autoFocus={i === 0 && type === 'sales'} />
                          {m && <div className={`mt-1 text-[11px] ${short ? 'text-amber-600 font-bold' : 'text-slate-500'}`}>{short ? `Only ${m.current_qty} ${m.unit} in stock: stock will go negative` : `${m.current_qty} ${m.unit} in stock`}</div>}
                        </div>
                        <div className="col-span-4 sm:col-span-2">
                          <input aria-label="Quantity" type="number" inputMode="decimal" min="0" step="any" className={`${inputCls} text-right`} value={l.qty} onChange={(e) => setLine(i, { qty: e.target.value })} />
                          <div className="mt-1 text-[11px] text-slate-500 text-right">{l.unit}</div>
                        </div>
                        <div className="col-span-4 sm:col-span-2">
                          <input aria-label="Rate" type="number" inputMode="decimal" min="0" step="any" className={`${inputCls} text-right`} value={l.rate} onChange={(e) => setLine(i, { rate: e.target.value })} />
                          <div className="mt-1 text-[11px] text-slate-500 text-right">rate ₹</div>
                        </div>
                        <div className="col-span-3 sm:col-span-2 text-right font-bold text-slate-900 text-sm pt-2">{inr(l.amount)}</div>
                        <div className="col-span-1 pt-1.5 text-right">
                          {items.length > 1 && (
                            <button type="button" aria-label="Remove item" onClick={() => setItems((list) => list.filter((_, idx) => idx !== i))} className="p-1.5 text-slate-400 hover:text-rose-600">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>

                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-500">Total</span>
                    <span className="text-2xl font-black text-slate-900">{inr(itemsTotal)}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {[['paid', 'Paid in full'], ['credit', 'On credit'], ['part', 'Part payment']].map(([id, label]) => (
                      <button key={id} type="button" onClick={() => setPayStatus(id)} className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${payStatus === id ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-300'}`}>
                        {label}
                      </button>
                    ))}
                    {payStatus === 'part' && (
                      <input aria-label="Amount paid now" type="number" inputMode="decimal" min="0" step="any" className={`${inputCls} w-36 text-right`} placeholder="Paid now ₹" value={partAmount} onChange={(e) => setPartAmount(e.target.value)} />
                    )}
                    {due > 0 && <span className="ml-auto text-xs font-bold text-rose-600">Due {inr(due)}</span>}
                  </div>
                </div>
              </div>
            )}

            {!isTrade && (
              <div>
                <label className={labelCls} htmlFor="vm-amt">Amount (₹)</label>
                <input id="vm-amt" type="number" inputMode="decimal" min="0" step="any" className={`${inputCls} max-w-xs text-lg font-black`} value={directAmount} onChange={(e) => setDirectAmount(e.target.value)} placeholder="0.00" autoFocus={type === 'contra'} />
              </div>
            )}

            {type !== 'contra' && movesMoney && (
              <div>
                <label className={labelCls} htmlFor="vm-account">{accountLabel}</label>
                <select id="vm-account" className={`${inputCls} max-w-sm`} value={effectiveAccountId} onChange={(e) => setAccountId(e.target.value)}>
                  {accounts.length === 0 && <option value="">No cash/bank account yet</option>}
                  {accounts.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>
            )}

            <div>
              <label className={labelCls} htmlFor="vm-narr">Narration (optional)</label>
              <textarea id="vm-narr" rows={2} className={inputCls} value={narration} onChange={(e) => setNarration(e.target.value)} />
            </div>
          </div>

          <div className="border-t border-slate-200 p-3 sm:p-4 shrink-0 space-y-2 bg-white">
            {error && (
              <div role="alert" className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs font-semibold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" /> {error}
              </div>
            )}
            <div className="flex items-center justify-end gap-2">
              <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100">Cancel</button>
              {!editing && (
                <button type="button" disabled={saving} onClick={() => save(true)} className="px-4 py-2.5 rounded-xl text-xs font-bold text-blue-700 bg-blue-50 border border-blue-200 hover:bg-blue-100 disabled:opacity-50">
                  Save &amp; new
                </button>
              )}
              <button type="submit" disabled={saving} className="px-6 py-2.5 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-md disabled:opacity-50 flex items-center gap-1.5">
                <Check className="w-4 h-4" /> {saving ? 'Saving…' : editing ? 'Update' : 'Save'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
