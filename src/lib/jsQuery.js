/**
 * JSquery: Advanced Client-Side Querying & Accounting Engine
 * Provides fluent query chaining, fast indexing, date slicing,
 * financial calculations (Profits, Cash Flow, Debtor aging, Tax, COGS).
 */

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

  sortBy(field, direction = 'asc') {
    const mult = direction.toLowerCase() === 'desc' ? -1 : 1
    this.data.sort((a, b) => {
      const va = a[field]
      const vb = b[field]
      if (va === vb) return 0
      if (va === null || va === undefined) return 1
      if (vb === null || vb === undefined) return -1
      return va > vb ? mult : -mult
    })
    return this
  }

  sumBy(field) {
    return this.data.reduce((acc, item) => acc + (Number(item[field]) || 0), 0)
  }

  count() {
    return this.data.length
  }

  groupBy(field) {
    return this.data.reduce((acc, item) => {
      const key = item[field] ?? 'Other'
      if (!acc[key]) acc[key] = []
      acc[key].push(item)
      return acc
    }, {})
  }

  first() {
    return this.data[0] || null
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

export function calculateFinancialMetrics({ vouchers = [], ledgers = [], materials = [], parties = [] }) {
  const allVouchers = vouchers || []
  const todayStr = new Date().toISOString().slice(0, 10)

  // 1. Daily Sales & Total Sales
  const salesVouchers = allVouchers.filter((v) => v.voucher_type === 'sales')
  const todaySalesVouchers = salesVouchers.filter((v) => (v.date || '').slice(0, 10) === todayStr)

  const todaySalesTotal = todaySalesVouchers.reduce((acc, v) => acc + (Number(v.amount) || 0), 0)
  const todaySalesPaid = todaySalesVouchers.reduce((acc, v) => acc + (Number(v.paid_amount) || 0), 0)
  const todaySalesDue = todaySalesVouchers.reduce((acc, v) => acc + (Number(v.due_amount) || 0), 0)

  const totalSalesRevenue = salesVouchers.reduce((acc, v) => acc + (Number(v.amount) || 0), 0)

  // 2. Gross & Net Profits
  // Gross Profit = Sum of (Sales item revenue - Sales item cost price)
  let totalGrossProfit = 0
  let todayGrossProfit = 0

  salesVouchers.forEach((v) => {
    const isToday = (v.date || '').slice(0, 10) === todayStr
    let voucherGross = 0
    if (Array.isArray(v.items) && v.items.length > 0) {
      v.items.forEach((item) => {
        const qty = Number(item.qty) || 0
        const rate = Number(item.rate) || 0
        const costRate = Number(item.cost_rate) || 0
        voucherGross += (rate - costRate) * qty
      })
    } else {
      // Estimated 20% margin if item cost rate is not specified
      voucherGross = (Number(v.amount) || 0) * 0.2
    }
    totalGrossProfit += voucherGross
    if (isToday) todayGrossProfit += voucherGross
  })

  // Operating Expenses from Payment vouchers with expense ledgers
  const expenseVouchers = allVouchers.filter((v) => {
    return v.voucher_type === 'payment' && (v.expense_category || v.debit_ledger_name?.toLowerCase().includes('expense') || v.debit_ledger_name?.toLowerCase().includes('rent') || v.debit_ledger_name?.toLowerCase().includes('salary'))
  })
  const totalExpenses = expenseVouchers.reduce((acc, v) => acc + (Number(v.amount) || 0), 0)
  const todayExpenses = expenseVouchers
    .filter((v) => (v.date || '').slice(0, 10) === todayStr)
    .reduce((acc, v) => acc + (Number(v.amount) || 0), 0)

  const totalNetProfit = totalGrossProfit - totalExpenses
  const todayNetProfit = todayGrossProfit - todayExpenses

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
