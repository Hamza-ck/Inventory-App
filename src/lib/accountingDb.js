import Dexie from 'dexie'
import { todayISO, daysAgoISO, r2 } from './format.js'

/**
 * Accounting database (Dexie / IndexedDB).
 *
 * Every write that touches more than one table (vouchers + stock + party
 * balances + cash/bank ledgers) runs inside ONE Dexie transaction, so a failure
 * half-way can never leave balances out of sync with the voucher list.
 */

export const accDb = new Dexie('TallySaasAccounting')

accDb.version(1).stores({
  vouchers: '++id, voucher_no, voucher_type, date, party_id, party_name, party_uid, amount, due_amount, createdAt',
  materials: '++id, sku, name, category, unit, current_qty, purchase_rate, sales_rate, reorder_threshold',
  parties: '++id, name, type, uid, phone, current_balance',
  ledgers: '++id, name, group, current_balance',
  settings: 'key, value',
})

function inTx(fn) {
  return accDb.transaction('rw', accDb.vouchers, accDb.materials, accDb.parties, accDb.ledgers, fn)
}

/* ------------------------------------------------------------------ */
/* Voucher numbers                                                     */
/* ------------------------------------------------------------------ */

export const VOUCHER_PREFIX = {
  sales: 'INV',
  purchase: 'PUR',
  receipt: 'REC',
  payment: 'PAY',
  contra: 'CNT',
  journal: 'JRN',
}

/** Next sequential number for a voucher type, e.g. INV-0012 */
export async function nextVoucherNo(type) {
  const prefix = VOUCHER_PREFIX[type] || 'VCH'
  let max = 0
  await accDb.vouchers
    .where('voucher_type')
    .equals(type)
    .each((v) => {
      const no = String(v.voucher_no || '')
      const m = no.match(/(\d+)$/)
      if (m && no.toUpperCase().startsWith(prefix + '-')) max = Math.max(max, parseInt(m[1], 10))
    })
  return `${prefix}-${String(max + 1).padStart(4, '0')}`
}

async function assertUniqueVoucherNo(voucher, selfId = null) {
  const clash = await accDb.vouchers
    .where('voucher_no')
    .equals(voucher.voucher_no)
    .filter((v) => v.voucher_type === voucher.voucher_type && v.id !== selfId)
    .first()
  if (clash) throw new Error(`Voucher no. ${voucher.voucher_no} already exists for ${voucher.voucher_type}`)
}

/* ------------------------------------------------------------------ */
/* Parties & permanent debtor UIDs                                     */
/* ------------------------------------------------------------------ */

const CASH_NAME = /^(cash|counter cash|cash sale|walk-?in.*)$/i
export const isCashName = (name) => !name || CASH_NAME.test(String(name).trim())

export async function findParty(name, type = null) {
  const clean = String(name || '').trim()
  if (!clean) return null
  const matches = await accDb.parties.where('name').equalsIgnoreCase(clean).toArray()
  return (type && matches.find((p) => p.type === type)) || (type ? null : matches[0]) || null
}

export async function isPartyNameTaken(name, type, exceptId = null) {
  const clean = String(name || '').trim()
  if (!clean) return false
  const matches = await accDb.parties.where('name').equalsIgnoreCase(clean).toArray()
  return matches.some((p) => p.type === type && p.id !== exceptId)
}

export async function isSkuTaken(sku, exceptId = null) {
  const clean = String(sku || '').trim()
  if (!clean) return false
  const hit = await accDb.materials
    .where('sku')
    .equalsIgnoreCase(clean)
    .filter((m) => m.id !== exceptId)
    .first()
  return Boolean(hit)
}

// UID-CUST-1001, UID-CUST-1002, ... (never reused, never lower than 1001)
export async function generateNextDebtorUid() {
  let max = 1000
  await accDb.parties.each((p) => {
    const m = p.uid && String(p.uid).match(/^UID-CUST-(\d+)$/)
    if (m) max = Math.max(max, parseInt(m[1], 10))
  })
  return `UID-CUST-${max + 1}`
}

async function createParty(fields) {
  const id = await accDb.parties.add({
    uid: null,
    phone: '',
    email: '',
    address: '',
    opening_balance: 0,
    // Balance starts at 0: the voucher's own effect adds the due amount.
    current_balance: 0,
    created_at: new Date().toISOString(),
    ...fields,
  })
  return accDb.parties.get(id)
}

/**
 * Debtor rule: an invoice that leaves a closing due gets a PERMANENT customer
 * UID (reused for every later transaction). Fully-paid cash sales stay UID-less.
 */
export async function resolvePartyUidOnSale(partyName, dueAmount, phone = '') {
  const cleanName = String(partyName || '').trim()
  if (!cleanName) return { party: null, uid: null }

  const hasDue = Number(dueAmount) > 0
  const party = await findParty(cleanName, 'debtor')

  if (party) {
    if (phone && !party.phone) {
      await accDb.parties.update(party.id, { phone })
      party.phone = phone
    }
    if (party.uid) return { party, uid: party.uid }
    if (hasDue) {
      const uid = await generateNextDebtorUid()
      await accDb.parties.update(party.id, { uid })
      party.uid = uid
      return { party, uid }
    }
    return { party, uid: null }
  }

  if (isCashName(cleanName) && !hasDue) return { party: null, uid: null }

  const uid = hasDue ? await generateNextDebtorUid() : null
  const created = await createParty({ name: cleanName, type: 'debtor', uid, phone })
  return { party: created, uid }
}

async function ensureCreditor(name) {
  return (await findParty(name, 'creditor')) || createParty({ name: String(name).trim(), type: 'creditor' })
}

/** Link a voucher to its party (always explicit, so edits can't keep a stale link). */
async function attachParty(data, { autoCreateParty = false } = {}) {
  const type = data.voucher_type
  data.party_id = null
  data.party_uid = null

  if (type === 'sales') {
    const { party, uid } = await resolvePartyUidOnSale(data.party_name, data.due_amount, data.party_phone)
    if (party) data.party_id = party.id
    data.party_uid = uid
    return
  }

  const name = String(data.party_name || '').trim()
  if (type === 'purchase') {
    if (name) data.party_id = (await ensureCreditor(name)).id
    return
  }

  if (type === 'receipt' || type === 'payment') {
    if (data.counter_ledger_id) return // booked against a ledger (expense / loan), not a party
    if (!name) return
    const partyType = type === 'receipt' ? 'debtor' : 'creditor'
    let party = await findParty(name, partyType)
    if (!party && autoCreateParty) party = await createParty({ name, type: partyType })
    if (!party) {
      throw new Error(
        `No ${partyType === 'debtor' ? 'customer' : 'supplier'} named "${name}". Pick one from the list or add it first.`
      )
    }
    data.party_id = party.id
    data.party_uid = party.uid || null
  }
}

/* ------------------------------------------------------------------ */
/* Voucher effects (stock, party balance, cash/bank/other ledgers)     */
/* ------------------------------------------------------------------ */

async function findMaterial(item) {
  if (item.material_id !== undefined && item.material_id !== null && item.material_id !== '') {
    // IndexedDB keys are typed: "3" (from a <select>) never matches 3.
    const m = await accDb.materials.get(Number(item.material_id))
    if (m) return m
  }
  if (item.sku) {
    const m = await accDb.materials.where('sku').equalsIgnoreCase(String(item.sku)).first()
    if (m) return m
  }
  if (item.name) return accDb.materials.where('name').equalsIgnoreCase(String(item.name)).first()
  return null
}

async function findVoucherParty(v) {
  if (v.party_id) {
    const p = await accDb.parties.get(Number(v.party_id))
    if (p) return p
  }
  if (v.party_uid) {
    const p = await accDb.parties.where('uid').equals(v.party_uid).first()
    if (p) return p
  }
  if (v.party_name) {
    const wanted = v.voucher_type === 'sales' || v.voucher_type === 'receipt' ? 'debtor' : 'creditor'
    return (await findParty(v.party_name, wanted)) || (await findParty(v.party_name))
  }
  return null
}

const GENERIC_WORDS = new Set(['bank', 'account', 'accounts', 'current', 'savings'])

/** The cash / bank ledger a voucher moved money through. */
async function resolveAccountLedger(v) {
  if (v.payment_ledger_id) {
    const l = await accDb.ledgers.get(Number(v.payment_ledger_id))
    if (l) return l
  }
  // legacy vouchers stored the account in debit/credit ledger id
  const legacyId =
    v.voucher_type === 'receipt' ? v.debit_ledger_id : v.voucher_type === 'payment' ? v.credit_ledger_id : null
  if (legacyId) {
    const l = await accDb.ledgers.get(Number(legacyId))
    if (l) return l
  }

  const all = (await accDb.ledgers.toArray()).filter((l) => l.group === 'Cash-in-hand' || l.group === 'Bank Accounts')
  const firstCash = all.find((l) => l.group === 'Cash-in-hand')
  const firstBank = all.find((l) => l.group === 'Bank Accounts')

  const mode = String(v.payment_mode || '').toLowerCase().trim()
  if (mode) {
    const exact = all.find((l) => l.name.toLowerCase() === mode)
    if (exact) return exact
    const tokens = mode.split(/[^a-z0-9]+/).filter((t) => t.length > 2 && !GENERIC_WORDS.has(t))
    const hit = tokens.length && all.find((l) => tokens.some((t) => l.name.toLowerCase().includes(t)))
    if (hit) return hit
    if (mode.includes('bank')) return firstBank || firstCash || null
  }
  return firstCash || firstBank || null
}

// Signed effect of a receipt/payment on the *other* ledger it is booked against.
function counterDelta(group = '', voucherType) {
  const isLoanLiability = /liabilit/i.test(group)
  const isAdvanceAsset = /advance|asset/i.test(group)
  const isExpense = /expense/i.test(group)
  if (voucherType === 'payment') return isLoanLiability ? -1 : 1 // EMI reduces loan; expense/advance grows
  return isAdvanceAsset || isExpense ? -1 : 1 // advance repaid / refund shrinks; loan taken / income grows
}

async function bumpLedger(ledgerOrId, delta) {
  if (!delta || !ledgerOrId) return
  const id = typeof ledgerOrId === 'object' ? ledgerOrId.id : Number(ledgerOrId)
  const fresh = await accDb.ledgers.get(id)
  if (!fresh) return
  await accDb.ledgers.update(id, { current_balance: r2((Number(fresh.current_balance) || 0) + delta) })
}

async function applyVoucherEffects(voucher, isReversal = false) {
  const sign = isReversal ? -1 : 1
  const type = voucher.voucher_type
  const amount = Number(voucher.amount) || 0
  const paid = Number(voucher.paid_amount) || 0
  const due = Number(voucher.due_amount) || 0

  // 1. Stock: sales go out, purchases come in. No clamping, so undo is exact
  //    (selling more than in stock shows as negative stock instead of hiding it).
  if ((type === 'sales' || type === 'purchase') && Array.isArray(voucher.items)) {
    for (const item of voucher.items) {
      const qty = Number(item.qty) || 0
      if (!qty) continue
      const material = await findMaterial(item)
      if (!material) continue
      const delta = (type === 'sales' ? -qty : qty) * sign
      await accDb.materials.update(material.id, { current_qty: r2((Number(material.current_qty) || 0) + delta) })
    }
  }

  // 2. Party balance (debtor: owed to us, creditor: owed by us)
  if (type === 'sales' || type === 'purchase') {
    const party = await findVoucherParty(voucher)
    if (party && due) {
      await accDb.parties.update(party.id, { current_balance: r2((Number(party.current_balance) || 0) + due * sign) })
    }
  } else if ((type === 'receipt' || type === 'payment') && !voucher.counter_ledger_id) {
    const party = await findVoucherParty(voucher)
    if (party) {
      await accDb.parties.update(party.id, { current_balance: r2((Number(party.current_balance) || 0) - amount * sign) })
    }
  }

  // 3. Cash / bank / other ledgers
  if (type === 'sales' && paid > 0) {
    await bumpLedger(await resolveAccountLedger(voucher), paid * sign)
  } else if (type === 'purchase' && paid > 0) {
    await bumpLedger(await resolveAccountLedger(voucher), -paid * sign)
  } else if (type === 'receipt') {
    await bumpLedger(await resolveAccountLedger(voucher), amount * sign)
  } else if (type === 'payment') {
    await bumpLedger(await resolveAccountLedger(voucher), -amount * sign)
  } else if (type === 'contra') {
    await bumpLedger(voucher.debit_ledger_id, amount * sign)
    await bumpLedger(voucher.credit_ledger_id, -amount * sign)
  }

  if ((type === 'receipt' || type === 'payment') && voucher.counter_ledger_id) {
    const counter = await accDb.ledgers.get(Number(voucher.counter_ledger_id))
    if (counter) await bumpLedger(counter, counterDelta(counter.group, type) * amount * sign)
  }
}

/* ------------------------------------------------------------------ */
/* Voucher CRUD (each is atomic)                                       */
/* ------------------------------------------------------------------ */

export function createVoucher(voucherData, opts = {}) {
  return inTx(async () => {
    const data = { ...voucherData }
    const now = new Date().toISOString()
    data.date = data.date || todayISO()
    data.createdAt = now
    data.updatedAt = now
    if (!data.voucher_type) throw new Error('Voucher type is required')
    if (!data.voucher_no) data.voucher_no = await nextVoucherNo(data.voucher_type)

    await assertUniqueVoucherNo(data)
    await attachParty(data, opts)

    data.id = await accDb.vouchers.add(data)
    await applyVoucherEffects(data, false)
    return data
  })
}

/** Tally-style: every voucher stays editable; old effects are undone, new ones applied. */
export function updateVoucher(id, updatedData, opts = {}) {
  return inTx(async () => {
    const existing = await accDb.vouchers.get(Number(id))
    if (!existing) throw new Error('Voucher not found for modification')

    await applyVoucherEffects(existing, true)

    const next = { ...existing, ...updatedData, updatedAt: new Date().toISOString() }
    if (!next.voucher_no) next.voucher_no = existing.voucher_no
    await assertUniqueVoucherNo(next, existing.id)
    await attachParty(next, opts)

    await accDb.vouchers.put(next)
    await applyVoucherEffects(next, false)
    return next
  })
}

export function deleteVoucher(id) {
  return inTx(async () => {
    const existing = await accDb.vouchers.get(Number(id))
    if (!existing) return false
    await applyVoucherEffects(existing, true)
    await accDb.vouchers.delete(Number(id))
    return true
  })
}

/* ------------------------------------------------------------------ */
/* Tally import (all-or-nothing)                                       */
/* ------------------------------------------------------------------ */

export function importTallyData(parsed) {
  return inTx(async () => {
    const result = { ledgers: 0, materials: 0, vouchers: 0, skipped: 0 }

    for (const l of parsed.ledgers || []) {
      const group = (l.group || '').toLowerCase()
      const isDebtor = group.includes('debtor')
      const isCreditor = group.includes('creditor')

      if (isDebtor || isCreditor) {
        if (await findParty(l.name, isDebtor ? 'debtor' : 'creditor')) continue
        await createParty({
          name: l.name,
          type: isDebtor ? 'debtor' : 'creditor',
          uid: isDebtor && l.opening_balance > 0 ? await generateNextDebtorUid() : null,
          phone: l.phone || '',
          email: l.email || '',
          address: l.address || '',
          opening_balance: l.opening_balance || 0,
          current_balance: l.opening_balance || 0,
        })
        result.ledgers++
      } else if (!(await accDb.ledgers.where('name').equalsIgnoreCase(l.name).first())) {
        await accDb.ledgers.add({
          name: l.name,
          group: l.group || 'General',
          opening_balance: l.opening_balance || 0,
          current_balance: l.opening_balance || 0,
          is_system: false,
        })
        result.ledgers++
      }
    }

    for (const m of parsed.stockItems || []) {
      if (await accDb.materials.where('name').equalsIgnoreCase(m.name).first()) continue
      let sku = m.sku
      for (let n = 2; await isSkuTaken(sku); n++) sku = `${m.sku}-${n}` // generated SKUs can collide
      await accDb.materials.add({
        category: 'General',
        unit: 'pcs',
        reorder_threshold: 10,
        ...m,
        sku,
        created_at: new Date().toISOString(),
      })
      result.materials++
    }

    for (const v of parsed.vouchers || []) {
      // Tally numbers restart per voucher type (Sales #1 and Receipt #1 both exist)
      const dup = await accDb.vouchers
        .where('voucher_no')
        .equals(v.voucher_no)
        .filter((x) => x.voucher_type === v.voucher_type && x.date === v.date)
        .first()
      if (dup || !(Number(v.amount) > 0)) {
        result.skipped++
        continue
      }
      await createVoucher(v, { autoCreateParty: true })
      result.vouchers++
    }

    return result
  })
}

/* ------------------------------------------------------------------ */
/* First-run data                                                      */
/* ------------------------------------------------------------------ */

/** A new book starts with only the accounts every business needs, all at zero. */
export async function initDefaultAccountingData() {
  if ((await accDb.ledgers.count()) > 0) return
  await accDb.ledgers.bulkAdd([
    { name: 'Cash in Hand', group: 'Cash-in-hand', opening_balance: 0, current_balance: 0, is_system: true },
    { name: 'Sales Account', group: 'Sales Accounts', opening_balance: 0, current_balance: 0, is_system: true },
    { name: 'Purchase Account', group: 'Purchase Accounts', opening_balance: 0, current_balance: 0, is_system: true },
    { name: 'Shop Rent', group: 'Indirect Expenses', opening_balance: 0, current_balance: 0, is_system: false },
    { name: 'Staff Salaries', group: 'Indirect Expenses', opening_balance: 0, current_balance: 0, is_system: false },
    { name: 'Electricity & Utilities', group: 'Indirect Expenses', opening_balance: 0, current_balance: 0, is_system: false },
  ])
}

/** Optional sample company, loaded only when the user asks and the book is empty. */
export async function loadDemoData() {
  if ((await accDb.vouchers.count()) > 0 || (await accDb.materials.count()) > 0) {
    throw new Error('Sample data can only be loaded into an empty book.')
  }

  return inTx(async () => {
    const ledgers = [
      { name: 'Cash in Hand', group: 'Cash-in-hand', balance: 45000, is_system: true },
      { name: 'HDFC Current Account 0422', group: 'Bank Accounts', balance: 285000, is_system: true },
      { name: 'State Bank of India (SBI)', group: 'Bank Accounts', balance: 140000, is_system: true },
      { name: 'HDFC Business Term Loan', group: 'Loans (Liability)', balance: 200000, is_system: false },
      { name: 'Staff Emergency Advances', group: 'Loans & Advances (Asset)', balance: 15000, is_system: false },
      { name: 'Freight & Transportation', group: 'Direct Expenses', balance: 0, is_system: false },
    ]
    for (const l of ledgers) {
      const existing = await accDb.ledgers.where('name').equals(l.name).first()
      const fields = { opening_balance: l.balance, current_balance: l.balance }
      if (existing) await accDb.ledgers.update(existing.id, fields)
      else await accDb.ledgers.add({ name: l.name, group: l.group, is_system: l.is_system, ...fields })
    }

    await accDb.materials.bulkAdd([
      { sku: 'MAT-CANVAS-01', name: 'Industrial Cotton Canvas 350 GSM', category: 'Fabrics & Textiles', unit: 'meter', purchase_rate: 140, sales_rate: 195, current_qty: 450, reorder_threshold: 50 },
      { sku: 'MAT-DENIM-02', name: 'Heavy Weight Denim Twill 14oz', category: 'Fabrics & Textiles', unit: 'meter', purchase_rate: 180, sales_rate: 260, current_qty: 280, reorder_threshold: 40 },
      { sku: 'MAT-BOLT-03', name: 'High Tensile Steel Bolts M12', category: 'Hardware & Fasteners', unit: 'box', purchase_rate: 380, sales_rate: 520, current_qty: 65, reorder_threshold: 15 },
      { sku: 'MAT-ZIP-04', name: 'YKK Brass Heavy Zipper 5# (24 inch)', category: 'Accessories & Trims', unit: 'pcs', purchase_rate: 18, sales_rate: 32, current_qty: 850, reorder_threshold: 100 },
      { sku: 'MAT-THRD-05', name: 'Polyester Bonded Thread 40/2', category: 'Accessories & Trims', unit: 'spool', purchase_rate: 65, sales_rate: 110, current_qty: 60, reorder_threshold: 25 },
    ])

    await accDb.parties.bulkAdd([
      { name: 'Apex Infotech Pvt Ltd', type: 'debtor', uid: 'UID-CUST-1001', phone: '+91 98450 11223', email: 'accounts@apexinfotech.in', address: 'Plot 44, Electronic City, Bangalore', opening_balance: 24500, current_balance: 24500 },
      { name: 'Golden Star Garments', type: 'debtor', uid: 'UID-CUST-1002', phone: '+91 98211 44556', email: 'purchase@goldenstargarments.com', address: 'Industrial Area Phase 2, Ludhiana', opening_balance: 18200, current_balance: 18200 },
      { name: 'Metro Steel & Hardware', type: 'creditor', uid: null, phone: '+91 98210 99887', email: 'sales@metrosteel.com', address: 'Loha Mandi, Delhi', opening_balance: 45000, current_balance: 45000 },
      { name: 'Supreme Fabrics Mill', type: 'creditor', uid: null, phone: '+91 98765 43210', email: 'mill@supremefabrics.com', address: 'Ring Road Textile Market, Surat', opening_balance: 62000, current_balance: 62000 },
    ])

    // Posted through the real engine, so stock, balances and ledgers all agree.
    const canvas = await accDb.materials.where('sku').equals('MAT-CANVAS-01').first()
    const thread = await accDb.materials.where('sku').equals('MAT-THRD-05').first()
    const line = (m, qty, rate) => ({
      material_id: m.id, sku: m.sku, name: m.name, unit: m.unit,
      qty, rate, cost_rate: m.purchase_rate, amount: qty * rate,
    })
    const hdfc = await accDb.ledgers.where('name').equals('HDFC Current Account 0422').first()
    const cash = await accDb.ledgers.where('name').equals('Cash in Hand').first()

    await createVoucher({ voucher_type: 'purchase', date: daysAgoISO(1), party_name: 'Supreme Fabrics Mill', amount: 28000, paid_amount: 15000, due_amount: 13000, payment_ledger_id: hdfc.id, payment_mode: hdfc.name, narration: 'Restocking cotton canvas rolls', items: [line(canvas, 200, 140)] })
    await createVoucher({ voucher_type: 'sales', party_name: 'Apex Infotech Pvt Ltd', amount: 19500, paid_amount: 10000, due_amount: 9500, payment_ledger_id: hdfc.id, payment_mode: hdfc.name, narration: 'Industrial cotton canvas supply', items: [line(canvas, 100, 195)] })
    await createVoucher({ voucher_type: 'sales', party_name: '', amount: 4400, paid_amount: 4400, due_amount: 0, payment_ledger_id: cash.id, payment_mode: cash.name, narration: 'Counter sale (cash)', items: [line(thread, 40, 110)] })
    await createVoucher({ voucher_type: 'receipt', party_name: 'Golden Star Garments', amount: 8000, payment_ledger_id: hdfc.id, payment_mode: hdfc.name, narration: 'NEFT received against previous bill' })
    await createVoucher({ voucher_type: 'contra', party_name: 'Cash → HDFC', amount: 10000, credit_ledger_id: cash.id, debit_ledger_id: hdfc.id, narration: 'Cash deposit into HDFC' })
  })
}
