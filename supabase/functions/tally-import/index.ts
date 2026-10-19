import { createClient } from 'npm:@supabase/supabase-js@2'
import { XMLParser, XMLValidator } from 'npm:fast-xml-parser@4'
import * as XLSX from 'npm:xlsx@0.18.5'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const MAX_BYTES = 8 * 1024 * 1024
const asArray = (value) => value == null ? [] : Array.isArray(value) ? value : [value]
const val = (value) => value == null ? '' : typeof value === 'object' && '#text' in value ? String(value['#text'] ?? '').trim() : String(value).trim()
const num = (value) => {
  const parsed = Number(val(value).replace(/,/g, '').replace(/[^\d.eE+-]/g, ''))
  return Number.isFinite(parsed) ? parsed : 0
}
const normalDate = (value) => {
  const raw = value instanceof Date ? value.toISOString().slice(0, 10) : val(value)
  if (/^\d{8}$/.test(raw)) return raw.slice(0, 4) + '-' + raw.slice(4, 6) + '-' + raw.slice(6, 8)
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw
  if (/^\d{1,2}[-/]\d{1,2}[-/]\d{4}$/.test(raw)) {
    const parts = raw.split(/[-/]/)
    return parts[2] + '-' + parts[1].padStart(2, '0') + '-' + parts[0].padStart(2, '0')
  }
  return ''
}
const digest = async (input) => {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input
  const hash = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(hash)).map((byte) => byte.toString(16).padStart(2, '0')).join('')
}
const collectNamed = (object, wanted, output = []) => {
  if (!object || typeof object !== 'object') return output
  if (Array.isArray(object)) { for (const item of object) collectNamed(item, wanted, output); return output }
  for (const [key, child] of Object.entries(object)) {
    if (key.toUpperCase() === wanted.toUpperCase()) output.push(...asArray(child))
    if (child && typeof child === 'object') collectNamed(child, wanted, output)
  }
  return output
}
const first = (object, keys) => {
  for (const key of keys) if (object?.[key] != null && val(object[key]) !== '') return object[key]
  return ''
}
const typeNormal = (value) => {
  const type = val(value).toLowerCase()
  if (type.includes('sales') || type === 'sale') return 'sales'
  if (type.includes('purchase')) return 'purchase'
  if (type.includes('receipt')) return 'receipt'
  if (type.includes('payment')) return 'payment'
  if (type.includes('contra')) return 'contra'
  if (type.includes('journal')) return 'journal'
  return ''
}
const rowMessages = (row) => {
  const messages = []
  if (!row.payload?.name && ['ledger','party','stock_item'].includes(row.rowType)) messages.push('Master name is missing')
  if (row.rowType === 'voucher') {
    if (!row.payload?.voucher_no) messages.push('Voucher number is missing')
    if (!row.payload?.date) messages.push('Date is missing or invalid')
    if (!row.payload?.voucher_type) messages.push('Voucher type is not supported')
  }
  return messages
}

async function parseXml(text, company) {
  const validation = XMLValidator.validate(text)
  if (validation !== true) throw new Error('Invalid XML: ' + (validation.err?.msg || 'document validation failed'))
  const parsed = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', parseTagValue: false, trimValues: true }).parse(text)
  const rows = []
  for (const voucher of collectNamed(parsed, 'VOUCHER')) {
    const date = normalDate(first(voucher, ['DATE','EFFECTIVEDATE']))
    const entries = asArray(voucher['ALLLEDGERENTRIES.LIST'] || voucher['LEDGERENTRIES.LIST'])
    const amount = Math.abs(num(first(voucher, ['AMOUNT']))) || Math.max(0, ...entries.map((entry) => Math.abs(num(entry.AMOUNT))))
    const items = asArray(voucher['ALLINVENTORYENTRIES.LIST']).map((item) => ({
      name: val(first(item, ['STOCKITEMNAME','NAME'])),
      qty: Math.abs(num(first(item, ['BILLEDQTY','ACTUALQTY']))),
      rate: Math.abs(num(item.RATE)),
      amount: Math.abs(num(item.AMOUNT)),
    })).filter((item) => item.name)
    const payload = {
      voucher_no: val(first(voucher, ['VOUCHERNUMBER','VOUCHERNO','MASTERID'])),
      voucher_type: typeNormal(first(voucher, ['@_VCHTYPE','VOUCHERTYPENAME','VOUCHERTYPE'])),
      date, party_name: val(first(voucher, ['PARTYLEDGERNAME','PARTYNAME'])) || 'Cash',
      party_uid: '', amount, paid_amount: amount, due_amount: 0, payment_mode: 'Tally import', items,
      narration: val(voucher.NARRATION), reference_no: val(first(voucher, ['REFERENCE','REFERENCEID'])),
      source_voucher_guid: val(first(voucher, ['GUID','MASTERID'])), source_company: company || 'default',
    }
    payload.source_hash = await digest(JSON.stringify({ voucher_no: payload.voucher_no, date: payload.date, voucher_type: payload.voucher_type, amount: payload.amount, party_name: payload.party_name, narration: payload.narration }))
    rows.push({ rowType: 'voucher', payload })
  }
  for (const ledger of collectNamed(parsed, 'LEDGER')) {
    const name = val(first(ledger, ['@_NAME','NAME']))
    if (!name) continue
    const group = val(first(ledger, ['PARENT'])) || 'General'
    const opening = Math.abs(num(first(ledger, ['OPENINGBALANCE'])))
    const type = group.toLowerCase().includes('creditor') ? 'creditor' : group.toLowerCase().includes('debtor') ? 'debtor' : ''
    const payload = { name, group, opening_balance: opening, phone: val(first(ledger, ['LEDGERPHONE','PHONE'])), email: val(first(ledger, ['EMAIL'])), address: val(first(ledger, ['ADDRESS'])) }
    rows.push({ rowType: type ? 'party' : 'ledger', payload: type ? { ...payload, type } : payload })
  }
  for (const stock of collectNamed(parsed, 'STOCKITEM')) {
    const name = val(first(stock, ['@_NAME','NAME']))
    if (!name) continue
    rows.push({ rowType: 'stock_item', payload: {
      name, sku: 'TALLY-' + (await digest(name.toLowerCase())).slice(0, 12).toUpperCase(),
      category: val(first(stock, ['PARENT'])) || 'General', unit: val(first(stock, ['BASEUNITS'])) || 'pcs',
      opening_qty: Math.abs(num(first(stock, ['OPENINGBALANCE']))), purchase_rate: Math.abs(num(first(stock, ['OPENINGRATE']))), sales_rate: Math.abs(num(first(stock, ['RATE']))),
    } })
  }
  return rows
}

async function parseSheet(bytes, company) {
  const workbook = XLSX.read(bytes, { type: 'array', cellDates: true })
  const firstSheet = workbook.SheetNames[0]
  if (!firstSheet) throw new Error('Spreadsheet contains no worksheet.')
  const records = XLSX.utils.sheet_to_json(workbook.Sheets[firstSheet], { defval: '', raw: false })
  const rows = []
  for (const record of records) {
    const header = {}
    for (const [key, value] of Object.entries(record)) header[String(key).toLowerCase().replace(/[^a-z0-9]/g, '')] = value
    const get = (pattern) => Object.entries(header).find(([key]) => pattern.test(key))?.[1] ?? ''
    const rawAmount = get(/^amount$|^totalamount$|voucheramount/)
    const payload = {
      voucher_no: val(get(/voucherno|vouchernumber|^number$/)),
      voucher_type: typeNormal(get(/vouchertype|vouchertypename|^type$/)),
      date: normalDate(get(/^(date|voucherdate|effectivedate)$/)),
      party_name: val(get(/partyname|partyledgername|ledgername|particulars|^party$/)) || 'Cash',
      party_uid: '', amount: Math.abs(num(rawAmount)), paid_amount: Math.abs(num(rawAmount)), due_amount: 0, payment_mode: 'Tally import', items: [],
      narration: val(get(/narration|description/)), reference_no: '', source_voucher_guid: val(get(/guid|voucherguid/)), source_company: company || 'default',
    }
    payload.source_hash = await digest(JSON.stringify({ voucher_no: payload.voucher_no, date: payload.date, voucher_type: payload.voucher_type, amount: payload.amount, party_name: payload.party_name, narration: payload.narration }))
    rows.push({ rowType: 'voucher', payload })
  }
  return rows
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const respond = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  if (request.method !== 'POST') return respond({ error: 'Method not allowed' }, 405)
  try {
    const url = Deno.env.get('SUPABASE_URL') || ''
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_PUBLISHABLE_KEY') || ''
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    const authorization = request.headers.get('Authorization') || ''
    if (!url || !anonKey || !serviceKey) throw new Error('Supabase function secrets are not configured.')
    if (!authorization.startsWith('Bearer ')) return respond({ error: 'Authentication required' }, 401)
    const userClient = createClient(url, anonKey, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } })
    const { data: authData, error: authError } = await userClient.auth.getUser()
    if (authError || !authData.user) return respond({ error: 'Invalid session' }, 401)
    const adminClient = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
    const { data: profile, error: profileError } = await adminClient.from('profiles').select('role').eq('id', authData.user.id).maybeSingle()
    if (profileError || profile?.role !== 'admin') return respond({ error: 'Admin role required' }, 403)

    const body = await request.json()
    if (body.action === 'commit') {
      const { data, error } = await userClient.rpc('commit_tally_import', { p_job_id: body.jobId })
      if (error) throw new Error(error.message)
      return respond(data)
    }
    if (body.action !== 'preview') return respond({ error: 'Action must be preview or commit' }, 400)
    if (!body.filename || !body.contentBase64) throw new Error('File name and content are required.')
    const extension = String(body.filename).split('.').pop().toLowerCase()
    if (!['xml','xlsx','xls','csv'].includes(extension)) throw new Error('Unsupported file. Use XML, XLSX, XLS, or CSV.')
    const bytes = Uint8Array.from(atob(body.contentBase64), (character) => character.charCodeAt(0))
    if (bytes.byteLength > MAX_BYTES) throw new Error('File exceeds the 8 MB upload limit.')
    const contentHash = await digest(bytes)
    const company = String(body.companyName || 'default')
    let rows = extension === 'xml' ? await parseXml(new TextDecoder().decode(bytes), company) : await parseSheet(bytes, company)
    if (!rows.length) throw new Error('No supported voucher, ledger, or stock-item rows were found.')

    const seen = new Set()
    let valid = 0, duplicates = 0, problems = 0
    const staged = []
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index]
      if (row.rowType === 'voucher' && !row.payload.source_hash) row.payload.source_hash = await digest(JSON.stringify(row.payload))
      const messages = rowMessages(row)
      const key = row.rowType === 'voucher' ? (row.payload.source_voucher_guid || [row.payload.voucher_no,row.payload.date,row.payload.voucher_type].join('|')) : row.rowType + '|' + row.payload.name
      let status = messages.length ? 'error' : 'valid'
      if (seen.has(key)) { status = 'duplicate'; messages.push('Duplicate within this file') }
      seen.add(key)
      if (status === 'valid') valid += 1
      else if (status === 'duplicate') duplicates += 1
      else problems += 1
      staged.push({ row_number: index + 1, row_type: row.rowType, reference: row.payload.voucher_no || row.payload.name || 'Row ' + (index + 1), payload: row.payload, validation_status: status, validation_messages: messages, selected_for_import: status === 'valid' })
    }

    const counts = { total: staged.length, valid, duplicates, problems }
    const { data: createdJob, error: jobError } = await adminClient.from('import_jobs').insert({ filename: body.filename, source_format: extension, content_sha256: contentHash, status: 'ready', counts, created_by: authData.user.id }).select('id').single()
    if (jobError) throw new Error(jobError.message)
    for (let offset = 0; offset < staged.length; offset += 400) {
      const { error: rowsError } = await adminClient.from('import_rows').insert(staged.slice(offset, offset + 400).map((row) => ({ ...row, job_id: createdJob.id })))
      if (rowsError) throw new Error('Could not stage import rows: ' + rowsError.message)
    }
    const previewRows = staged.slice(0, 50).map((row) => ({ id: createdJob.id + '-' + row.row_number, rowNumber: row.row_number, rowType: row.row_type, reference: row.reference, validationStatus: row.validation_status, messages: row.validation_messages }))
    return respond({ jobId: createdJob.id, filename: body.filename, sourceFormat: extension, status: 'ready', summary: counts, previewRows })
  } catch (error) {
    return respond({ error: error instanceof Error ? error.message : 'Unexpected import failure' }, 400)
  }
})
