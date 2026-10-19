import { todayISO } from './format.js'

/** Small chainable filter helper + dashboard financial metrics. */

class JSQueryChain {
  constructor(data = []) {
    this.data = Array.isArray(data) ? [...data] : []
  }

  where(predicate) {
    if (typeof predicate === 'function') {
      this.data = this.data.filter(predicate)
    } else if (typeof predicate === 'object' && predicate !== null) {
      this.data = this.data.filter((item) => {
        return Object.entries(predicate).every(([key, val]) => {
          if (val === undefined || val === null || val === 'all') return true
          return item[key] === val
        })
      })
    }
    return this
  }

  dateRange(startDate, endDate, dateField = 'date') {
    if (!startDate && !endDate) return this
    const start = startDate ? new Date(startDate).setHours(0, 0, 0, 0) : -Infinity
    const end = endDate ? new Date(endDate).setHours(23, 59, 59, 999) : Infinity

    this.data = this.data.filter((item) => {
      const rawDate = item[dateField] || item.created_at
      if (!rawDate) return false
      const d = new Date(rawDate).getTime()
      return d >= start && d <= end
    })
    return this
  }

  search(term, fields = []) {
    if (!term || !term.trim()) return this
    const query = term.toLowerCase().trim()
    this.data = this.data.filter((item) => {
      const targetFields = fields.length > 0 ? fields : Object.keys(item)
      return targetFields.some((field) => {
        const val = item[field]
        if (val === undefined || val === null) return false
        return String(val).toLowerCase().includes(query)
      })
    })
    return this
  }






  execute() {
    return this.data
  }
}

export function jsQuery(data) {
  return new JSQueryChain(data)
}

/**
 * High-Level Financial Calculations (Profits, Cash & Bank, Loans, Debtors, Creditors)
 */

/**
 * Gross profit of one sales voucher = sum((rate - cost) * qty).
 * Vouchers with no item detail (e.g. imported day-book rows) have an UNKNOWN
 * margin: we return null instead of inventing one.
 */
export function voucherGrossProfit(v) {
  if (!Array.isArray(v.items) || v.items.length === 0) return null
  return v.items.reduce(
    (sum, it) => sum + ((Number(it.rate) || 0) - (Number(it.cost_rate) || 0)) * (Number(it.qty) || 0),
    0
  )
}

export function calculateFinancialMetrics({ vouchers = [], ledgers = [], materials = [], parties = [] }) {
  const allVouchers = vouchers || []
  const todayStr = todayISO()
  const isToday = (v) => (v.date || '').slice(0, 10) === todayStr
  const sum = (list, f) => list.reduce((acc, v) => acc + (Number(f(v)) || 0), 0)

  // 1. Sales
  const salesVouchers = allVouchers.filter((v) => v.voucher_type === 'sales')
  const todaySales = salesVouchers.filter(isToday)

  // 2. Profit (only vouchers with item cost data)
  let totalGrossProfit = 0
  let todayGrossProfit = 0
  let unpricedSales = 0
  salesVouchers.forEach((v) => {
    const g = voucherGrossProfit(v)
    if (g === null) {
      unpricedSales++
      return
    }
    totalGrossProfit += g
    if (isToday(v)) todayGrossProfit += g
  })

  // Expenses = payments booked against an expense ledger
  const expenseLedgerIds = new Set(ledgers.filter((l) => /expense/i.test(l.group || '')).map((l) => String(l.id)))
  const expenseVouchers = allVouchers.filter(
    (v) =>
      v.voucher_type === 'payment' &&
      ((v.counter_ledger_id && expenseLedgerIds.has(String(v.counter_ledger_id))) || v.expense_category)
  )
  const totalExpenses = sum(expenseVouchers, (v) => v.amount)
  const todayExpenses = sum(expenseVouchers.filter(isToday), (v) => v.amount)
  const totalNetProfit = totalGrossProfit - totalExpenses
  const todayNetProfit = todayGrossProfit - todayExpenses
  const totalSalesRevenue = sum(salesVouchers, (v) => v.amount)
  const todaySalesTotal = sum(todaySales, (v) => v.amount)
  const todaySalesPaid = sum(todaySales, (v) => v.paid_amount)
  const todaySalesDue = sum(todaySales, (v) => v.due_amount)
  const todaySalesVouchers = todaySales

  // 3. Cash & Bank Balances
  // Starting ledger balances + Inflows - Outflows
  const cashAccounts = ledgers.filter((l) => l.group === 'Cash-in-hand')
  const bankAccounts = ledgers.filter((l) => l.group === 'Bank Accounts')

  const totalCashBalance = cashAccounts.reduce((acc, l) => acc + (Number(l.current_balance) || 0), 0)
  const totalBankBalance = bankAccounts.reduce((acc, l) => acc + (Number(l.current_balance) || 0), 0)

  // 4. Loans (Liabilities vs Advances)
  const loanLiabilityLedgers = ledgers.filter((l) => l.group === 'Loans (Liability)')
  const loanAssetLedgers = ledgers.filter((l) => l.group === 'Loans & Advances (Asset)')

  const totalLoansPayable = loanLiabilityLedgers.reduce((acc, l) => acc + (Number(l.current_balance) || 0), 0)
  const totalLoansReceivable = loanAssetLedgers.reduce((acc, l) => acc + (Number(l.current_balance) || 0), 0)

  // 5. Debtors (Sundry Debtors with permanent UID)
  const debtors = parties.filter((p) => p.type === 'debtor')
  const totalDebtorsDue = debtors.reduce((acc, p) => acc + (Number(p.current_balance) || 0), 0)
  const debtorsWithUidCount = debtors.filter((p) => Boolean(p.uid)).length

  // 6. Creditors (Sundry Creditors / Suppliers)
  const creditors = parties.filter((p) => p.type === 'creditor')
  const totalCreditorsPayable = creditors.reduce((acc, p) => acc + (Number(p.current_balance) || 0), 0)

  // 7. Inventory (Pure Material-Wise)
  const totalStockItems = materials.length
  const totalStockValue = materials.reduce((acc, m) => {
    const qty = Number(m.current_qty) || 0
    const cost = Number(m.purchase_rate) || 0
    return acc + qty * cost
  }, 0)
  const lowStockMaterials = materials.filter((m) => {
    const qty = Number(m.current_qty) || 0
    const reorder = Number(m.reorder_threshold) || 0
    return qty <= reorder
  })

  return {
    today: {
      sales: todaySalesTotal,
      paid: todaySalesPaid,
      due: todaySalesDue,
      grossProfit: todayGrossProfit,
      expenses: todayExpenses,
      netProfit: todayNetProfit,
      invoiceCount: todaySalesVouchers.length,
    },
    total: {
      sales: totalSalesRevenue,
      grossProfit: totalGrossProfit,
      expenses: totalExpenses,
      netProfit: totalNetProfit,
      unpricedSales,
    },
    cashAndBank: {
      cash: totalCashBalance,
      bank: totalBankBalance,
      total: totalCashBalance + totalBankBalance,
      accounts: [...cashAccounts, ...bankAccounts],
    },
    loans: {
      payable: totalLoansPayable,
      receivable: totalLoansReceivable,
      netLiability: totalLoansPayable - totalLoansReceivable,
      accounts: [...loanLiabilityLedgers, ...loanAssetLedgers],
    },
    debtors: {
      totalDue: totalDebtorsDue,
      count: debtors.length,
      withUidCount: debtorsWithUidCount,
      list: debtors,
    },
    creditors: {
      totalPayable: totalCreditorsPayable,
      count: creditors.length,
      list: creditors,
    },
    inventory: {
      totalItems: totalStockItems,
      totalValue: totalStockValue,
      lowStockCount: lowStockMaterials.length,
      lowStockList: lowStockMaterials,
    },
  }
}
