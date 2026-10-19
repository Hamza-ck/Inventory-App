import { motion } from 'framer-motion'
import { X, Printer, Download, CheckCircle2, ShieldCheck, AlertCircle } from 'lucide-react'

export default function InvoicePrintModal({ isOpen, onClose, invoice }) {
  if (!isOpen || !invoice) return null

  const items = invoice.items || []
  const hasDue = Number(invoice.due_amount) > 0

  function handlePrint() {
    window.print()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/75 backdrop-blur-xs overflow-y-auto font-sans">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="w-full max-w-3xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden my-auto"
      >
        {/* Modal Controls (Hidden in Print) */}
        <div className="bg-slate-900 text-white p-4 flex items-center justify-between no-print">
          <div className="flex items-center gap-2">
            <span className="font-bold text-sm">Tax Invoice Preview</span>
            <span className="text-xs text-slate-400 font-mono">#{invoice.voucher_no}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs transition-colors"
            >
              <Printer className="w-4 h-4" />
              <span>Print Invoice</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable Invoice Sheet */}
        <div className="p-8 sm:p-10 bg-white text-slate-900 printable-area">
          {/* Header */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-6 border-b border-slate-200 gap-4">
            <div>
              <h1 className="text-2xl font-black tracking-tight text-slate-900">OMNI ENTERPRISES</h1>
              <p className="text-xs text-slate-500 font-medium">Textile & Industrial Materials Supply</p>
              <p className="text-xs text-slate-500">GSTIN: 07AAAAA0000A1Z5 | PAN: AAAAA0000A</p>
            </div>
            <div className="text-left sm:text-right">
              <span className="inline-block px-3 py-1 bg-slate-100 border border-slate-200 rounded-md text-xs font-mono font-bold uppercase tracking-wider text-slate-800 mb-1">
                TAX INVOICE
              </span>
              <div className="text-sm font-bold text-slate-900">#{invoice.voucher_no}</div>
              <div className="text-xs text-slate-500">Date: {invoice.date}</div>
            </div>
          </div>

          {/* Bill To & Permanent UID */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 py-6 border-b border-slate-200">
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                Billed To (Customer)
              </span>
              <div className="text-base font-bold text-slate-900">{invoice.party_name || 'Cash Customer'}</div>
              {invoice.party_phone && (
                <div className="text-xs text-slate-600">Tel: {invoice.party_phone}</div>
              )}

              {/* Permanent UID Badge */}
              {invoice.party_uid ? (
                <div className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 bg-blue-50 border border-blue-200 text-blue-900 rounded-lg text-xs font-bold">
                  <ShieldCheck className="w-4 h-4 text-blue-600" />
                  <span>Customer UID: {invoice.party_uid}</span>
                </div>
              ) : (
                <div className="mt-2 text-xs text-slate-400 italic">
                  Counter Walk-in (Settled Upfront)
                </div>
              )}
            </div>

            <div className="sm:text-right text-xs space-y-1">
              <div><span className="text-slate-500">Payment Mode:</span> <strong className="text-slate-800">{invoice.payment_mode || 'Cash'}</strong></div>
              <div><span className="text-slate-500">Dispatch Doc No:</span> <strong className="text-slate-800">{invoice.reference_no || 'N/A'}</strong></div>
              <div><span className="text-slate-500">Terms:</span> <strong className="text-slate-800">{hasDue ? 'Credit Sale' : 'Full Cash Settlement'}</strong></div>
            </div>
          </div>

          {/* Line Items Table */}
          <div className="py-6">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b-2 border-slate-900 text-slate-900 uppercase font-black text-[10px]">
                  <th className="py-2.5">#</th>
                  <th className="py-2.5">Material Description</th>
                  <th className="py-2.5 text-right">Qty</th>
                  <th className="py-2.5 text-right">Unit</th>
                  <th className="py-2.5 text-right">Rate (₹)</th>
                  <th className="py-2.5 text-right">Amount (₹)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {items.length > 0 ? (
                  items.map((it, idx) => (
                    <tr key={idx}>
                      <td className="py-3 text-slate-400 font-mono">{idx + 1}</td>
                      <td className="py-3 font-semibold text-slate-900">
                        <div>{it.name}</div>
                        {it.sku && <span className="text-[10px] font-mono text-slate-500">{it.sku}</span>}
                      </td>
                      <td className="py-3 text-right font-medium">{it.qty}</td>
                      <td className="py-3 text-right text-slate-500">{it.unit || 'pcs'}</td>
                      <td className="py-3 text-right font-medium">₹{Number(it.rate || 0).toLocaleString()}</td>
                      <td className="py-3 text-right font-bold text-slate-900">₹{Number(it.amount || (it.qty * it.rate)).toLocaleString()}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="py-4 text-center text-slate-400">
                      Standard Accounting Entry - ₹{Number(invoice.amount || 0).toLocaleString()}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Totals & Due Summary */}
          <div className="pt-4 border-t border-slate-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div className="text-xs text-slate-500 max-w-sm">
              <p className="font-bold text-slate-700">Remarks / Narration:</p>
              <p className="italic">{invoice.narration || 'Thank you for your business!'}</p>
            </div>

            <div className="w-full sm:w-64 space-y-1.5 text-xs text-right">
              <div className="flex justify-between text-slate-600">
                <span>Subtotal:</span>
                <span>₹{Number(invoice.amount || 0).toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-emerald-700 font-bold">
                <span>Amount Paid:</span>
                <span>₹{Number(invoice.paid_amount || 0).toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-base font-black text-slate-900 pt-2 border-t border-slate-200">
                <span>Invoice Total:</span>
                <span>₹{Number(invoice.amount || 0).toLocaleString()}</span>
              </div>
              {hasDue && (
                <div className="flex justify-between text-rose-700 font-bold bg-rose-50 px-2 py-1 rounded">
                  <span>Closing Due Balance:</span>
                  <span>₹{Number(invoice.due_amount || 0).toLocaleString()}</span>
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="pt-12 mt-8 border-t border-dashed border-slate-300 flex justify-between items-end text-[10px] text-slate-400">
            <div>
              <p>Generated via TallyFlow SaaS Cloud</p>
              <p>This is a computer-generated invoice and requires no physical signature.</p>
            </div>
            <div className="text-right">
              <p className="font-bold text-slate-700">For OMNI ENTERPRISES</p>
              <p className="mt-8">Authorized Signatory</p>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  )
}
