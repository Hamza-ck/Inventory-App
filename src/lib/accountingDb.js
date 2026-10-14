import Dexie from 'dexie'
import { supabase } from './supabaseClient'
import { getLocalDateString } from './jsQuery'

/**
 * Tally SaaS Accounting Database (Dexie + Supabase Hybrid)
 * Handles:
 * - Pure Material-wise Inventory
 * - Full Voucher Management (Sales, Purchase, Payment, Receipt, Contra, Journal)
 * - Tally Modification Engine (Editable vouchers with balance recomputation)
 * - Permanent UID generator and circulation for Debtors with closing dues
 * - Chart of Accounts (Cash, Bank, Loans, Debtors, Creditors, Expenses, Incomes)
 */

const TRACKED_TABLES = {
  vouchers: { keyOf: (row) => row?.voucher_no, remoteTable: 'vouchers' },
  materials: { keyOf: (row) => row?.sku, remoteTable: 'materials' },
  parties: { keyOf: (row) => row?.name ? JSON.stringify([row.type || '', row.name]) : null, remoteTable: 'parties' },
  ledgers: { keyOf: (row) => row?.name, remoteTable: 'ledgers' },
}
const MUTATING_METHODS = new Set(['add', 'put', 'update', 'delete', 'bulkAdd', 'bulkPut', 'bulkDelete', 'clear'])
const DB_SCHEMA_V1 = {
  vouchers: '++id, voucher_no, voucher_type, date, party_id, party_name, party_uid, amount, due_amount, createdAt',
  materials: '++id, sku, name, category, unit, current_qty, purchase_rate, sales_rate, reorder_threshold',
  parties: '++id, name, type, uid, phone, current_balance',
  ledgers: '++id, name, group, current_balance',
  settings: 'key, value',
}
const DB_SCHEMA_V2 = {
  ...DB_SCHEMA_V1,
  syncQueue: '++id, entity, operation, entity_key, company_id, status, created_at, next_attempt_at',
}

let activeScope = 'anonymous'
const databaseCache = new Map()
const tableProxyCache = new WeakMap()
let syncInFlight = null
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function getDatabaseForScope(scope = activeScope) {
  const normalizedScope = String(scope || 'anonymous')
  if (databaseCache.has(normalizedScope)) return databaseCache.get(normalizedScope)

  // Never reuse the old unscoped database for signed-in tenants. Existing legacy
  // data is preserved in TallySaasAccounting and requires an explicit migration.
  const safeScope = normalizedScope.replace(/[^a-zA-Z0-9_-]/g, '_')
  const db = new Dexie('TallySaasAccounting_' + safeScope)
  db.version(1).stores(DB_SCHEMA_V1)
  db.version(2).stores(DB_SCHEMA_V2)
  databaseCache.set(normalizedScope, db)
  return db
}

function getCurrentDatabase() {
  const tx = Dexie.currentTransaction
  if (tx?.db && [...databaseCache.values()].includes(tx.db)) return tx.db
  return getDatabaseForScope(activeScope)
}

export function setAccountingScope(scope) {
  activeScope = String(scope || 'anonymous')
  return getDatabaseForScope(activeScope)
}

export function getActiveCompanyId() {
  return UUID_RE.test(activeScope) ? activeScope : null
}

function notifySyncChanged() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event('accounting-sync-updated'))
  setTimeout(() => { syncOutbox().catch((err) => console.warn('Sync retry deferred:', err)) }, 0)
}

async function addOutboxJob(db, entity, operation, entityKey) {
  const companyId = getActiveCompanyId()
  if (!companyId || !entityKey || !db.syncQueue) return
  await db.syncQueue.add({
    entity,
    operation,
    entity_key: String(entityKey),
    company_id: companyId,
    status: 'pending',
    attempts: 0,
    last_error: '',
    created_at: new Date().toISOString(),
    next_attempt_at: new Date(0).toISOString(),
  })
}

function parsePartyKey(key) {
  try {
    const parsed = JSON.parse(key)
    if (Array.isArray(parsed) && parsed.length === 2) return { type: parsed[0], name: parsed[1] }
  } catch { /* Older queue entries can use a plain name. */ }
  return { type: '', name: String(key || '') }
}

function makeTrackedTable(db, tableName) {
  const table = db.table(tableName)
  if (tableProxyCache.has(table)) return tableProxyCache.get(table)

  const proxy = new Proxy(table, {
    get(target, property) {
      const value = Reflect.get(target, property, target)
      if (typeof value !== 'function') return value
      if (!MUTATING_METHODS.has(property) || !TRACKED_TABLES[tableName]) return value.bind(target)

      return (...args) => {
        const run = async () => {
          let oldRows = []
          if (property === 'update' || property === 'delete') {
            const old = await target.get(args[0])
            if (old) oldRows = [old]
          } else if (property === 'bulkDelete') {
            oldRows = (await Promise.all((args[0] || []).map((key) => target.get(key)))).filter(Boolean)
          } else if (property === 'clear') {
            oldRows = await target.toArray()
          }

          const result = await value.apply(target, args)
          const meta = TRACKED_TABLES[tableName]

          if (property === 'delete' || property === 'bulkDelete' || property === 'clear') {
            for (const oldRow of oldRows) {
              const oldKey = meta.keyOf(oldRow)
              if (oldKey) await addOutboxJob(db, tableName, 'delete', oldKey)
            }
          } else if (property === 'update') {
            const newRow = await target.get(args[0])
            const oldKey = oldRows.length ? meta.keyOf(oldRows[0]) : null
            const newKey = meta.keyOf(newRow)
            if (oldKey && newKey && String(oldKey) !== String(newKey)) {
              await addOutboxJob(db, tableName, 'delete', oldKey)
            }
            if (newKey) await addOutboxJob(db, tableName, 'upsert', newKey)
          } else {
            const inputRows = Array.isArray(args[0]) ? args[0] : [args[0]]
            for (const inputRow of inputRows) {
              if (!inputRow) continue
              let row = inputRow
              if (property === 'add' || property === 'put') {
                const key = property === 'add' ? result : (result ?? inputRow.id)
                if (key !== undefined && key !== null) row = (await target.get(key)) || inputRow
              }
              const key = meta.keyOf(row)
              if (key) await addOutboxJob(db, tableName, 'upsert', key)
            }
          }

          if (UUID_RE.test(activeScope)) notifySyncChanged()
          return result
        }

        const currentTx = Dexie.currentTransaction
        if (currentTx?.db === db) return run()
        return db.transaction('rw', ...db.tables, run)
      }
    },
  })

  tableProxyCache.set(table, proxy)
  return proxy
}

export const accDb = new Proxy({}, {
  get(_target, property) {
    const db = getCurrentDatabase()
    if (typeof property === 'string' && TRACKED_TABLES[property]) return makeTrackedTable(db, property)
    const value = Reflect.get(db, property, db)
    return typeof value === 'function' ? value.bind(db) : value
  },
})

export async function getSyncQueueSummary() {
  const companyId = getActiveCompanyId()
  if (!companyId) return { pending: 0, withErrors: 0 }
  const db = getDatabaseForScope(companyId)
  const jobs = await db.syncQueue.toArray()
  const scopedJobs = jobs.filter((job) => job.company_id === companyId)
  return {
    pending: scopedJobs.length,
    withErrors: scopedJobs.filter((job) => Number(job.attempts) > 0 || Boolean(job.last_error)).length,
  }
}

// Generate Next Debtor Permanent UID: UID-CUST-1001, UID-CUST-1002, etc.
export async function generateNextDebtorUid() {
  const existingParties = await accDb.parties.toArray()
  const uidNums = existingParties
    .map((p) => {
      if (!p.uid) return 0
      const match = p.uid.match(/UID-CUST-(\d+)/)
      return match ? parseInt(match[1], 10) : 0
    })
    .filter((n) => !isNaN(n))

  const maxNum = uidNums.length > 0 ? Math.max(...uidNums) : 1000
  const nextNum = Math.max(maxNum + 1, 1001)
  return `UID-CUST-${nextNum}`
}

/**
 * Resolve or Assign Customer Permanent UID:
 * Internal logic requirement:
 * i) Every new invoice if have an closing due balance gets UID else just add into sales.
 * ii) UID connect with that name holder permanently and circulated future transactions through UID
 */
export async function resolvePartyUidOnSale(partyName, dueAmount, phone = '') {
  if (!partyName || !partyName.trim()) {
    return { party: null, uid: null }
  }

  const cleanName = partyName.trim()
  const isCash = cleanName.toLowerCase() === 'cash' || cleanName.toLowerCase() === 'counter cash'

  // Look for existing party with this name
  const allParties = await accDb.parties.toArray()
  let party = allParties.find(
    (p) => p.name.trim().toLowerCase() === cleanName.toLowerCase() && p.type === 'debtor'
  )

  const hasDue = Number(dueAmount) > 0

  if (party) {
    // If party exists and already has a UID, retain and circulate it permanently
    if (party.uid) {
      return { party, uid: party.uid }
    }

    // Party exists but had no UID previously:
    // If this invoice has closing due balance, assign permanent UID now!
    if (hasDue) {
      const newUid = await generateNextDebtorUid()
      await accDb.parties.update(party.id, { uid: newUid })
      party.uid = newUid
      return { party, uid: newUid }
    }

    // No due balance and no previous UID -> just return without UID
    return { party, uid: null }
  }

  // Party does NOT exist yet:
  if (isCash && !hasDue) {
    // Pure cash customer with 0 due balance -> no UID, just sales
    return { party: null, uid: null }
  }

  // Create new customer party
  let assignedUid = null
  if (hasDue) {
    // Has closing due balance -> gets UID permanently
    assignedUid = await generateNextDebtorUid()
  }

  const newPartyId = await accDb.parties.add({
    name: cleanName,
    type: 'debtor',
    uid: assignedUid,
    phone: phone || '',
    email: '',
    address: '',
    opening_balance: 0,
    current_balance: Number(dueAmount) || 0,
    created_at: new Date().toISOString(),
  })

  const createdParty = await accDb.parties.get(newPartyId)
  return { party: createdParty, uid: assignedUid }
}

/**
 * Apply Voucher Balance and Inventory Effects
 */
async function applyVoucherEffects(voucher, isReversal = false) {
  const multiplier = isReversal ? -1 : 1
  const amount = Number(voucher.amount) || 0
  const paidAmount = Number(voucher.paid_amount) || 0
  const dueAmount = Number(voucher.due_amount) || 0

  // 1. Inventory Movements (Sales decreases stock, Purchase increases stock)
  if (Array.isArray(voucher.items) && voucher.items.length > 0) {
    for (const item of voucher.items) {
      const itemQty = Number(item.qty) || 0
      if (!itemQty) continue

      // Resolve by stable identifier first. Display names may differ across supplier
      // invoices/imports, so a name miss must not prevent a valid SKU match.
      let material = item.material_id
        ? await accDb.materials.get(Number(item.material_id))
        : null

      if (!material && item.sku) {
        material = await accDb.materials.where('sku').equalsIgnoreCase(String(item.sku).trim()).first()
      }

      if (!material && item.name) {
        material = await accDb.materials.where('name').equalsIgnoreCase(String(item.name).trim()).first()
      }

      if (material) {
        let delta = 0
        if (voucher.voucher_type === 'sales') {
          delta = -itemQty * multiplier // Sales reduces inventory
        } else if (voucher.voucher_type === 'purchase') {
          delta = itemQty * multiplier // Purchase increases inventory
        }

        // Preserve the exact movement arithmetic. Clamping at zero makes later
        // voucher edits/deletions restore the wrong stock when a sale oversells.
        const newQty = (Number(material.current_qty) || 0) + delta
        await accDb.materials.update(material.id, { current_qty: newQty })

        // The tracked-table proxy writes a retryable outbox item in this transaction.
      }
    }
  }

  // 2. Party Balance Updates
  if (voucher.party_id || voucher.party_uid || voucher.party_name) {
    let party = null
    if (voucher.party_id) {
      party = await accDb.parties.get(voucher.party_id)
    } else if (voucher.party_uid) {
      party = await accDb.parties.where('uid').equals(voucher.party_uid).first()
    } else if (voucher.party_name) {
      party = await accDb.parties.where('name').equalsIgnoreCase(voucher.party_name).first()
    }

    if (party) {
      let balanceDelta = 0
      if (voucher.voucher_type === 'sales') {
        // Due amount increases customer's balance owed
        balanceDelta = dueAmount * multiplier
      } else if (voucher.voucher_type === 'purchase') {
        // Due amount increases amount owed to creditor
        balanceDelta = dueAmount * multiplier
      } else if (voucher.voucher_type === 'receipt') {
        // Receipt reduces customer's outstanding balance
        balanceDelta = -amount * multiplier
      } else if (voucher.voucher_type === 'payment') {
        // Payment reduces creditor or loan balance
        balanceDelta = -amount * multiplier
      }

      const newBal = (Number(party.current_balance) || 0) + balanceDelta
      await accDb.parties.update(party.id, { current_balance: newBal })
    }
  }

  // 3. Cash & Bank Ledger Updates
  if (voucher.debit_ledger_id || voucher.credit_ledger_id || voucher.payment_mode) {
    // If sales paid upfront via cash/bank
    if (voucher.voucher_type === 'sales' && paidAmount > 0) {
      const mode = (voucher.payment_mode || 'Cash').toLowerCase()
      const targetGroup = mode.includes('bank') || mode.includes('hdfc') || mode.includes('sbi')
        ? 'Bank Accounts'
        : 'Cash-in-hand'
      const ledger = await accDb.ledgers.where('group').equals(targetGroup).first()
      if (ledger) {
        const newBal = (Number(ledger.current_balance) || 0) + paidAmount * multiplier
        await accDb.ledgers.update(ledger.id, { current_balance: newBal })
      }
    }

    // Purchase paid via cash/bank
    if (voucher.voucher_type === 'purchase' && paidAmount > 0) {
      const mode = (voucher.payment_mode || 'Cash').toLowerCase()
      const targetGroup = mode.includes('bank') ? 'Bank Accounts' : 'Cash-in-hand'
      const ledger = await accDb.ledgers.where('group').equals(targetGroup).first()
      if (ledger) {
        const newBal = (Number(ledger.current_balance) || 0) - paidAmount * multiplier
        await accDb.ledgers.update(ledger.id, { current_balance: newBal })
      }
    }

    // Receipt (Money came in)
    if (voucher.voucher_type === 'receipt') {
      const targetLedgerId = voucher.debit_ledger_id
      const ledger = targetLedgerId ? await accDb.ledgers.get(targetLedgerId) : await accDb.ledgers.where('group').equals('Bank Accounts').first()
      if (ledger) {
        const newBal = (Number(ledger.current_balance) || 0) + amount * multiplier
        await accDb.ledgers.update(ledger.id, { current_balance: newBal })
      }
    }

    // Payment (Money went out)
    if (voucher.voucher_type === 'payment') {
      const sourceLedgerId = voucher.credit_ledger_id
      const ledger = sourceLedgerId ? await accDb.ledgers.get(sourceLedgerId) : await accDb.ledgers.where('group').equals('Cash-in-hand').first()
      if (ledger) {
        const newBal = (Number(ledger.current_balance) || 0) - amount * multiplier
        await accDb.ledgers.update(ledger.id, { current_balance: newBal })
      }
    }

    // Contra (Transfer between Cash and Bank)
    if (voucher.voucher_type === 'contra') {
      const debitLedger = voucher.debit_ledger_id ? await accDb.ledgers.get(voucher.debit_ledger_id) : null
      const creditLedger = voucher.credit_ledger_id ? await accDb.ledgers.get(voucher.credit_ledger_id) : null

      if (debitLedger) {
        // Destination ledger increases
        const newBal = (Number(debitLedger.current_balance) || 0) + amount * multiplier
        await accDb.ledgers.update(debitLedger.id, { current_balance: newBal })
      }
      if (creditLedger) {
        // Source ledger decreases
        const newBal = (Number(creditLedger.current_balance) || 0) - amount * multiplier
        await accDb.ledgers.update(creditLedger.id, { current_balance: newBal })
      }
    }
  }
}

function validateVoucherData(voucher) {
  const amountFields = ['amount', 'paid_amount', 'due_amount']
  for (const field of amountFields) {
    if (voucher[field] === undefined || voucher[field] === null || voucher[field] === '') continue
    const value = Number(voucher[field])
    if (!Number.isFinite(value) || value < 0) {
      throw new Error(`${field.replaceAll('_', ' ')} must be a valid non-negative amount.`)
    }
  }

  if (Array.isArray(voucher.items)) {
    for (const [index, item] of voucher.items.entries()) {
      const qty = Number(item.qty)
      const rate = Number(item.rate)
      if (!Number.isFinite(qty) || qty <= 0) {
        throw new Error(`Item ${index + 1}: quantity must be greater than zero.`)
      }
      if (!Number.isFinite(rate) || rate < 0) {
        throw new Error(`Item ${index + 1}: rate must be a valid non-negative amount.`)
      }
    }
  }
}

/**
 * Save New Voucher (Sales, Purchase, Payment, Receipt, Contra, Journal)
 */
export async function createVoucher(voucherData) {
  const db = getCurrentDatabase()
  const data = { ...voucherData }
  data.date = data.date || getLocalDateString()
  data.createdAt = new Date().toISOString()
  data.updatedAt = new Date().toISOString()

  if (!data.voucher_no) {
    const prefix = (data.voucher_type || 'VCH').slice(0, 3).toUpperCase()
    data.voucher_no = `${prefix}-${Date.now().toString().slice(-6)}`
  }

  validateVoucherData(data)

  const created = await db.transaction('rw', ...db.tables, async () => {
    const duplicate = await db.vouchers.where('voucher_no').equals(data.voucher_no).first()
    if (duplicate) throw new Error(`Voucher number "${data.voucher_no}" already exists.`)

    if (data.voucher_type === 'sales') {
      const { party, uid } = await resolvePartyUidOnSale(data.party_name, data.due_amount, data.party_phone)
      if (party) data.party_id = party.id
      if (uid) data.party_uid = uid
    }

    const id = await accDb.vouchers.add(data)
    data.id = id
    await applyVoucherEffects(data, false)
    return data
  })

  notifySyncChanged()
  return created
}

/**
 * Modify Voucher (Tally Methodology: Everything is customizable / editable)
 */
export async function updateVoucher(id, updatedData) {
  const db = getCurrentDatabase()
  const updated = await db.transaction('rw', ...db.tables, async () => {
    const existingVoucher = await db.vouchers.get(Number(id))
    if (!existingVoucher) throw new Error('Voucher not found for modification')

    const newVoucher = {
      ...existingVoucher,
      ...updatedData,
      updatedAt: new Date().toISOString(),
    }
    validateVoucherData(newVoucher)

    const duplicate = await db.vouchers.where('voucher_no').equals(newVoucher.voucher_no).first()
    if (duplicate && Number(duplicate.id) !== Number(id)) {
      throw new Error(`Voucher number "${newVoucher.voucher_no}" already exists.`)
    }

    // Validate before reversing anything; the transaction will roll back all
    // local ledger/party/stock/outbox mutations if any later step fails.
    await applyVoucherEffects(existingVoucher, true)

    if (newVoucher.voucher_type === 'sales') {
      const { party, uid } = await resolvePartyUidOnSale(
        newVoucher.party_name,
        newVoucher.due_amount,
        newVoucher.party_phone
      )
      if (party) newVoucher.party_id = party.id
      if (uid) newVoucher.party_uid = uid
    }

    await accDb.vouchers.put(newVoucher)
    await applyVoucherEffects(newVoucher, false)
    return newVoucher
  })

  notifySyncChanged()
  return updated
}

/**
 * Delete Voucher (Tally Cancellation / Undo)
 */
export async function deleteVoucher(id) {
  const db = getCurrentDatabase()
  const deleted = await db.transaction('rw', ...db.tables, async () => {
    const existingVoucher = await db.vouchers.get(Number(id))
    if (!existingVoucher) return false

    await applyVoucherEffects(existingVoucher, true)
    await db.vouchers.delete(Number(id))
    return true
  })

  if (deleted) notifySyncChanged()
  return deleted
}

/**
 * Initialize Default Accounting Master Data (Tally Standard Chart of Accounts)
 */
export async function initDefaultAccountingData() {
  const ledgersCount = await accDb.ledgers.count()
  if (ledgersCount > 0) return // already initialized

  // 1. Chart of Accounts Ledgers
  const defaultLedgers = [
    { name: 'Cash in Hand', group: 'Cash-in-hand', opening_balance: 45000, current_balance: 45000, is_system: true },
    { name: 'HDFC Current Account 0422', group: 'Bank Accounts', opening_balance: 285000, current_balance: 285000, is_system: true },
    { name: 'State Bank of India (SBI)', group: 'Bank Accounts', opening_balance: 140000, current_balance: 140000, is_system: true },
    { name: 'HDFC Business Term Loan', group: 'Loans (Liability)', opening_balance: 200000, current_balance: 200000, is_system: false },
    { name: 'Staff Emergency Advances', group: 'Loans & Advances (Asset)', opening_balance: 15000, current_balance: 15000, is_system: false },
    { name: 'Sales Account', group: 'Sales Accounts', opening_balance: 0, current_balance: 0, is_system: true },
    { name: 'Purchase Account', group: 'Purchase Accounts', opening_balance: 0, current_balance: 0, is_system: true },
    { name: 'Shop Rent Expense', group: 'Indirect Expenses', opening_balance: 0, current_balance: 0, is_system: false },
    { name: 'Staff Salaries', group: 'Indirect Expenses', opening_balance: 0, current_balance: 0, is_system: false },
    { name: 'Electricity & Utilities', group: 'Indirect Expenses', opening_balance: 0, current_balance: 0, is_system: false },
    { name: 'Freight & Transportation', group: 'Direct Expenses', opening_balance: 0, current_balance: 0, is_system: false },
  ]
  await accDb.ledgers.bulkAdd(defaultLedgers)

  // 2. Pure Material-Wise Stock Items (No Model Logic!)
  const defaultMaterials = [
    {
      sku: 'MAT-CANVAS-01',
      name: 'Industrial Cotton Canvas 350 GSM',
      category: 'Fabrics & Textiles',
      unit: 'meter',
      purchase_rate: 140,
      sales_rate: 195,
      current_qty: 450,
      reorder_threshold: 50,
    },
    {
      sku: 'MAT-DENIM-02',
      name: 'Heavy Weight Denim Twill 14oz',
      category: 'Fabrics & Textiles',
      unit: 'meter',
      purchase_rate: 180,
      sales_rate: 260,
      current_qty: 280,
      reorder_threshold: 40,
    },
    {
      sku: 'MAT-BOLT-03',
      name: 'High Tensile Steel Bolts M12',
      category: 'Hardware & Fasteners',
      unit: 'box',
      purchase_rate: 380,
      sales_rate: 520,
      current_qty: 65,
      reorder_threshold: 15,
    },
    {
      sku: 'MAT-ZIP-04',
      name: 'YKK Brass Heavy Zipper 5# (24 inch)',
      category: 'Accessories & Trims',
      unit: 'pcs',
      purchase_rate: 18,
      sales_rate: 32,
      current_qty: 850,
      reorder_threshold: 100,
    },
    {
      sku: 'MAT-THRD-05',
      name: 'Polyester Bonded Thread 40/2',
      category: 'Accessories & Trims',
      unit: 'spool',
      purchase_rate: 65,
      sales_rate: 110,
      current_qty: 140,
      reorder_threshold: 25,
    },
  ]
  await accDb.materials.bulkAdd(defaultMaterials)

  // 3. Parties (Debtors with permanent UIDs & Creditors)
  const defaultParties = [
    {
      name: 'Apex Infotech Pvt Ltd',
      type: 'debtor',
      uid: 'UID-CUST-1001',
      phone: '+91 98450 11223',
      email: 'accounts@apexinfotech.in',
      address: 'Plot 44, Electronic City, Bangalore',
      opening_balance: 24500,
      current_balance: 24500,
    },
    {
      name: 'Golden Star Garments',
      type: 'debtor',
      uid: 'UID-CUST-1002',
      phone: '+91 98211 44556',
      email: 'purchase@goldenstargarments.com',
      address: 'Industrial Area Phase 2, Ludhiana',
      opening_balance: 18200,
      current_balance: 18200,
    },
    {
      name: 'Metro Steel & Hardware',
      type: 'creditor',
      uid: null,
      phone: '+91 98210 99887',
      email: 'sales@metrosteel.com',
      address: 'Loha Mandi, Delhi',
      opening_balance: 45000,
      current_balance: 45000,
    },
    {
      name: 'Supreme Fabrics Mill',
      type: 'creditor',
      uid: null,
      phone: '+91 98765 43210',
      email: 'mill@supremefabrics.com',
      address: 'Ring Road Textile Market, Surat',
      opening_balance: 62000,
      current_balance: 62000,
    },
  ]
  await accDb.parties.bulkAdd(defaultParties)

  // 4. Sample Recent Vouchers (Today's & Yesterday's sales, purchases, contrawork)
  const todayStr = getLocalDateString()
  const yesterday = getLocalDateString(new Date(Date.now() - 86400000))

  const sampleVouchers = [
    {
      voucher_no: 'INV-2026-001',
      voucher_type: 'sales',
      date: todayStr,
      party_name: 'Apex Infotech Pvt Ltd',
      party_uid: 'UID-CUST-1001',
      amount: 19500,
      paid_amount: 10000,
      due_amount: 9500,
      payment_mode: 'HDFC Bank',
      narration: 'Industrial cotton canvas supply for assembly line',
      items: [
        {
          sku: 'MAT-CANVAS-01',
          name: 'Industrial Cotton Canvas 350 GSM',
          unit: 'meter',
          qty: 100,
          rate: 195,
          cost_rate: 140,
          amount: 19500,
        },
      ],
      createdAt: new Date().toISOString(),
    },
    {
      voucher_no: 'INV-2026-002',
      voucher_type: 'sales',
      date: todayStr,
      party_name: 'Walk-in Retail Buyer',
      party_uid: null, // Full cash payment -> no closing due -> no UID needed
      amount: 4400,
      paid_amount: 4400,
      due_amount: 0,
      payment_mode: 'Cash',
      narration: 'Direct retail counter sale (full cash settlement)',
      items: [
        {
          sku: 'MAT-THRD-05',
          name: 'Polyester Bonded Thread 40/2',
          unit: 'spool',
          qty: 40,
          rate: 110,
          cost_rate: 65,
          amount: 4400,
        },
      ],
      createdAt: new Date().toISOString(),
    },
    {
      voucher_no: 'PUR-2026-041',
      voucher_type: 'purchase',
      date: yesterday,
      party_name: 'Supreme Fabrics Mill',
      amount: 28000,
      paid_amount: 15000,
      due_amount: 13000,
      payment_mode: 'HDFC Bank',
      narration: 'Restocking cotton canvas rolls',
      items: [
        {
          sku: 'MAT-CANVAS-01',
          name: 'Industrial Cotton Canvas 350 GSM',
          unit: 'meter',
          qty: 200,
          rate: 140,
          cost_rate: 140,
          amount: 28000,
        },
      ],
      createdAt: new Date(Date.now() - 86400000).toISOString(),
    },
    {
      voucher_no: 'REC-2026-012',
      voucher_type: 'receipt',
      date: todayStr,
      party_name: 'Golden Star Garments',
      party_uid: 'UID-CUST-1002',
      amount: 8000,
      payment_mode: 'Bank Accounts',
      narration: 'NEFT payment received against previous outstanding bill',
      createdAt: new Date().toISOString(),
    },
    {
      voucher_no: 'CNT-2026-004',
      voucher_type: 'contra',
      date: todayStr,
      party_name: 'Cash to Bank Deposit',
      amount: 10000,
      narration: 'Cash deposit into HDFC Current Account',
      createdAt: new Date().toISOString(),
    },
  ]

  for (const v of sampleVouchers) {
    await accDb.vouchers.add(v)
  }
}

/**
 * Durable, tenant-scoped cloud outbox. A job is deleted only after the cloud
 * confirms success; errors remain in IndexedDB with exponential-backoff retry.
 */
function getEntityRecord(db, entity, key) {
  if (entity === 'vouchers') return db.vouchers.where('voucher_no').equals(key).first()
  if (entity === 'materials') return db.materials.where('sku').equals(key).first()
  if (entity === 'ledgers') return db.ledgers.where('name').equals(key).first()
  if (entity === 'parties') {
    const identity = parsePartyKey(key)
    return db.parties.where('name').equalsIgnoreCase(identity.name)
      .and((party) => !identity.type || party.type === identity.type).first()
  }
  return null
}

async function pushOutboxJob(db, job, sessionUserId) {
  const companyId = job.company_id
  const entity = job.entity
  const identity = job.entity_key

  if (job.operation === 'delete') {
    let request = supabase.from(entity).delete().eq('company_id', companyId)
    if (entity === 'vouchers') request = request.eq('voucher_no', identity)
    else if (entity === 'materials') request = request.eq('sku', identity)
    else if (entity === 'ledgers') request = request.eq('name', identity)
    else if (entity === 'parties') {
      const party = parsePartyKey(identity)
      request = request.eq('name', party.name).eq('type', party.type)
    }
    const { error } = await request
    if (error) throw error
    return
  }

  const row = await getEntityRecord(db, entity, identity)
  if (!row) return

  let payload
  let onConflict
  if (entity === 'vouchers') {
    payload = {
      company_id: companyId,
      voucher_no: row.voucher_no,
      voucher_type: row.voucher_type,
      date: row.date,
      party_name: row.party_name || 'Cash',
      party_uid: row.party_uid || null,
      amount: Number(row.amount) || 0,
      paid_amount: Number(row.paid_amount) || 0,
      due_amount: Number(row.due_amount) || 0,
      payment_mode: row.payment_mode || 'Cash',
      narration: row.narration || '',
      reference_no: row.reference_no || '',
      items: row.items || [],
      created_by: sessionUserId,
      updated_at: new Date().toISOString(),
    }
    onConflict = 'company_id,voucher_no'
  } else if (entity === 'materials') {
    payload = {
      company_id: companyId,
      sku: row.sku,
      name: row.name,
      category: row.category || 'General',
      unit: row.unit || 'pcs',
      purchase_rate: Number(row.purchase_rate) || 0,
      sales_rate: Number(row.sales_rate) || 0,
      current_qty: Number(row.current_qty) || 0,
      reorder_threshold: Number(row.reorder_threshold) || 0,
      updated_at: new Date().toISOString(),
    }
    onConflict = 'company_id,sku'
  } else if (entity === 'parties') {
    payload = {
      company_id: companyId,
      name: row.name,
      type: row.type,
      uid: row.uid || null,
      phone: row.phone || '',
      email: row.email || '',
      address: row.address || '',
      opening_balance: Number(row.opening_balance) || 0,
      current_balance: Number(row.current_balance) || 0,
      updated_at: new Date().toISOString(),
    }
    onConflict = 'company_id,name,type'
  } else if (entity === 'ledgers') {
    payload = {
      company_id: companyId,
      name: row.name,
      group: row.group || 'General',
      opening_balance: Number(row.opening_balance) || 0,
      current_balance: Number(row.current_balance) || 0,
      is_system: Boolean(row.is_system),
    }
    onConflict = 'company_id,name'
  } else {
    throw new Error(`Unsupported sync entity: ${entity}`)
  }

  const { error } = await supabase.from(entity).upsert(payload, { onConflict })
  if (error) throw error
}

export async function syncOutbox({ force = false } = {}) {
  if (syncInFlight) return syncInFlight
  const companyId = getActiveCompanyId()
  if (!companyId || (typeof navigator !== 'undefined' && !navigator.onLine)) return getSyncQueueSummary()

  syncInFlight = (async () => {
    const db = getDatabaseForScope(companyId)
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
    if (sessionError || !sessionData?.session?.user) return getSyncQueueSummary()

    const jobs = (await db.syncQueue.where('company_id').equals(companyId).toArray())
      .filter((job) => job.status === 'pending' && (force || new Date(job.next_attempt_at || 0).getTime() <= Date.now()))
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
      .slice(0, 25)

    for (const job of jobs) {
      if (getActiveCompanyId() !== companyId) break
      try {
        await pushOutboxJob(db, job, sessionData.session.user.id)
        await db.syncQueue.delete(job.id)
      } catch (error) {
        const attempts = (Number(job.attempts) || 0) + 1
        const delayMs = Math.min(5 * 60 * 1000, 1000 * (2 ** Math.min(attempts, 8)))
        await db.syncQueue.update(job.id, {
          attempts,
          last_error: error?.message || 'Unknown cloud sync error',
          next_attempt_at: new Date(Date.now() + delayMs).toISOString(),
        })
        setTimeout(() => {
          if (getActiveCompanyId() === companyId) syncOutbox().catch(() => {})
        }, delayMs + 50)
      }
    }

    return getSyncQueueSummary()
  })().finally(() => {
    syncInFlight = null
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('accounting-sync-updated'))
  })

  return syncInFlight
}

/**
 * Pull the authoritative company snapshot after queued local writes have synced.
 * This is intentionally skipped whenever an outbox job remains: replacing local
 * tables while writes are pending could discard unsynced work.
 */
const hydrationInFlight = new Map()

export async function hydrateCompanyFromSupabase() {
  const companyId = getActiveCompanyId()
  if (!companyId) return { hydrated: false, reason: 'no-company' }
  if (hydrationInFlight.has(companyId)) return hydrationInFlight.get(companyId)

  const task = (async () => {
    const summary = await syncOutbox()
    if (summary.pending > 0) {
      return { hydrated: false, reason: 'pending-sync', ...summary }
    }
    if (getActiveCompanyId() !== companyId) {
      return { hydrated: false, reason: 'company-changed' }
    }

    const entities = ['vouchers', 'materials', 'parties', 'ledgers']
    const remoteRows = {}
    for (const entity of entities) {
      const { data, error } = await supabase
        .from(entity)
        .select('*')
        .eq('company_id', companyId)
        .is('deleted_at', null)
      if (error) throw new Error(`Could not load company ${entity}: ${error.message}`)
      remoteRows[entity] = data || []
    }

    // Recheck after network I/O: the user may have switched companies.
    if (getActiveCompanyId() !== companyId) {
      return { hydrated: false, reason: 'company-changed' }
    }

    const db = getDatabaseForScope(companyId)
    const keyOf = {
      vouchers: (row) => String(row.voucher_no || ''),
      materials: (row) => String(row.sku || ''),
      parties: (row) => JSON.stringify([row.type || '', row.name || '']),
      ledgers: (row) => String(row.name || ''),
    }
    const normalize = {
      vouchers: (row) => ({
        voucher_no: row.voucher_no,
        voucher_type: row.voucher_type,
        date: row.date,
        party_name: row.party_name || 'Cash',
        party_uid: row.party_uid || null,
        amount: Number(row.amount) || 0,
        paid_amount: Number(row.paid_amount) || 0,
        due_amount: Number(row.due_amount) || 0,
        payment_mode: row.payment_mode || 'Cash',
        narration: row.narration || '',
        reference_no: row.reference_no || '',
        items: Array.isArray(row.items) ? row.items : [],
        createdAt: row.created_at || new Date().toISOString(),
        updatedAt: row.updated_at || row.created_at || new Date().toISOString(),
      }),
      materials: (row) => ({
        sku: row.sku,
        name: row.name,
        category: row.category || 'General',
        unit: row.unit || 'pcs',
        purchase_rate: Number(row.purchase_rate) || 0,
        sales_rate: Number(row.sales_rate) || 0,
        current_qty: Number(row.current_qty) || 0,
        reorder_threshold: Number(row.reorder_threshold) || 0,
      }),
      parties: (row) => ({
        name: row.name,
        type: row.type,
        uid: row.uid || null,
        phone: row.phone || '',
        email: row.email || '',
        address: row.address || '',
        opening_balance: Number(row.opening_balance) || 0,
        current_balance: Number(row.current_balance) || 0,
        created_at: row.created_at || new Date().toISOString(),
        updated_at: row.updated_at || row.created_at || new Date().toISOString(),
      }),
      ledgers: (row) => ({
        name: row.name,
        group: row.group || 'General',
        opening_balance: Number(row.opening_balance) || 0,
        current_balance: Number(row.current_balance) || 0,
        is_system: Boolean(row.is_system),
      }),
    }

    await db.transaction('rw', ...entities.map((entity) => db.table(entity)), async () => {
      for (const entity of entities) {
        const table = db.table(entity)
        const existingRows = await table.toArray()
        const existingByKey = new Map(existingRows.map((row) => [keyOf[entity](row), row]))
        const incoming = remoteRows[entity].map((remote) => {
          const normalized = normalize[entity](remote)
          const previous = existingByKey.get(keyOf[entity](normalized))
          // Keep browser-local primary keys so current UI edit references remain valid.
          if (previous?.id !== undefined) normalized.id = previous.id
          if (entity === 'vouchers' && previous?.party_id !== undefined) normalized.party_id = previous.party_id
          return normalized
        })
        await table.clear()
        if (incoming.length) await table.bulkAdd(incoming)
      }
    })

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('accounting-data-updated'))
    }
    return { hydrated: true, companyId, counts: Object.fromEntries(entities.map((entity) => [entity, remoteRows[entity].length])) }
  })().catch((error) => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('accounting-sync-error', {
        detail: { message: error?.message || 'Company data refresh failed.' },
      }))
    }
    throw error
  }).finally(() => hydrationInFlight.delete(companyId))

  hydrationInFlight.set(companyId, task)
  return task
}

// Compatibility helpers: normal voucher mutations are queued automatically by the
// tracked-table proxy. These functions remain available to older call sites.
export async function syncVoucherToSupabase(voucher) {
  const companyId = getActiveCompanyId()
  if (!companyId || !voucher?.voucher_no) return
  await addOutboxJob(getCurrentDatabase(), 'vouchers', 'upsert', voucher.voucher_no)
  notifySyncChanged()
}

export async function syncDeleteVoucherFromSupabase(voucherNo) {
  const companyId = getActiveCompanyId()
  if (!companyId || !voucherNo) return
  await addOutboxJob(getCurrentDatabase(), 'vouchers', 'delete', voucherNo)
  notifySyncChanged()
}
