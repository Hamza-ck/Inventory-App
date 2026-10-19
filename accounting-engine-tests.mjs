import 'fake-indexeddb/auto'
const E = await import('./src/lib/accountingDb.js')
const { accDb, createVoucher, updateVoucher, deleteVoucher, loadDemoData, initDefaultAccountingData, importTallyData } = E
let fail = 0
const check = (name, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) fail++; console.log((ok ? 'PASS' : 'FAIL'), name.padEnd(58), ok ? got : `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`) }

await accDb.ledgers.bulkAdd([
  { name: 'Cash in Hand', group: 'Cash-in-hand', current_balance: 0 },
  { name: 'HDFC Current', group: 'Bank Accounts', current_balance: 0 },
  { name: 'Shop Rent', group: 'Indirect Expenses', current_balance: 0 },
  { name: 'Term Loan', group: 'Loans (Liability)', current_balance: 1000 },
])
const L = async (n) => (await accDb.ledgers.where('name').equals(n).first()).current_balance
const mid = await accDb.materials.add({ sku: 'A', name: 'Widget', current_qty: 100, purchase_rate: 10, sales_rate: 20 })

// stock via UI path (string material_id)
const s1 = await createVoucher({ voucher_type: 'sales', party_name: '', amount: 200, paid_amount: 200, due_amount: 0, payment_mode: 'Cash',
  items: [{ material_id: String(mid), name: 'Widget', sku: 'A', qty: 10, rate: 20, cost_rate: 10, amount: 200 }] })
check('string material_id decrements stock (100->90)', (await accDb.materials.get(mid)).current_qty, 90)
await deleteVoucher(s1.id)
check('delete restores stock exactly', (await accDb.materials.get(mid)).current_qty, 100)

// double count
await createVoucher({ voucher_type: 'sales', party_name: 'Ravi', amount: 1000, paid_amount: 0, due_amount: 1000,
  items: [{ material_id: mid, qty: 1, rate: 1000, amount: 1000 }] })
const ravi = await accDb.parties.where('name').equals('Ravi').first()
check('new credit customer balance == 1000 (not 2000)', ravi.current_balance, 1000)
check('credit sale got permanent UID', ravi.uid, 'UID-CUST-1001')

// oversell + undo symmetry
await accDb.materials.update(mid, { current_qty: 4 })
const over = await createVoucher({ voucher_type: 'sales', party_name: '', amount: 160, paid_amount: 160, due_amount: 0, items: [{ material_id: mid, qty: 8, rate: 20, amount: 160 }] })
check('oversell shows negative stock (visible, not hidden)', (await accDb.materials.get(mid)).current_qty, -4)
await deleteVoucher(over.id)
check('undo returns to 4', (await accDb.materials.get(mid)).current_qty, 4)

// cash receipt goes to cash
await createVoucher({ voucher_type: 'receipt', party_name: 'Ravi', amount: 500, payment_mode: 'Cash' })
check('cash receipt -> cash ledger 500', await L('Cash in Hand'), 500)
check('cash receipt -> bank untouched', await L('HDFC Current'), 0)
check('receipt reduces debtor balance 1000->500', (await accDb.parties.get(ravi.id)).current_balance, 500)

// new supplier payable
await createVoucher({ voucher_type: 'purchase', party_name: 'New Supplier', amount: 700, paid_amount: 0, due_amount: 700, items: [{ material_id: mid, qty: 7, rate: 100, amount: 700 }] })
check('new supplier payable recorded 700', (await accDb.parties.where('name').equals('New Supplier').first())?.current_balance, 700)

// sequential numbers
const a = await createVoucher({ voucher_type: 'payment', counter_ledger_id: (await accDb.ledgers.where('name').equals('Shop Rent').first()).id, amount: 300, payment_mode: 'Cash' })
const b = await createVoucher({ voucher_type: 'payment', counter_ledger_id: (await accDb.ledgers.where('name').equals('Shop Rent').first()).id, amount: 200, payment_mode: 'Cash' })
check('sequential numbers', [a.voucher_no, b.voucher_no], ['PAY-0001', 'PAY-0002'])
check('expense payment: rent ledger +500', await L('Shop Rent'), 500)
check('expense payment: cash 500-500', await L('Cash in Hand'), 0)

// loan EMI reduces liability
const loan = await accDb.ledgers.where('name').equals('Term Loan').first()
await createVoucher({ voucher_type: 'payment', counter_ledger_id: loan.id, amount: 400, payment_mode: 'HDFC' })
check('loan EMI 400: loan 1000->600', await L('Term Loan'), 600)
check('loan EMI paid from bank -400', await L('HDFC Current'), -400)

// duplicate voucher no
let dup; try { await createVoucher({ voucher_type: 'payment', voucher_no: 'PAY-0001', amount: 1, counter_ledger_id: loan.id }) } catch (e) { dup = e.message }
check('duplicate voucher no rejected', !!dup, true)

// edit: change customer must move balance to the new customer
const e1 = await createVoucher({ voucher_type: 'sales', party_name: 'Sita', amount: 300, paid_amount: 0, due_amount: 300 })
await updateVoucher(e1.id, { party_name: 'Gita', amount: 300, paid_amount: 0, due_amount: 300 })
check('edit customer: Sita back to 0', (await accDb.parties.where('name').equals('Sita').first()).current_balance, 0)
check('edit customer: Gita 300', (await accDb.parties.where('name').equals('Gita').first()).current_balance, 300)

// unknown party on receipt is rejected (typo guard), nothing half-written
const vBefore = await accDb.vouchers.count(); const cashBefore = await L('Cash in Hand')
let unk; try { await createVoucher({ voucher_type: 'receipt', party_name: 'Typo Name', amount: 50, payment_mode: 'Cash' }) } catch (e) { unk = e.message }
check('receipt from unknown party rejected', !!unk, true)
check('...and nothing was written', [await accDb.vouchers.count(), await L('Cash in Hand')], [vBefore, cashBefore])

// ATOMICITY: force a failure after voucher+stock written
const orig = accDb.ledgers.update.bind(accDb.ledgers)
accDb.ledgers.update = () => { throw new Error('boom') }
const sBefore = (await accDb.materials.get(mid)).current_qty, v0 = await accDb.vouchers.count()
try { await createVoucher({ voucher_type: 'sales', party_name: '', amount: 20, paid_amount: 20, due_amount: 0, payment_mode: 'Cash', items: [{ material_id: mid, qty: 1, rate: 20, amount: 20 }] }) } catch {}
accDb.ledgers.update = orig
check('forced failure rolls back voucher + stock', [await accDb.vouchers.count(), (await accDb.materials.get(mid)).current_qty], [v0, sBefore])

// demo data consistency (fresh db state not needed: use new Dexie? just verify totals math)
await accDb.delete(); await accDb.open()
await initDefaultAccountingData()
check('fresh book: 6 starter ledgers, all zero', [await accDb.ledgers.count(), (await accDb.ledgers.toArray()).every(l => l.current_balance === 0)], [6, true])
await loadDemoData()
const thread = await accDb.materials.where('sku').equals('MAT-THRD-05').first()
check('demo: thread 60-40=20 (low stock)', thread.current_qty, 20)
check('demo: HDFC 285000-15000+10000+10000+8000', await L('HDFC Current Account 0422'), 298000)
let again; try { await loadDemoData() } catch (e) { again = e.message }
check('demo refuses non-empty book', !!again, true)

// tally import: same voucher no across types is NOT dropped; atomic re-import skips dups
const parsed = { ledgers: [], stockItems: [], vouchers: [
  { voucher_no: '1', voucher_type: 'sales', date: '2026-10-01', party_name: 'Zed', amount: 100, paid_amount: 0, due_amount: 100, items: [] },
  { voucher_no: '1', voucher_type: 'receipt', date: '2026-10-01', party_name: 'Zed', amount: 40, items: [] },
  { voucher_no: '9', voucher_type: 'sales', date: '2026-10-01', party_name: 'Zed', amount: 0, items: [] } ] }
const r1 = await importTallyData(parsed), r2_ = await importTallyData(parsed)
check('import: both "#1" vouchers kept, zero-amount skipped', r1, { ledgers: 0, materials: 0, vouchers: 2, skipped: 1 })
check('re-import is idempotent', r2_.vouchers, 0)
check('import: Zed balance 100-40', (await accDb.parties.where('name').equals('Zed').first()).current_balance, 60)

console.log(fail ? `\n${fail} FAILED` : '\nALL PASSED'); process.exit(fail ? 1 : 0)
