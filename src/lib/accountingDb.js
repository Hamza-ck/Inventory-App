import Dexie from 'dexie'

/**
 * Tally SaaS Accounting Database (Dexie IndexedDB Engine)
 * Handles:
 * - Pure Material-wise Inventory
 * - Full Voucher Management (Sales, Purchase, Payment, Receipt, Contra, Journal)
 * - Tally Modification Engine (Editable vouchers with balance recomputation)
 * - Permanent UID generator and circulation for Debtors with closing dues
 * - Chart of Accounts (Cash, Bank, Loans, Debtors, Creditors, Expenses, Incomes)
 * - App Settings & Owner Visibility Controls
 */

export const accDb = new Dexie('TallySaasAccounting')

accDb.version(2).stores({
  vouchers: '++id, voucher_no, voucher_type, date, party_id, party_name, party_uid, amount, due_amount, createdAt',
  materials: '++id, sku, name, category, unit, current_qty, purchase_rate, sales_rate, reorder_threshold',
  parties: '++id, name, type, uid, phone, current_balance, age_bucket, next_payment, due_days',
  ledgers: '++id, name, group, current_balance, category',
  settings: 'key, value',
  imports: '++id, filename, date, added_count, skipped_count, status, problems_count',
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
 * Every invoice with a closing due balance gets UID permanently circulated.
 */
export async function resolvePartyUidOnSale(partyName, dueAmount, phone = '') {
  if (!partyName || !partyName.trim()) {
    return { party: null, uid: null }
  }

  const cleanName = partyName.trim()
  const isCash = cleanName.toLowerCase() === 'cash' || cleanName.toLowerCase() === 'counter cash'

  const allParties = await accDb.parties.toArray()
  let party = allParties.find(
    (p) => p.name.trim().toLowerCase() === cleanName.toLowerCase() && p.type === 'debtor'
  )

  const hasDue = Number(dueAmount) > 0

  if (party) {
    if (party.uid) {
      return { party, uid: party.uid }
    }
    if (hasDue) {
      const newUid = await generateNextDebtorUid()
      await accDb.parties.update(party.id, { uid: newUid })
      party.uid = newUid
      return { party, uid: newUid }
    }
    return { party, uid: null }
  }

  if (isCash && !hasDue) {
    return { party: null, uid: null }
  }

  let assignedUid = null
  if (hasDue) {
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
    age_bucket: '0–30d',
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

  // 1. Inventory Movements
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
        let qtyChange = 0
        if (voucher.voucher_type === 'sales') {
          qtyChange = -itemQty * multiplier
        } else if (voucher.voucher_type === 'purchase') {
          qtyChange = itemQty * multiplier
        }

        const newQty = Math.max(0, (Number(material.current_qty) || 0) + qtyChange)
        await accDb.materials.update(material.id, { current_qty: newQty })
      }
    }
  }

  // 2. Party Balances
  if (voucher.party_name && voucher.party_name.trim().toLowerCase() !== 'cash') {
    let party = null
    if (voucher.party_id) {
      party = await accDb.parties.get(voucher.party_id)
    } else {
      party = await accDb.parties.where('name').equalsIgnoreCase(voucher.party_name.trim()).first()
    }

    if (party) {
      let balanceChange = 0
      if (party.type === 'debtor') {
        if (voucher.voucher_type === 'sales') {
          balanceChange = dueAmount * multiplier
        } else if (voucher.voucher_type === 'receipt') {
          balanceChange = -amount * multiplier
        }
      } else if (party.type === 'creditor') {
        if (voucher.voucher_type === 'purchase') {
          balanceChange = dueAmount * multiplier
        } else if (voucher.voucher_type === 'payment') {
          balanceChange = -amount * multiplier
        }
      }

      const newBalance = Math.max(0, (Number(party.current_balance) || 0) + balanceChange)
      await accDb.parties.update(party.id, { current_balance: newBalance })
    }
  }

  // 3. Cash & Bank Ledgers
  const paymentMode = voucher.payment_mode || 'Cash'
  const isBank = paymentMode.toLowerCase().includes('bank') || paymentMode.toLowerCase().includes('hdfc') || paymentMode.toLowerCase().includes('neft')
  const ledgerGroup = isBank ? 'Bank Accounts' : 'Cash-in-hand'

  let targetLedger = await accDb.ledgers.where('group').equals(ledgerGroup).first()
  if (targetLedger) {
    let cashChange = 0
    if (voucher.voucher_type === 'sales') {
      cashChange = paidAmount * multiplier
    } else if (voucher.voucher_type === 'purchase') {
      cashChange = -paidAmount * multiplier
    } else if (voucher.voucher_type === 'receipt') {
      cashChange = amount * multiplier
    } else if (voucher.voucher_type === 'payment') {
      cashChange = -amount * multiplier
    } else if (voucher.voucher_type === 'contra') {
      cashChange = 0
    }

    const newLedgerBalance = (Number(targetLedger.current_balance) || 0) + cashChange
    await accDb.ledgers.update(targetLedger.id, { current_balance: newLedgerBalance })
  }
}

/**
 * Save / Create New Voucher
 */
export async function createVoucher(voucherData) {
  return await accDb.transaction('rw', [accDb.vouchers, accDb.materials, accDb.parties, accDb.ledgers], async () => {
    let assignedUid = voucherData.party_uid || null
    if (voucherData.voucher_type === 'sales') {
      const { uid } = await resolvePartyUidOnSale(
        voucherData.party_name,
        voucherData.due_amount,
        voucherData.phone || ''
      )
      assignedUid = uid || assignedUid
    }

    const newVoucher = {
      ...voucherData,
      party_uid: assignedUid,
      amount: Number(voucherData.amount) || 0,
      paid_amount: Number(voucherData.paid_amount) || 0,
      due_amount: Number(voucherData.due_amount) || 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    const voucherId = await accDb.vouchers.add(newVoucher)
    newVoucher.id = voucherId

    await applyVoucherEffects(newVoucher, false)
    return newVoucher
  })
}

/**
 * Modify / Edit Voucher with Automatic Reversal & Reapplication
 */
export async function updateVoucher(voucherId, updatedData) {
  return await accDb.transaction('rw', [accDb.vouchers, accDb.materials, accDb.parties, accDb.ledgers], async () => {
    const existing = await accDb.vouchers.get(voucherId)
    if (!existing) {
      throw new Error(`Voucher with ID ${voucherId} does not exist`)
    }

    // Step 1: Reverse previous financial and inventory impacts
    await applyVoucherEffects(existing, true)

    // Step 2: Prepare new updated object
    let assignedUid = updatedData.party_uid || existing.party_uid || null
    if (updatedData.voucher_type === 'sales') {
      const { uid } = await resolvePartyUidOnSale(
        updatedData.party_name || existing.party_name,
        updatedData.due_amount,
        updatedData.phone || ''
      )
      assignedUid = uid || assignedUid
    }

    const merged = {
      ...existing,
      ...updatedData,
      party_uid: assignedUid,
      amount: Number(updatedData.amount) || 0,
      paid_amount: Number(updatedData.paid_amount) || 0,
      due_amount: Number(updatedData.due_amount) || 0,
      updatedAt: new Date().toISOString(),
    }

    // Step 3: Write updated record
    await accDb.vouchers.put(merged)

    // Step 4: Apply new impacts
    await applyVoucherEffects(merged, false)
    return merged
  })
}

/**
 * Delete Voucher with Reversal
 */
export async function deleteVoucher(voucherId) {
  return await accDb.transaction('rw', [accDb.vouchers, accDb.materials, accDb.parties, accDb.ledgers], async () => {
    const existing = await accDb.vouchers.get(voucherId)
    if (!existing) return
    await applyVoucherEffects(existing, true)
    await accDb.vouchers.delete(voucherId)
  })
}

/**
 * -------------------------------------------------------------
 * Creditors (Suppliers) Functions
 * -------------------------------------------------------------
 */
export async function createCreditor({
  name,
  phone = '',
  current_balance = 0,
  next_payment = 'Next month',
  due_days = 14,
  due_status = null,
}) {
  const balance = Number(current_balance) || 0
  const days = Number(due_days) || 14
  const status = due_status || (days <= 1 ? 'Due in 1d' : `Due in ${days}d`)
  const bucket = days <= 1 ? 'Due now' : days <= 15 ? 'Next 15d' : 'Later'

  const id = await accDb.parties.add({
    name: name.trim(),
    type: 'creditor',
    uid: null,
    phone: phone.trim(),
    next_payment,
    due_status: status,
    due_days: days,
    current_balance: balance,
    due_bucket: bucket,
    created_at: new Date().toISOString(),
  })
  window.dispatchEvent(new Event('accounting-data-updated'))
  return await accDb.parties.get(id)
}

export async function recordSupplierPayment({
  supplierId,
  supplierName,
  amount,
  paymentMode = 'Cash',
  date = null,
  narration = '',
}) {
  const payAmt = Number(amount) || 0
  if (payAmt <= 0) throw new Error('Payment amount must be greater than 0')

  return await accDb.transaction('rw', [accDb.parties, accDb.vouchers, accDb.ledgers], async () => {
    let supplier = null
    if (supplierId) {
      supplier = await accDb.parties.get(supplierId)
    } else if (supplierName) {
      supplier = await accDb.parties.where('name').equalsIgnoreCase(supplierName.trim()).first()
    }

    if (supplier) {
      const newBal = Math.max(0, (Number(supplier.current_balance) || 0) - payAmt)
      await accDb.parties.update(supplier.id, { current_balance: newBal })
    }

    const voucher = {
      voucher_no: `PAY-${Date.now().toString().slice(-4)}`,
      voucher_type: 'payment',
      date: date || new Date().toISOString().slice(0, 10),
      party_name: supplier?.name || supplierName || 'Supplier',
      party_id: supplier?.id || null,
      amount: payAmt,
      paid_amount: payAmt,
      due_amount: 0,
      payment_mode: paymentMode,
      status: 'Paid',
      narration: narration.trim() || `Payment to ${supplier?.name || supplierName || 'supplier'} via ${paymentMode}`,
      items: [],
      createdAt: new Date().toISOString(),
    }
    await accDb.vouchers.add(voucher)

    const isBank = paymentMode.toLowerCase().includes('bank') || paymentMode.toLowerCase().includes('hdfc') || paymentMode.toLowerCase().includes('upi')
    const groupName = isBank ? 'Bank Accounts' : 'Cash-in-hand'
    const ledger = await accDb.ledgers.where('group').equals(groupName).first()
    if (ledger) {
      const newLedgerBal = Math.max(0, (Number(ledger.current_balance) || 0) - payAmt)
      await accDb.ledgers.update(ledger.id, { current_balance: newLedgerBal })
    }

    window.dispatchEvent(new Event('accounting-data-updated'))
    return voucher
  })
}

/**
 * -------------------------------------------------------------
 * Debtors (Customers) Functions
 * -------------------------------------------------------------
 */
export async function createDebtor({
  name,
  phone = '',
  current_balance = 0,
  due_days = 15,
}) {
  const balance = Number(current_balance) || 0
  const days = Number(due_days) || 15
  const uid = await generateNextDebtorUid()
  const age_bucket = days > 60 ? '60d+' : days > 30 ? '31–60d' : '0–30d'

  const id = await accDb.parties.add({
    name: name.trim(),
    type: 'debtor',
    uid,
    phone: phone.trim(),
    last_invoice: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
    due_days: days,
    current_balance: balance,
    age_bucket,
    created_at: new Date().toISOString(),
  })
  window.dispatchEvent(new Event('accounting-data-updated'))
  return await accDb.parties.get(id)
}

export async function recordDebtorReceipt({
  debtorId,
  debtorName,
  amount,
  paymentMode = 'Cash',
  date = null,
  narration = '',
}) {
  const recAmt = Number(amount) || 0
  if (recAmt <= 0) throw new Error('Receipt collection amount must be greater than 0')

  return await accDb.transaction('rw', [accDb.parties, accDb.vouchers, accDb.ledgers], async () => {
    let debtor = null
    if (debtorId) {
      debtor = await accDb.parties.get(debtorId)
    } else if (debtorName) {
      debtor = await accDb.parties.where('name').equalsIgnoreCase(debtorName.trim()).first()
    }

    if (debtor) {
      const newBal = Math.max(0, (Number(debtor.current_balance) || 0) - recAmt)
      const newBucket = newBal <= 0 ? 'Settled' : debtor.age_bucket
      await accDb.parties.update(debtor.id, { current_balance: newBal, age_bucket: newBucket })
    }

    const voucher = {
      voucher_no: `REC-${Date.now().toString().slice(-4)}`,
      voucher_type: 'receipt',
      date: date || new Date().toISOString().slice(0, 10),
      party_name: debtor?.name || debtorName || 'Customer',
      party_uid: debtor?.uid || null,
      party_id: debtor?.id || null,
      amount: recAmt,
      paid_amount: recAmt,
      due_amount: 0,
      payment_mode: paymentMode,
      status: 'Paid',
      narration: narration.trim() || `Payment received from ${debtor?.name || debtorName} via ${paymentMode}`,
      items: [],
      createdAt: new Date().toISOString(),
    }
    await accDb.vouchers.add(voucher)

    const isBank = paymentMode.toLowerCase().includes('bank') || paymentMode.toLowerCase().includes('hdfc') || paymentMode.toLowerCase().includes('upi')
    const groupName = isBank ? 'Bank Accounts' : 'Cash-in-hand'
    const ledger = await accDb.ledgers.where('group').equals(groupName).first()
    if (ledger) {
      const newLedgerBal = (Number(ledger.current_balance) || 0) + recAmt
      await accDb.ledgers.update(ledger.id, { current_balance: newLedgerBal })
    }

    window.dispatchEvent(new Event('accounting-data-updated'))
    return voucher
  })
}

/**
 * -------------------------------------------------------------
 * Inventory Products Functions
 * -------------------------------------------------------------
 */
export async function createStockItem({
  name,
  sku = '',
  category = 'Cases & Covers',
  unit = 'pcs',
  purchase_rate = 0,
  sales_rate = 0,
  current_qty = 0,
  reorder_threshold = 10,
}) {
  const pRate = Number(purchase_rate) || 0
  const sRate = Number(sales_rate) || Math.round(pRate * 1.3)
  const qty = Number(current_qty) || 0
  const threshold = Number(reorder_threshold) || 10
  const autoSku = sku?.trim() || `SKU-${name.replace(/[^A-Za-z0-9]/g, '').slice(0, 6).toUpperCase()}-${Math.floor(100 + Math.random() * 900)}`

  const id = await accDb.materials.add({
    name: name.trim(),
    sku: autoSku,
    category: category || 'Cases & Accessories',
    unit: unit || 'pcs',
    purchase_rate: pRate,
    sales_rate: sRate,
    current_qty: qty,
    reorder_threshold: threshold,
    status: qty <= 0 ? 'Out of stock' : qty <= threshold ? 'Low' : 'Healthy',
    created_at: new Date().toISOString(),
  })
  window.dispatchEvent(new Event('accounting-data-updated'))
  return await accDb.materials.get(id)
}

export async function updateStockQty(id, newQty) {
  const item = await accDb.materials.get(id)
  if (!item) return
  const qty = Math.max(0, Number(newQty) || 0)
  const status = qty <= 0 ? 'Out of stock' : qty <= (item.reorder_threshold || 10) ? 'Low' : 'Healthy'
  await accDb.materials.update(id, { current_qty: qty, status })
  window.dispatchEvent(new Event('accounting-data-updated'))
}

/**
 * -------------------------------------------------------------
 * Expenses Functions
 * -------------------------------------------------------------
 */
export async function recordExpenseVoucher({
  category = 'Transport',
  amount = 0,
  paymentMode = 'Cash',
  date = null,
  narration = '',
}) {
  const expAmt = Number(amount) || 0
  if (expAmt <= 0) throw new Error('Expense amount must be greater than 0')

  return await accDb.transaction('rw', [accDb.vouchers, accDb.ledgers], async () => {
    const voucher = {
      voucher_no: `EXP-${Date.now().toString().slice(-4)}`,
      voucher_type: 'payment',
      date: date || new Date().toISOString().slice(0, 10),
      party_name: category || 'General Expense',
      amount: expAmt,
      paid_amount: expAmt,
      due_amount: 0,
      payment_mode: paymentMode,
      status: 'Paid',
      narration: narration.trim() || `Expense under ${category} paid via ${paymentMode}`,
      items: [],
      createdAt: new Date().toISOString(),
    }
    await accDb.vouchers.add(voucher)

    const isBank = paymentMode.toLowerCase().includes('bank') || paymentMode.toLowerCase().includes('hdfc') || paymentMode.toLowerCase().includes('upi')
    const groupName = isBank ? 'Bank Accounts' : 'Cash-in-hand'
    const ledger = await accDb.ledgers.where('group').equals(groupName).first()
    if (ledger) {
      const newLedgerBal = Math.max(0, (Number(ledger.current_balance) || 0) - expAmt)
      await accDb.ledgers.update(ledger.id, { current_balance: newLedgerBal })
    }

    let expLedger = await accDb.ledgers.where('name').equalsIgnoreCase(category).first()
    if (expLedger) {
      await accDb.ledgers.update(expLedger.id, { current_balance: (Number(expLedger.current_balance) || 0) + expAmt })
    } else {
      await accDb.ledgers.add({
        name: category,
        group: 'Indirect Expenses',
        category: 'expense',
        current_balance: expAmt,
      })
    }

    window.dispatchEvent(new Event('accounting-data-updated'))
    return voucher
  })
}

/**
 * -------------------------------------------------------------
 * Loans & Advances Functions
 * -------------------------------------------------------------
 */
export async function recordLoanEntry({
  type = 'loan', // 'loan' (we owe) | 'advance' (given)
  name = '',
  amount = 0,
  note = '',
  dueDate = '',
  emi = '',
}) {
  const amt = Number(amount) || 0
  if (amt <= 0) throw new Error('Amount must be greater than 0')
  const isLoanWeOwe = type === 'loan'
  const group = isLoanWeOwe ? 'Loans (Liability)' : 'Loans & Advances (Asset)'
  const category = isLoanWeOwe ? 'liability' : 'asset'
  const finalNote = note.trim() || (emi ? `EMI ₹${emi} due ${dueDate || 'next month'}` : dueDate ? `Repay by ${dueDate}` : '')

  const id = await accDb.ledgers.add({
    name: name.trim(),
    group,
    category,
    current_balance: amt,
    note: finalNote,
  })
  window.dispatchEvent(new Event('accounting-data-updated'))
  return await accDb.ledgers.get(id)
}

/**
 * -------------------------------------------------------------
 * Universal Admin Update & Delete Functions
 * -------------------------------------------------------------
 */

export async function updatePartyRecord(id, updates) {
  const party = await accDb.parties.get(Number(id))
  if (!party) throw new Error('Party not found')

  const cleanUpdates = { ...updates }
  if (cleanUpdates.current_balance !== undefined) {
    cleanUpdates.current_balance = Number(cleanUpdates.current_balance) || 0
  }
  if (cleanUpdates.credit_limit !== undefined) {
    cleanUpdates.credit_limit = Number(cleanUpdates.credit_limit) || 0
  }
  if (cleanUpdates.due_days !== undefined) {
    cleanUpdates.due_days = Number(cleanUpdates.due_days) || 0
  }

  await accDb.parties.update(party.id, cleanUpdates)
  window.dispatchEvent(new Event('accounting-data-updated'))
  return await accDb.parties.get(party.id)
}

export async function updateMaterialRecord(id, updates) {
  const material = await accDb.materials.get(Number(id))
  if (!material) throw new Error('Material not found')

  const cleanUpdates = { ...updates }
  if (cleanUpdates.current_qty !== undefined) {
    cleanUpdates.current_qty = Math.max(0, Number(cleanUpdates.current_qty) || 0)
  }
  if (cleanUpdates.purchase_rate !== undefined) {
    cleanUpdates.purchase_rate = Number(cleanUpdates.purchase_rate) || 0
  }
  if (cleanUpdates.sales_rate !== undefined) {
    cleanUpdates.sales_rate = Number(cleanUpdates.sales_rate) || 0
  }
  if (cleanUpdates.reorder_threshold !== undefined) {
    cleanUpdates.reorder_threshold = Number(cleanUpdates.reorder_threshold) || 10
  }

  const qty = cleanUpdates.current_qty !== undefined ? cleanUpdates.current_qty : material.current_qty
  const threshold = cleanUpdates.reorder_threshold !== undefined ? cleanUpdates.reorder_threshold : (material.reorder_threshold || 10)
  cleanUpdates.status = qty <= 0 ? 'Out of stock' : qty <= threshold ? 'Low' : 'Healthy'

  await accDb.materials.update(material.id, cleanUpdates)
  window.dispatchEvent(new Event('accounting-data-updated'))
  return await accDb.materials.get(material.id)
}

export async function updateVoucherRecord(id, updates) {
  const voucher = await accDb.vouchers.get(Number(id))
  if (!voucher) throw new Error('Voucher not found')

  const cleanUpdates = { ...updates }
  if (cleanUpdates.amount !== undefined) {
    cleanUpdates.amount = Number(cleanUpdates.amount) || 0
  }
  if (cleanUpdates.paid_amount !== undefined) {
    cleanUpdates.paid_amount = Number(cleanUpdates.paid_amount) || 0
  }
  if (cleanUpdates.due_amount !== undefined) {
    cleanUpdates.due_amount = Number(cleanUpdates.due_amount) || 0
  }

  // Auto calculate due amount if amount or paid_amount changed
  if (cleanUpdates.amount !== undefined && cleanUpdates.paid_amount !== undefined) {
    cleanUpdates.due_amount = Math.max(0, cleanUpdates.amount - cleanUpdates.paid_amount)
    cleanUpdates.status = cleanUpdates.due_amount <= 0 ? 'Paid' : 'Due'
  }

  await accDb.vouchers.update(voucher.id, cleanUpdates)

  // If party name or due amount changed for a sales invoice, recalibrate party balance
  if (voucher.party_name) {
    const party = await accDb.parties.where('name').equalsIgnoreCase(voucher.party_name.trim()).first()
    if (party && party.type === 'debtor') {
      const partyVouchers = await accDb.vouchers.where('party_name').equalsIgnoreCase(party.name).toArray()
      const totalDue = partyVouchers.reduce((sum, v) => sum + (Number(v.due_amount) || 0), 0)
      await accDb.parties.update(party.id, { current_balance: totalDue })
    }
  }

  window.dispatchEvent(new Event('accounting-data-updated'))
  return await accDb.vouchers.get(voucher.id)
}

export async function updateLedgerRecord(id, updates) {
  const ledger = await accDb.ledgers.get(Number(id))
  if (!ledger) throw new Error('Ledger not found')

  const cleanUpdates = { ...updates }
  if (cleanUpdates.current_balance !== undefined) {
    cleanUpdates.current_balance = Number(cleanUpdates.current_balance) || 0
  }

  await accDb.ledgers.update(ledger.id, cleanUpdates)
  window.dispatchEvent(new Event('accounting-data-updated'))
  return await accDb.ledgers.get(ledger.id)
}

export async function deleteDbRecord(table, id) {
  if (!accDb[table]) throw new Error(`Table ${table} does not exist`)
  await accDb[table].delete(Number(id))
  window.dispatchEvent(new Event('accounting-data-updated'))
}

/**
 * Initialize Default Accounting Data matching PDF attachments exactly
 */
export async function initDefaultAccountingData() {
  const ledgerCount = await accDb.ledgers.count()
  if (ledgerCount > 0) return

  // 1. Settings (Owner visibility, WhatsApp, Shop details)
  const defaultSettings = [
    { key: 'shop_name', value: '[Shop name]' },
    { key: 'invoice_footer', value: 'Thank you for your business' },
    { key: 'daily_whatsapp_summary', value: 'true' },
    { key: 'whatsapp_summary_time', value: '8:00 PM' },
    { key: 'whatsapp_language', value: 'English / বাংলা' },
    { key: 'auto_import_reminder', value: 'true' },
    { key: 'last_backup_time', value: 'today, 6:45 PM' },
    { key: 'owner_pin', value: '1234' },
    { key: 'admin_pin', value: '8888' },
    {
      key: 'owner_permissions',
      value: JSON.stringify({
        sales: true,
        profit: true,
        expenses: true,
        debtors: true,
        creditors: true,
        inventory: true,
        loans: false, // Hidden from owner by default as shown on PDF pages 14 & 16
      }),
    },
    {
      key: 'card_order',
      value: JSON.stringify(['sales', 'profit', 'expenses', 'debtors', 'creditors', 'inventory', 'loans']),
    },
  ]
  await accDb.settings.bulkAdd(defaultSettings)

  // 2. Chart of Accounts (Ledgers)
  const defaultLedgers = [
    { name: 'Cash', group: 'Cash-in-hand', current_balance: 145000, category: 'asset' },
    { name: 'HDFC Current Account', group: 'Bank Accounts', current_balance: 875000, category: 'asset' },
    { name: 'Term loan', group: 'Loans (Liability)', current_balance: 400000, category: 'liability', note: 'EMI ₹18,500 due 5 Nov' },
    { name: 'Vendor loan', group: 'Loans (Liability)', current_balance: 50000, category: 'liability', note: 'Repay by 30 Nov' },
    { name: 'Staff advances', group: 'Loans & Advances (Asset)', current_balance: 15000, category: 'asset', note: '3 people' },
    { name: 'Supplier advance', group: 'Loans & Advances (Asset)', current_balance: 135000, category: 'asset', note: 'Metro Steel' },
    // Expenses
    { name: 'Rent', group: 'Indirect Expenses', current_balance: 120000, category: 'expense' },
    { name: 'Salaries', group: 'Indirect Expenses', current_balance: 110000, category: 'expense' },
    { name: 'Electricity', group: 'Indirect Expenses', current_balance: 28000, category: 'expense' },
    { name: 'Transport', group: 'Indirect Expenses', current_balance: 22000, category: 'expense' },
  ]
  await accDb.ledgers.bulkAdd(defaultLedgers)

  // 3. Materials / Inventory (Matching Page 7 & 1 of PDF)
  // Total stock value ~₹22.6L, 14 low stock items
  const defaultMaterials = [
    {
      sku: 'CC-IP15-CLR',
      name: 'iPhone 15 · Clear Case',
      category: 'Cases & Covers',
      unit: 'pcs',
      purchase_rate: 180,
      sales_rate: 350,
      current_qty: 6,
      reorder_threshold: 15,
      status: 'Low',
    },
    {
      sku: 'SL-RN13-BLK',
      name: 'Redmi Note 13 · Silicone',
      category: 'Cases & Covers',
      unit: 'pcs',
      purchase_rate: 120,
      sales_rate: 250,
      current_qty: 112,
      reorder_threshold: 20,
      status: 'Healthy',
    },
    {
      sku: 'FC-SA15-BRN',
      name: 'Samsung A15 · Flip Cover',
      category: 'Cases & Covers',
      unit: 'pcs',
      purchase_rate: 220,
      sales_rate: 450,
      current_qty: 0,
      reorder_threshold: 10,
      status: 'Out of stock',
    },
    {
      sku: 'TG-IP15-PRM',
      name: 'iPhone 15 Pro Max 9D Tempered Glass',
      category: 'Screen Protectors',
      unit: 'pcs',
      purchase_rate: 45,
      sales_rate: 199,
      current_qty: 8,
      reorder_threshold: 25,
      status: 'Low',
    },
    {
      sku: 'CHG-65W-GAN',
      name: '65W Fast GaN Dual Type-C Charger',
      category: 'Power & Cables',
      unit: 'pcs',
      purchase_rate: 650,
      sales_rate: 1299,
      current_qty: 1450,
      reorder_threshold: 50,
      status: 'Healthy',
    },
    {
      sku: 'CBL-BRD-TPE',
      name: 'Braided Type-C Fast Charging Cable 2M',
      category: 'Power & Cables',
      unit: 'pcs',
      purchase_rate: 60,
      sales_rate: 199,
      current_qty: 4800,
      reorder_threshold: 200,
      status: 'Healthy',
    },
    {
      sku: 'AUD-TWS-AIR',
      name: 'ANC Pro True Wireless Earbuds',
      category: 'Audio',
      unit: 'pcs',
      purchase_rate: 850,
      sales_rate: 1699,
      current_qty: 1200,
      reorder_threshold: 40,
      status: 'Healthy',
    },
  ]
  await accDb.materials.bulkAdd(defaultMaterials)

  // 4. Parties: Debtors & Creditors (Matching PDF Page 2, 5, 6)
  // Debtors Total: ₹8.4L (0-30d ₹4.1L, 31-60d ₹2.6L, 60d+ ₹1.7L)
  // Creditors Total: ₹5.1L (Due now ₹1.9L, Next 15d ₹1.6L, Later ₹1.6L)
  const defaultParties = [
    // Debtors
    {
      name: 'Rahul Mobile Hub',
      type: 'debtor',
      uid: 'UID-CUST-1001',
      phone: '+91 98765 43210',
      last_invoice_date: '12 Oct',
      current_balance: 184200,
      age_bucket: '60d+',
      due_days: 68,
    },
    {
      name: 'City Gadget Point',
      type: 'debtor',
      uid: 'UID-CUST-1002',
      phone: '+91 98112 34567',
      last_invoice_date: '02 Oct',
      current_balance: 96500,
      age_bucket: '31–60d',
      due_days: 42,
    },
    {
      name: 'Sen Telecom',
      type: 'debtor',
      uid: 'UID-CUST-1003',
      phone: '+91 98301 23456',
      last_invoice_date: '16 Oct',
      current_balance: 71900,
      age_bucket: '0–30d',
      due_days: 14,
    },
    {
      name: 'Mitra Cover House',
      type: 'debtor',
      uid: 'UID-CUST-1004',
      phone: '+91 98450 98765',
      last_invoice_date: '17 Oct',
      current_balance: 48300,
      age_bucket: '0–30d',
      due_days: 8,
    },
    {
      name: 'Apex Mobile Zone',
      type: 'debtor',
      uid: 'UID-CUST-1005',
      phone: '+91 98200 11223',
      last_invoice_date: '10 Oct',
      current_balance: 163500,
      age_bucket: '31–60d',
      due_days: 35,
    },
    {
      name: 'Vikas Digital Store',
      type: 'debtor',
      uid: 'UID-CUST-1006',
      phone: '+91 98990 44556',
      last_invoice_date: '15 Oct',
      current_balance: 275600,
      age_bucket: '0–30d',
      due_days: 12,
    },
    // Creditors
    {
      name: 'Metro Steel and Hardware',
      type: 'creditor',
      uid: null,
      phone: '+91 98210 99887',
      next_payment: '20 Oct',
      due_status: 'Due in 1d',
      due_days: 1,
      current_balance: 192000,
      due_bucket: 'Due now',
    },
    {
      name: 'Supreme Fabrics Mill',
      type: 'creditor',
      uid: null,
      phone: '+91 98765 43210',
      next_payment: '02 Nov',
      due_status: 'Due in 14d',
      due_days: 14,
      current_balance: 130500,
      due_bucket: 'Next 15d',
    },
    {
      name: 'Bright Cases Wholesale',
      type: 'creditor',
      uid: null,
      phone: '+91 98311 88776',
      next_payment: '12 Nov',
      due_status: 'Due in 24d',
      due_days: 24,
      current_balance: 86200,
      due_bucket: 'Later',
    },
    {
      name: 'Universal Displays Ltd',
      type: 'creditor',
      uid: null,
      phone: '+91 98400 33221',
      next_payment: '25 Nov',
      due_status: 'Due in 37d',
      due_days: 37,
      current_balance: 101300,
      due_bucket: 'Later',
    },
  ]
  await accDb.parties.bulkAdd(defaultParties)

  // 5. Vouchers (Matching Page 3 & 1 of PDF)
  // Sales today: ₹1.42L, Last 7 days: ₹9.8L
  const todayStr = new Date().toISOString().slice(0, 10)
  const yesterdayStr = new Date(Date.now() - 86400000).toISOString().slice(0, 10)

  const defaultVouchers = [
    {
      voucher_no: 'INV-0412',
      voucher_type: 'sales',
      date: todayStr,
      party_name: 'Rahul Mobile Hub',
      party_uid: 'UID-CUST-1001',
      amount: 48200,
      paid_amount: 0,
      due_amount: 48200,
      status: 'Due',
      payment_mode: 'Credit',
      narration: 'Bulk supply: 120x Clear Cases & 80x Tempered Glass',
      items: [
        { sku: 'CC-IP15-CLR', name: 'iPhone 15 · Clear Case', qty: 120, rate: 350, cost_rate: 180, amount: 42000 },
        { sku: 'TG-IP15-PRM', name: 'iPhone 15 Pro Max 9D Tempered Glass', qty: 80, rate: 199, cost_rate: 45, amount: 6200 },
      ],
      createdAt: new Date().toISOString(),
    },
    {
      voucher_no: 'INV-0411',
      voucher_type: 'sales',
      date: todayStr,
      party_name: 'Walk-in customer',
      party_uid: null,
      amount: 2350,
      paid_amount: 2350,
      due_amount: 0,
      status: 'Paid',
      payment_mode: 'Cash',
      narration: 'Counter retail sale',
      items: [
        { sku: 'SL-RN13-BLK', name: 'Redmi Note 13 · Silicone', qty: 5, rate: 250, cost_rate: 120, amount: 1250 },
        { sku: 'CBL-BRD-TPE', name: 'Braided Type-C Fast Charging Cable 2M', qty: 5, rate: 199, cost_rate: 60, amount: 995 },
      ],
      createdAt: new Date(Date.now() - 3600000).toISOString(),
    },
    {
      voucher_no: 'INV-0410',
      voucher_type: 'sales',
      date: yesterdayStr,
      party_name: 'Sen Telecom',
      party_uid: 'UID-CUST-1003',
      amount: 71900,
      paid_amount: 71900,
      due_amount: 0,
      status: 'Paid',
      payment_mode: 'HDFC Bank',
      narration: 'NEFT full payment for GaN chargers & audio accessories',
      items: [
        { sku: 'CHG-65W-GAN', name: '65W Fast GaN Dual Type-C Charger', qty: 50, rate: 1299, cost_rate: 650, amount: 64950 },
      ],
      createdAt: new Date(Date.now() - 86400000).toISOString(),
    },
    {
      voucher_no: 'INV-0409',
      voucher_type: 'sales',
      date: todayStr,
      party_name: 'Mitra Cover House',
      party_uid: 'UID-CUST-1004',
      amount: 91450,
      paid_amount: 91450,
      due_amount: 0,
      status: 'Paid',
      payment_mode: 'UPI',
      narration: 'Stock replenishment for premium cases',
      items: [
        { sku: 'AUD-TWS-AIR', name: 'ANC Pro True Wireless Earbuds', qty: 50, rate: 1699, cost_rate: 850, amount: 84950 },
      ],
      createdAt: new Date().toISOString(),
    },
  ]
  await accDb.vouchers.bulkAdd(defaultVouchers)

  // 6. Recent Imports Log (Matching Page 11 of PDF)
  const defaultImports = [
    {
      filename: 'DayBook_17Oct.xml',
      date: '17 Oct, 5:12 PM',
      added_count: 21,
      skipped_count: 2,
      status: '21 added',
      problems_count: 0,
    },
    {
      filename: 'DayBook_16Oct.xml',
      date: '16 Oct, 6:02 PM',
      added_count: 34,
      skipped_count: 5,
      status: '34 added',
      problems_count: 0,
    },
    {
      filename: 'Ledgers.xlsx',
      date: '15 Oct, 7:30 PM',
      added_count: 12,
      skipped_count: 0,
      status: '2 problems',
      problems_count: 2,
    },
  ]
  await accDb.imports.bulkAdd(defaultImports)
}
