import Dexie from 'dexie'
import { supabase } from './supabaseClient'

/**
 * Tally SaaS Accounting Database (Dexie + Supabase Hybrid)
 * Handles:
 * - Pure Material-wise Inventory
 * - Full Voucher Management (Sales, Purchase, Payment, Receipt, Contra, Journal)
 * - Tally Modification Engine (Editable vouchers with balance recomputation)
 * - Permanent UID generator and circulation for Debtors with closing dues
 * - Chart of Accounts (Cash, Bank, Loans, Debtors, Creditors, Expenses, Incomes)
 */

export const accDb = new Dexie('TallySaasAccounting')

accDb.version(1).stores({
  vouchers: '++id, voucher_no, voucher_type, date, party_id, party_name, party_uid, amount, due_amount, createdAt',
  materials: '++id, sku, name, category, unit, current_qty, purchase_rate, sales_rate, reorder_threshold',
  parties: '++id, name, type, uid, phone, current_balance',
  ledgers: '++id, name, group, current_balance',
  settings: 'key, value',
})

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

      let material = null
      if (item.material_id) {
        material = await accDb.materials.get(item.material_id)
      } else if (item.name) {
        material = await accDb.materials.where('name').equalsIgnoreCase(item.name).first()
      } else if (item.sku) {
        material = await accDb.materials.where('sku').equalsIgnoreCase(item.sku).first()
      }

      if (material) {
        let delta = 0
        if (voucher.voucher_type === 'sales') {
          delta = -itemQty * multiplier // Sales reduces inventory
        } else if (voucher.voucher_type === 'purchase') {
          delta = itemQty * multiplier // Purchase increases inventory
        }

        const newQty = Math.max(0, (Number(material.current_qty) || 0) + delta)
        await accDb.materials.update(material.id, { current_qty: newQty })

        // Also sync to Supabase if connected
        try {
          await supabase.from('materials').update({ current_qty: newQty }).eq('sku', material.sku)
        } catch {
          // offline safe
        }
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

/**
 * Save New Voucher (Sales, Purchase, Payment, Receipt, Contra, Journal)
 */
export async function createVoucher(voucherData) {
  const data = { ...voucherData }
  data.date = data.date || new Date().toISOString().slice(0, 10)
  data.createdAt = new Date().toISOString()
  data.updatedAt = new Date().toISOString()

  // Generate Voucher Number if not provided
  if (!data.voucher_no) {
    const prefix = (data.voucher_type || 'VCH').slice(0, 3).toUpperCase()
    data.voucher_no = `${prefix}-${Date.now().toString().slice(-6)}`
  }

  // Handle Debtor UID logic on Sales
  if (data.voucher_type === 'sales') {
    const { party, uid } = await resolvePartyUidOnSale(
      data.party_name,
      data.due_amount,
      data.party_phone
    )
    if (party) {
      data.party_id = party.id
    }
    if (uid) {
      data.party_uid = uid
    }
  }

  // Insert into Dexie
  const id = await accDb.vouchers.add(data)
  data.id = id

  // Apply financial & inventory effects
  await applyVoucherEffects(data, false)

  // Asynchronously sync to Supabase cloud if connected
  syncVoucherToSupabase(data).catch(() => {})

  return data
}

/**
 * Modify Voucher (Tally Methodology: Everything is customizable / editable)
 */
export async function updateVoucher(id, updatedData) {
  const existingVoucher = await accDb.vouchers.get(Number(id))
  if (!existingVoucher) {
    throw new Error('Voucher not found for modification')
  }

  // 1. Revert previous effects
  await applyVoucherEffects(existingVoucher, true)

  // 2. Merge changes
  const newVoucher = {
    ...existingVoucher,
    ...updatedData,
    updatedAt: new Date().toISOString(),
  }

  // If sales, check UID logic
  if (newVoucher.voucher_type === 'sales') {
    const { party, uid } = await resolvePartyUidOnSale(
      newVoucher.party_name,
      newVoucher.due_amount,
      newVoucher.party_phone
    )
    if (party) newVoucher.party_id = party.id
    if (uid) newVoucher.party_uid = uid
  }

  // 3. Update in Dexie
  await accDb.vouchers.put(newVoucher)

  // 4. Apply new effects
  await applyVoucherEffects(newVoucher, false)

  // Asynchronously sync to Supabase
  syncVoucherToSupabase(newVoucher).catch(() => {})

  return newVoucher
}

/**
 * Delete Voucher (Tally Cancellation / Undo)
 */
export async function deleteVoucher(id) {
  const existingVoucher = await accDb.vouchers.get(Number(id))
  if (!existingVoucher) return false

  // Revert all effects
  await applyVoucherEffects(existingVoucher, true)

  // Remove from database
  await accDb.vouchers.delete(Number(id))

  // Asynchronously delete from Supabase
  if (existingVoucher.voucher_no) {
    syncDeleteVoucherFromSupabase(existingVoucher.voucher_no).catch(() => {})
  }

  return true
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
  const todayStr = new Date().toISOString().slice(0, 10)
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)

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
 * Cloud Synchronization Helpers with Supabase (Offline-first resilient)
 */
export async function syncVoucherToSupabase(voucher) {
  try {
    const payload = {
      voucher_no: voucher.voucher_no,
      voucher_type: voucher.voucher_type,
      date: voucher.date,
      party_name: voucher.party_name,
      party_uid: voucher.party_uid || null,
      amount: Number(voucher.amount) || 0,
      paid_amount: Number(voucher.paid_amount) || 0,
      due_amount: Number(voucher.due_amount) || 0,
      payment_mode: voucher.payment_mode || 'Cash',
      narration: voucher.narration || '',
      reference_no: voucher.reference_no || '',
      items: voucher.items || [],
      updated_at: new Date().toISOString(),
    }

    await supabase.from('vouchers').upsert(payload, { onConflict: 'voucher_no' })
  } catch (err) {
    // Graceful offline fallback
    console.debug('Cloud sync deferred (offline):', err.message)
  }
}

export async function syncDeleteVoucherFromSupabase(voucherNo) {
  try {
    await supabase.from('vouchers').delete().eq('voucher_no', voucherNo)
  } catch (err) {
    console.debug('Cloud sync deferred (offline):', err.message)
  }
}

