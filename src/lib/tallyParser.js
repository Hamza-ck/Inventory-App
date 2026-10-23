import * as XLSX from 'xlsx'
import {
  accDb,
  createDebtor,
  createCreditor,
  createStockItem,
  createVoucher,
} from './accountingDb'

/**
 * Tally Integration Engine
 * Full support for Tally Prime / Tally ERP 9 Exported XML & Excel/CSV Vouchers and Masters
 */

// Format Tally date 'YYYYMMDD' or 'DD-MM-YYYY' into 'YYYY-MM-DD'
export function formatTallyDate(rawDate) {
  if (!rawDate) return new Date().toISOString().slice(0, 10)
  const str = String(rawDate).trim()

  // YYYYMMDD (e.g. 20261014)
  if (/^\d{8}$/.test(str)) {
    const y = str.slice(0, 4)
    const m = str.slice(4, 6)
    const d = str.slice(6, 8)
    return `${y}-${m}-${d}`
  }

  // DD-MM-YYYY or DD/MM/YYYY
  if (/^\d{1,2}[-/]\d{1,2}[-/]\d{4}$/.test(str)) {
    const parts = str.split(/[-/]/)
    const d = parts[0].padStart(2, '0')
    const m = parts[1].padStart(2, '0')
    const y = parts[2]
    return `${y}-${m}-${d}`
  }

  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str

  // Fallback date parsing
  const parsed = new Date(str)
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10)
  }

  return new Date().toISOString().slice(0, 10)
}

/**
 * Parse Tally XML Export string
 */
export function parseTallyXml(xmlText) {
  const parser = new DOMParser()
  const xmlDoc = parser.parseFromString(xmlText, 'text/xml')

  const parserError = xmlDoc.querySelector('parsererror')
  if (parserError) {
    throw new Error('Invalid XML document: ' + parserError.textContent)
  }

  const result = {
    ledgers: [],
    stockItems: [],
    vouchers: [],
    stats: {
      ledgersCount: 0,
      stockItemsCount: 0,
      vouchersCount: 0,
      salesCount: 0,
      purchaseCount: 0,
      receiptCount: 0,
      paymentCount: 0,
      contraCount: 0,
      journalCount: 0,
    },
  }

  // 1. Parse Ledgers (<LEDGER>)
  const ledgerNodes = xmlDoc.querySelectorAll('LEDGER')
  ledgerNodes.forEach((node) => {
    const name = node.getAttribute('NAME') || node.querySelector('NAME')?.textContent?.trim()
    const parent = node.querySelector('PARENT')?.textContent?.trim() || 'General'
    const openingBalStr = node.querySelector('OPENINGBALANCE')?.textContent?.trim() || '0'
    const openingBal = Math.abs(parseFloat(openingBalStr) || 0)
    const phone = node.querySelector('LEDGERPHONE')?.textContent?.trim() || ''
    const email = node.querySelector('EMAIL')?.textContent?.trim() || ''
    const address = Array.from(node.querySelectorAll('ADDRESS.LIST ADDRESS'))
      .map((a) => a.textContent.trim())
      .filter(Boolean)
      .join(', ')

    if (name) {
      result.ledgers.push({
        name,
        group: parent,
        opening_balance: openingBal,
        current_balance: openingBal,
        phone,
        email,
        address,
      })
      result.stats.ledgersCount++
    }
  })

  // 2. Parse Stock Items (<STOCKITEM>)
  const stockNodes = xmlDoc.querySelectorAll('STOCKITEM')
  stockNodes.forEach((node) => {
    const name = node.getAttribute('NAME') || node.querySelector('NAME')?.textContent?.trim()
    const unit = node.querySelector('BASEUNITS')?.textContent?.trim() || 'pcs'
    const category = node.querySelector('PARENT')?.textContent?.trim() || 'General'
    const openingQtyStr = node.querySelector('OPENINGBALANCE')?.textContent?.trim() || '0'
    const openingQty = parseFloat(openingQtyStr.replace(/[^\d.-]/g, '')) || 0
    const openingRateStr = node.querySelector('OPENINGRATE')?.textContent?.trim() || '0'
    const openingRate = parseFloat(openingRateStr.replace(/[^\d.-]/g, '')) || 0

    if (name) {
      const sku = 'MAT-' + name.replace(/[^A-Za-z0-9]/g, '').slice(0, 8).toUpperCase()
      result.stockItems.push({
        sku,
        name,
        category,
        unit,
        purchase_rate: openingRate || 100,
        sales_rate: openingRate ? Math.round(openingRate * 1.25) : 130,
        current_qty: openingQty,
        reorder_threshold: 10,
      })
      result.stats.stockItemsCount++
    }
  })

  // 3. Parse Vouchers (<VOUCHER>)
  const voucherNodes = xmlDoc.querySelectorAll('VOUCHER')
  voucherNodes.forEach((node, idx) => {
    const rawType = (
      node.getAttribute('VCHTYPE') ||
      node.querySelector('VOUCHERTYPENAME')?.textContent ||
      'Journal'
    ).trim()

    const rawDate = node.querySelector('DATE')?.textContent?.trim()
    const date = formatTallyDate(rawDate)
    const voucherNo =
      node.querySelector('VOUCHERNUMBER')?.textContent?.trim() ||
      `VCH-${Date.now().toString().slice(-4)}-${idx + 1}`
    const partyName =
      node.querySelector('PARTYLEDGERNAME')?.textContent?.trim() ||
      node.querySelector('PARTYNAME')?.textContent?.trim() ||
      'Cash'
    const narration = node.querySelector('NARRATION')?.textContent?.trim() || ''

    // Normalize voucher type to our standard: sales, purchase, receipt, payment, contra, journal
    let voucherType = 'journal'
    const lowerType = rawType.toLowerCase()
    if (lowerType.includes('sale')) voucherType = 'sales'
    else if (lowerType.includes('purch')) voucherType = 'purchase'
    else if (lowerType.includes('receipt')) voucherType = 'receipt'
    else if (lowerType.includes('paym')) voucherType = 'payment'
    else if (lowerType.includes('contra')) voucherType = 'contra'

    // Parse Ledger Entries
    const ledgerEntries = []
    node.querySelectorAll('ALLLEDGERENTRIES.LIST, LEDGERENTRIES.LIST').forEach((leNode) => {
      const lName = leNode.querySelector('LEDGERNAME')?.textContent?.trim()
      const amtStr = leNode.querySelector('AMOUNT')?.textContent?.trim() || '0'
      const rawAmt = parseFloat(amtStr) || 0
      const isPositive = leNode.querySelector('ISDEEMEDPOSITIVE')?.textContent?.trim() === 'Yes'
      ledgerEntries.push({
        ledgerName: lName,
        amount: Math.abs(rawAmt),
        rawAmount: rawAmt,
        isDebit: isPositive || rawAmt < 0,
      })
    })

    // Parse Inventory Items if present
    const inventoryItems = []
    node.querySelectorAll('ALLINVENTORYENTRIES.LIST, INVENTORYENTRIES.LIST').forEach((invNode) => {
      const itemName = invNode.querySelector('STOCKITEMNAME')?.textContent?.trim()
      const qtyStr = invNode.querySelector('BILLEDQTY, ACTUALQTY')?.textContent?.trim() || '1'
      const qty = parseFloat(qtyStr.replace(/[^\d.-]/g, '')) || 1
      const rateStr = invNode.querySelector('RATE')?.textContent?.trim() || '0'
      const rate = parseFloat(rateStr.replace(/[^\d.-]/g, '')) || 0
      const amtStr = invNode.querySelector('AMOUNT')?.textContent?.trim() || '0'
      const amt = Math.abs(parseFloat(amtStr) || (qty * rate))

      if (itemName) {
        inventoryItems.push({
          name: itemName,
          qty,
          rate: rate || (qty ? amt / qty : 0),
          amount: amt,
        })
      }
    })

    // Compute net voucher amount
    let totalAmount = 0
    if (inventoryItems.length > 0) {
      totalAmount = inventoryItems.reduce((acc, it) => acc + it.amount, 0)
    } else if (ledgerEntries.length > 0) {
      totalAmount = Math.max(...ledgerEntries.map((l) => l.amount))
    }

    // Determine paid vs due for sales/purchase
    let paidAmount = totalAmount
    let dueAmount = 0
    if (voucherType === 'sales') {
      // If party is not cash, check if full or credit
      const isCashParty = partyName.toLowerCase().includes('cash')
      paidAmount = isCashParty ? totalAmount : 0
      dueAmount = isCashParty ? 0 : totalAmount
    } else if (voucherType === 'purchase') {
      const isCashParty = partyName.toLowerCase().includes('cash')
      paidAmount = isCashParty ? totalAmount : 0
      dueAmount = isCashParty ? 0 : totalAmount
    }

    result.vouchers.push({
      voucher_no: voucherNo,
      voucher_type: voucherType,
      date,
      party_name: partyName,
      amount: totalAmount,
      paid_amount: paidAmount,
      due_amount: dueAmount,
      items: inventoryItems,
      ledgerEntries,
      narration,
    })

    result.stats.vouchersCount++
    if (voucherType === 'sales') result.stats.salesCount++
    else if (voucherType === 'purchase') result.stats.purchaseCount++
    else if (voucherType === 'receipt') result.stats.receiptCount++
    else if (voucherType === 'payment') result.stats.paymentCount++
    else if (voucherType === 'contra') result.stats.contraCount++
    else if (voucherType === 'journal') result.stats.journalCount++
  })

  return result
}

/**
 * Parse Excel or CSV Tally Export
 */
export async function parseTallyExcel(file) {
  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array' })
  const sheetName = workbook.SheetNames[0]
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' })

  const result = {
    vouchers: [],
    materials: [],
    parties: [],
    stats: { totalRows: rows.length, parsedVouchers: 0 },
  }

  rows.forEach((row, idx) => {
    // Check common Tally export column headers
    const date = formatTallyDate(row['Date'] || row['DATE'] || row['Voucher Date'])
    const voucherNo = row['Vch No.'] || row['Vch No'] || row['Voucher No'] || row['VOUCHER NO'] || `EXCEL-${idx + 1}`
    const rawType = (row['Vch Type'] || row['Voucher Type'] || row['TYPE'] || 'Sales').trim()
    const partyName = (row['Particulars'] || row['Party Name'] || row['PARTY'] || row['Account'] || 'Cash').trim()
    const debit = parseFloat(row['Debit Amount'] || row['Debit'] || row['DEBIT'] || 0) || 0
    const credit = parseFloat(row['Credit Amount'] || row['Credit'] || row['CREDIT'] || 0) || 0
    const narration = row['Narration'] || row['Remarks'] || ''

    let voucherType = 'sales'
    const lowerType = rawType.toLowerCase()
    if (lowerType.includes('sale')) voucherType = 'sales'
    else if (lowerType.includes('purch')) voucherType = 'purchase'
    else if (lowerType.includes('receipt')) voucherType = 'receipt'
    else if (lowerType.includes('paym')) voucherType = 'payment'
    else if (lowerType.includes('contra')) voucherType = 'contra'
    else if (lowerType.includes('journal')) voucherType = 'journal'

    const amount = Math.max(debit, credit) || 1000

    result.vouchers.push({
      voucher_no: voucherNo,
      voucher_type: voucherType,
      date,
      party_name: partyName,
      amount,
      paid_amount: voucherType === 'sales' && partyName.toLowerCase().includes('cash') ? amount : 0,
      due_amount: voucherType === 'sales' && !partyName.toLowerCase().includes('cash') ? amount : 0,
      narration,
      items: [],
    })
    result.stats.parsedVouchers++
  })

  return result
}

/**
 * Generate Tally XML export for current system vouchers and masters
 */
export function generateTallyExportXml({ vouchers = [], materials = [], parties = [], ledgers = [] }) {
  let xml = `<?xml version="1.0" encoding="utf-8"?>
<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Export Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <IMPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>All Masters and Vouchers</REPORTNAME>
      </REQUESTDESC>
      <REQUESTDATA>
`

  // Export Ledgers
  ledgers.forEach((l) => {
    xml += `        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <LEDGER NAME="${escapeXml(l.name)}" ACTION="Create">
            <NAME>${escapeXml(l.name)}</NAME>
            <PARENT>${escapeXml(l.group || 'Sundry Debtors')}</PARENT>
            <OPENINGBALANCE>${Number(l.opening_balance || 0).toFixed(2)}</OPENINGBALANCE>
          </LEDGER>
        </TALLYMESSAGE>
`
  })

  // Export Parties as Ledgers
  parties.forEach((p) => {
    const parent = p.type === 'creditor' ? 'Sundry Creditors' : 'Sundry Debtors'
    xml += `        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <LEDGER NAME="${escapeXml(p.name)}" ACTION="Create">
            <NAME>${escapeXml(p.name)}</NAME>
            <PARENT>${parent}</PARENT>
            <OPENINGBALANCE>${Number(p.opening_balance || 0).toFixed(2)}</OPENINGBALANCE>
            ${p.uid ? `<LEDGERCODE>${escapeXml(p.uid)}</LEDGERCODE>` : ''}
            <LEDGERPHONE>${escapeXml(p.phone || '')}</LEDGERPHONE>
          </LEDGER>
        </TALLYMESSAGE>
`
  })

  // Export Stock Items
  materials.forEach((m) => {
    xml += `        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <STOCKITEM NAME="${escapeXml(m.name)}" ACTION="Create">
            <NAME>${escapeXml(m.name)}</NAME>
            <BASEUNITS>${escapeXml(m.unit || 'pcs')}</BASEUNITS>
            <OPENINGBALANCE>${Number(m.current_qty || 0)} ${escapeXml(m.unit || 'pcs')}</OPENINGBALANCE>
            <OPENINGRATE>${Number(m.purchase_rate || 0).toFixed(2)}/${escapeXml(m.unit || 'pcs')}</OPENINGRATE>
          </STOCKITEM>
        </TALLYMESSAGE>
`
  })

  // Export Vouchers
  vouchers.forEach((v) => {
    const vchType = capitalize(v.voucher_type || 'sales')
    const tallyDate = (v.date || '').replace(/[^0-9]/g, '') || '20261014'

    xml += `        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <VOUCHER VCHTYPE="${vchType}" ACTION="Create">
            <DATE>${tallyDate}</DATE>
            <VOUCHERTYPENAME>${vchType}</VOUCHERTYPENAME>
            <VOUCHERNUMBER>${escapeXml(v.voucher_no || '')}</VOUCHERNUMBER>
            <PARTYLEDGERNAME>${escapeXml(v.party_name || 'Cash')}</PARTYLEDGERNAME>
            <NARRATION>${escapeXml(v.narration || '')}</NARRATION>
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>${escapeXml(v.party_name || 'Cash')}</LEDGERNAME>
              <ISDEEMEDPOSITIVE>${v.voucher_type === 'sales' ? 'Yes' : 'No'}</ISDEEMEDPOSITIVE>
              <AMOUNT>-${Number(v.amount || 0).toFixed(2)}</AMOUNT>
            </ALLLEDGERENTRIES.LIST>
`
    if (Array.isArray(v.items) && v.items.length > 0) {
      v.items.forEach((item) => {
        xml += `            <ALLINVENTORYENTRIES.LIST>
              <STOCKITEMNAME>${escapeXml(item.name)}</STOCKITEMNAME>
              <BILLEDQTY>${Number(item.qty || 1)} ${escapeXml(item.unit || 'pcs')}</BILLEDQTY>
              <RATE>${Number(item.rate || 0).toFixed(2)}</RATE>
              <AMOUNT>${Number(item.amount || (item.qty * item.rate)).toFixed(2)}</AMOUNT>
            </ALLINVENTORYENTRIES.LIST>
`
      })
    }
    xml += `          </VOUCHER>
        </TALLYMESSAGE>
`
  })

  xml += `      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>`

  return xml
}

function escapeXml(unsafe = '') {
  return String(unsafe).replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<': return '&lt;'
      case '>': return '&gt;'
      case '&': return '&amp;'
      case '\'': return '&apos;'
      case '"': return '&quot;'
      default: return c
    }
  })
}

function capitalize(s) {
  if (!s) return ''
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/**
 * Built-in Sample Tally Prime Export XML Data for 1-Click Demo & Testing
 */
export const SAMPLE_TALLY_XML = `<?xml version="1.0" encoding="utf-8"?>
<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Export Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <IMPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>Vouchers &amp; Masters</REPORTNAME>
      </REQUESTDESC>
      <REQUESTDATA>
        <!-- Master Ledgers -->
        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <LEDGER NAME="Apex Infotech Pvt Ltd" ACTION="Create">
            <NAME>Apex Infotech Pvt Ltd</NAME>
            <PARENT>Sundry Debtors</PARENT>
            <OPENINGBALANCE>12500.00</OPENINGBALANCE>
            <LEDGERPHONE>+91 98450 11223</LEDGERPHONE>
          </LEDGER>
        </TALLYMESSAGE>
        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <LEDGER NAME="Metro Steel &amp; Hardware" ACTION="Create">
            <NAME>Metro Steel &amp; Hardware</NAME>
            <PARENT>Sundry Creditors</PARENT>
            <OPENINGBALANCE>45000.00</OPENINGBALANCE>
            <LEDGERPHONE>+91 98210 99887</LEDGERPHONE>
          </LEDGER>
        </TALLYMESSAGE>
        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <LEDGER NAME="HDFC Current Account 0422" ACTION="Create">
            <NAME>HDFC Current Account 0422</NAME>
            <PARENT>Bank Accounts</PARENT>
            <OPENINGBALANCE>385000.00</OPENINGBALANCE>
          </LEDGER>
        </TALLYMESSAGE>
        <!-- Master Stock Items -->
        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <STOCKITEM NAME="Industrial Cotton Canvas 350 GSM" ACTION="Create">
            <NAME>Industrial Cotton Canvas 350 GSM</NAME>
            <BASEUNITS>meter</BASEUNITS>
            <OPENINGBALANCE>1200 meter</OPENINGBALANCE>
            <OPENINGRATE>145.00/meter</OPENINGRATE>
          </STOCKITEM>
        </TALLYMESSAGE>
        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <STOCKITEM NAME="High Tensile Steel Bolts M12" ACTION="Create">
            <NAME>High Tensile Steel Bolts M12</NAME>
            <BASEUNITS>box</BASEUNITS>
            <OPENINGBALANCE>85 box</OPENINGBALANCE>
            <OPENINGRATE>420.00/box</OPENINGRATE>
          </STOCKITEM>
        </TALLYMESSAGE>
        <!-- Vouchers -->
        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <VOUCHER VCHTYPE="Sales" ACTION="Create">
            <DATE>20261014</DATE>
            <VOUCHERTYPENAME>Sales</VOUCHERTYPENAME>
            <VOUCHERNUMBER>TALLY-SL-801</VOUCHERNUMBER>
            <PARTYLEDGERNAME>Apex Infotech Pvt Ltd</PARTYLEDGERNAME>
            <NARRATION>Tax invoice goods sold under PO #9482</NARRATION>
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>Apex Infotech Pvt Ltd</LEDGERNAME>
              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
              <AMOUNT>-28500.00</AMOUNT>
            </ALLLEDGERENTRIES.LIST>
            <ALLINVENTORYENTRIES.LIST>
              <STOCKITEMNAME>Industrial Cotton Canvas 350 GSM</STOCKITEMNAME>
              <BILLEDQTY>150 meter</BILLEDQTY>
              <RATE>190.00</RATE>
              <AMOUNT>28500.00</AMOUNT>
            </ALLINVENTORYENTRIES.LIST>
          </VOUCHER>
        </TALLYMESSAGE>
        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <VOUCHER VCHTYPE="Purchase" ACTION="Create">
            <DATE>20261013</DATE>
            <VOUCHERTYPENAME>Purchase</VOUCHERTYPENAME>
            <VOUCHERNUMBER>TALLY-PUR-402</VOUCHERNUMBER>
            <PARTYLEDGERNAME>Metro Steel &amp; Hardware</PARTYLEDGERNAME>
            <NARRATION>Inward raw material supply</NARRATION>
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>Metro Steel &amp; Hardware</LEDGERNAME>
              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
              <AMOUNT>21000.00</AMOUNT>
            </ALLLEDGERENTRIES.LIST>
            <ALLINVENTORYENTRIES.LIST>
              <STOCKITEMNAME>High Tensile Steel Bolts M12</STOCKITEMNAME>
              <BILLEDQTY>50 box</BILLEDQTY>
              <RATE>420.00</RATE>
              <AMOUNT>21000.00</AMOUNT>
            </ALLINVENTORYENTRIES.LIST>
          </VOUCHER>
        </TALLYMESSAGE>
        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <VOUCHER VCHTYPE="Receipt" ACTION="Create">
            <DATE>20261014</DATE>
            <VOUCHERTYPENAME>Receipt</VOUCHERTYPENAME>
            <VOUCHERNUMBER>TALLY-REC-105</VOUCHERNUMBER>
            <PARTYLEDGERNAME>Apex Infotech Pvt Ltd</PARTYLEDGERNAME>
            <NARRATION>Cheque received against previous pending dues</NARRATION>
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>HDFC Current Account 0422</LEDGERNAME>
              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
              <AMOUNT>-12500.00</AMOUNT>
            </ALLLEDGERENTRIES.LIST>
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>Apex Infotech Pvt Ltd</LEDGERNAME>
              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
              <AMOUNT>12500.00</AMOUNT>
            </ALLLEDGERENTRIES.LIST>
          </VOUCHER>
        </TALLYMESSAGE>
        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <VOUCHER VCHTYPE="Contra" ACTION="Create">
            <DATE>20261014</DATE>
            <VOUCHERTYPENAME>Contra</VOUCHERTYPENAME>
            <VOUCHERNUMBER>TALLY-CNT-019</VOUCHERNUMBER>
            <PARTYLEDGERNAME>Cash</PARTYLEDGERNAME>
            <NARRATION>Cash deposit into HDFC Bank</NARRATION>
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>HDFC Current Account 0422</LEDGERNAME>
              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
              <AMOUNT>-25000.00</AMOUNT>
            </ALLLEDGERENTRIES.LIST>
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>Cash</LEDGERNAME>
              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
              <AMOUNT>25000.00</AMOUNT>
            </ALLLEDGERENTRIES.LIST>
          </VOUCHER>
        </TALLYMESSAGE>
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>`

/**
 * Persist parsed Tally XML or Excel records directly into Dexie DB
 */
export async function importTallyDataToDb(parsedData) {
  let newCount = 0
  let skippedCount = 0
  let updatedCount = 0
  const problems = []

  // 1. Import Ledgers
  if (Array.isArray(parsedData.ledgers) && parsedData.ledgers.length > 0) {
    for (const l of parsedData.ledgers) {
      try {
        const group = (l.group || '').toLowerCase()
        if (group.includes('debtor') || group.includes('customer')) {
          const existing = await accDb.parties.where('name').equalsIgnoreCase(l.name.trim()).first()
          if (existing) {
            await accDb.parties.update(existing.id, {
              current_balance: Number(l.current_balance || l.opening_balance || existing.current_balance),
              phone: l.phone || existing.phone,
            })
            updatedCount++
          } else {
            await createDebtor({
              name: l.name,
              phone: l.phone || '',
              current_balance: Number(l.current_balance || l.opening_balance || 0),
              due_days: 15,
            })
            newCount++
          }
        } else if (group.includes('creditor') || group.includes('supplier')) {
          const existing = await accDb.parties.where('name').equalsIgnoreCase(l.name.trim()).first()
          if (existing) {
            await accDb.parties.update(existing.id, {
              current_balance: Number(l.current_balance || l.opening_balance || existing.current_balance),
              phone: l.phone || existing.phone,
            })
            updatedCount++
          } else {
            await createCreditor({
              name: l.name,
              phone: l.phone || '',
              current_balance: Number(l.current_balance || l.opening_balance || 0),
              due_days: 14,
              next_payment: 'Next month',
            })
            newCount++
          }
        } else if (group.includes('bank') || group.includes('cash')) {
          const existing = await accDb.ledgers.where('name').equalsIgnoreCase(l.name.trim()).first()
          if (existing) {
            await accDb.ledgers.update(existing.id, {
              current_balance: Number(l.current_balance || l.opening_balance || existing.current_balance),
            })
            updatedCount++
          } else {
            await accDb.ledgers.add({
              name: l.name.trim(),
              group: group.includes('bank') ? 'Bank Accounts' : 'Cash-in-hand',
              category: 'asset',
              current_balance: Number(l.current_balance || l.opening_balance || 0),
            })
            newCount++
          }
        }
      } catch (err) {
        problems.push({
          where: `Ledger ${l.name}`,
          problem: err.message || 'Error importing ledger',
          howToFix: 'Check ledger details in Tally',
        })
      }
    }
  }

  // 2. Import Stock Items
  if (Array.isArray(parsedData.stockItems) && parsedData.stockItems.length > 0) {
    for (const item of parsedData.stockItems) {
      try {
        const existing = await accDb.materials.where('name').equalsIgnoreCase(item.name.trim()).first()
        if (existing) {
          await accDb.materials.update(existing.id, {
            current_qty: item.current_qty != null ? Number(item.current_qty) : existing.current_qty,
            purchase_rate: Number(item.purchase_rate) || existing.purchase_rate,
            sales_rate: Number(item.sales_rate) || existing.sales_rate,
          })
          updatedCount++
        } else {
          await createStockItem({
            name: item.name,
            sku: item.sku,
            category: item.category || 'Tally Imported',
            unit: item.unit || 'pcs',
            purchase_rate: Number(item.purchase_rate) || 100,
            sales_rate: Number(item.sales_rate) || 130,
            current_qty: Number(item.current_qty) || 0,
            reorder_threshold: Number(item.reorder_threshold) || 10,
          })
          newCount++
        }
      } catch (err) {
        problems.push({
          where: `Stock item ${item.name}`,
          problem: err.message || 'Error importing stock item',
          howToFix: 'Verify unit and rate in Tally',
        })
      }
    }
  }

  // 3. Import Vouchers
  if (Array.isArray(parsedData.vouchers) && parsedData.vouchers.length > 0) {
    for (const v of parsedData.vouchers) {
      try {
        const existing = await accDb.vouchers.where('voucher_no').equalsIgnoreCase(v.voucher_no.trim()).first()
        if (existing) {
          skippedCount++
        } else {
          await createVoucher(v)
          newCount++
        }
      } catch (err) {
        problems.push({
          where: `Voucher ${v.voucher_no}`,
          problem: err.message || 'Error processing voucher',
          howToFix: 'Check voucher ledger balances',
        })
      }
    }
  }

  window.dispatchEvent(new Event('accounting-data-updated'))
  return { newCount, skippedCount, updatedCount, problems }
}

