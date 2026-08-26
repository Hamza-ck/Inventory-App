import { useState, useMemo, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { jsPDF } from 'jspdf'
import { 
  FileText, 
  X, 
  Copy, 
  Download, 
  Check, 
  Package, 
  Sparkles,
  Layers, 
  CheckCircle2,
  CheckCheck,
  Megaphone
} from 'lucide-react'

const KNOWN_BRANDS = [
  'IPHONE', 'APPLE', 'VIVO', 'OPPO', 'SAMSUNG', 'REALME', 'REDMI', 
  'XIAOMI', 'POCO', 'ONEPLUS', 'INFINIX', 'TECNO', 'GOOGLE', 'PIXEL', 
  'MOTOROLA', 'MOTO', 'HUAWEI', 'HONOR', 'NOKIA', 'ITEL', 'NOTHING'
]

export default function ProductReportModal({ isOpen, onClose, materials = [], initialProductName = '' }) {
  if (!isOpen) return null

  return (
    <ProductReportModalContent
      onClose={onClose}
      materials={materials}
      initialProductName={initialProductName}
    />
  )
}

function ProductReportModalContent({ onClose, materials = [], initialProductName = '' }) {
  const distinctProductNames = useMemo(() => {
    const names = Array.from(new Set(materials.map((m) => m.name?.trim()).filter(Boolean)))
    names.sort((a, b) => a.localeCompare(b))
    return names
  }, [materials])

  const [selectedProduct, setSelectedProduct] = useState(
    initialProductName || distinctProductNames[0] || ''
  )
  const [copied, setCopied] = useState(false)

  // Sync selected product if initialProductName changes
  useEffect(() => {
    if (initialProductName && distinctProductNames.includes(initialProductName)) {
      setSelectedProduct(initialProductName)
    } else if (!selectedProduct && distinctProductNames.length > 0) {
      setSelectedProduct(distinctProductNames[0])
    }
  }, [initialProductName, distinctProductNames, selectedProduct])

  // Filter ONLY in-stock models (current_qty > 0) for marketing broadcast
  const inStockVariants = useMemo(() => {
    if (!selectedProduct) return []
    return materials.filter(
      (m) => m.name?.trim() === selectedProduct && Number(m.current_qty) > 0
    )
  }, [materials, selectedProduct])

  // Group in-stock models by detected Brand
  const groupedByBrand = useMemo(() => {
    const groups = {}

    inStockVariants.forEach((m) => {
      const modelName = (m.model || m.name || '').trim()
      const upperModel = modelName.toUpperCase()

      let detectedBrand = 'OTHER MODELS'
      for (const b of KNOWN_BRANDS) {
        if (
          upperModel.startsWith(b) ||
          upperModel.includes(b + ' ') ||
          upperModel.includes(b + '/') ||
          upperModel.includes(b + '-')
        ) {
          detectedBrand = b === 'APPLE' ? 'IPHONE' : b === 'MOTO' ? 'MOTOROLA' : b
          break
        }
      }

      if (!groups[detectedBrand]) {
        groups[detectedBrand] = []
      }
      groups[detectedBrand].push(m)
    })

    return groups
  }, [inStockVariants])

  const totalInStockModels = inStockVariants.length

  function handleCopyMarketingText() {
    if (!selectedProduct || inStockVariants.length === 0) return

    const dateStr = new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })

    let text = `========================================\n`
    text += `📦 Models Available : ${selectedProduct.toUpperCase()}\n`
    text += `Date: ${dateStr}\n`
    text += `Total Models : ${totalInStockModels}\n`
    text += `========================================\n\n`
    text += `MODEL BREAKDOWN:\n`

    const brandKeys = Object.keys(groupedByBrand).sort()

    brandKeys.forEach((brand) => {
      text += `${brand}:\n`
      groupedByBrand[brand].forEach((m, idx) => {
        const modelLabel = m.model || m.name
        text += `${idx + 1}. ${modelLabel} (In Stock)\n`
      })
      text += `\n`
    })

    text += `========================================\n`

    navigator.clipboard.writeText(text.trim())
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  function handleDownloadPDF() {
    if (!selectedProduct || inStockVariants.length === 0) return

    const doc = new jsPDF()
    const dateStr = new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
    const timeStr = new Date().toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    })

    // Header Background
    doc.setFillColor(15, 23, 42) // slate-900
    doc.rect(0, 0, 210, 36, 'F')

    // Document Title
    doc.setTextColor(255, 255, 255)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(17)
    doc.text('STOCK AVAILABILITY REPORT', 14, 17)

    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.text(`Marketing Stock Broadcast • Generated on ${dateStr} at ${timeStr}`, 14, 25)

    // Product Info Card
    doc.setTextColor(15, 23, 42)
    doc.setFontSize(15)
    doc.setFont('helvetica', 'bold')
    doc.text(`Product Category: ${selectedProduct}`, 14, 48)

    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(71, 85, 105)
    doc.text(`Total In-Stock Models: ${totalInStockModels} Available`, 14, 55)

    let startY = 65
    const brandKeys = Object.keys(groupedByBrand).sort()

    brandKeys.forEach((brand) => {
      if (startY > 255) {
        doc.addPage()
        startY = 20
      }

      // Brand Section Header
      doc.setFillColor(241, 245, 249) // slate-100
      doc.rect(14, startY, 182, 8, 'F')
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(10)
      doc.setTextColor(30, 58, 138) // blue-900
      doc.text(`${brand} (${groupedByBrand[brand].length} Models)`, 18, startY + 5.5)

      startY += 8.5

      // In-Stock Models List under this brand
      groupedByBrand[brand].forEach((m, idx) => {
        if (startY > 275) {
          doc.addPage()
          startY = 20
        }

        if (idx % 2 === 1) {
          doc.setFillColor(248, 250, 252)
          doc.rect(14, startY, 182, 7.5, 'F')
        }

        doc.setFont('helvetica', 'normal')
        doc.setFontSize(9.5)
        doc.setTextColor(71, 85, 105)
        doc.text(String(idx + 1) + '.', 18, startY + 5)

        // MODEL NAME ONLY
        doc.setTextColor(15, 23, 42)
        doc.setFont('helvetica', 'bold')
        doc.text(m.model || m.name, 28, startY + 5)

        // Status
        doc.setFont('helvetica', 'normal')
        doc.setTextColor(16, 185, 129) // emerald-600
        doc.text('✓ In Stock', 165, startY + 5)

        startY += 7.5
      })

      startY += 4
    })

    // Footer divider & total
    if (startY > 270) {
      doc.addPage()
      startY = 20
    }
    doc.setDrawColor(203, 213, 225)
    doc.line(14, startY, 196, startY)
    startY += 6
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.setTextColor(15, 23, 42)
    doc.text(`Total Available Models: ${totalInStockModels}`, 14, startY)

    const cleanFileName = selectedProduct.replace(/[^a-z0-9]/gi, '_')
    doc.save(`${cleanFileName}_Available_Stock_Report.pdf`)
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-md flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="bg-white rounded-3xl p-6 sm:p-7 w-full max-w-2xl shadow-2xl border border-slate-200 flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-100 shadow-xs">
              <Megaphone className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">Marketing Stock Availability Report</h3>
              <p className="text-xs text-slate-500">
                Generate in-stock model list for customer sharing, WhatsApp broadcasts, or PDF catalog
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body Content */}
        <div className="overflow-y-auto pr-1 flex-1 space-y-4">
          {/* Ask Which Product: Quick Selection Pills & Dropdown */}
          <div>
            <label className="block text-xs font-bold text-slate-800 mb-2">
              Which product category / type?
            </label>

            {/* Quick Pills for common products */}
            <div className="flex flex-wrap gap-1.5 mb-2.5">
              {distinctProductNames.map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => setSelectedProduct(name)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                    selectedProduct === name
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {name}
                </button>
              ))}
            </div>

            {/* Dropdown Select */}
            <select
              value={selectedProduct}
              onChange={(e) => setSelectedProduct(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-semibold text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
            >
              {distinctProductNames.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>

          {/* Marketing Summary Banner */}
          {selectedProduct && (
            <div className="p-4 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200/80 rounded-2xl flex items-center justify-between gap-3">
              <div>
                <span className="text-[10px] text-blue-600 font-bold uppercase tracking-wider block">
                  Product Category
                </span>
                <span className="text-base font-extrabold text-slate-900 block">
                  {selectedProduct}
                </span>
              </div>

              <div className="text-right">
                <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">
                  In-Stock Models
                </span>
                <span className="text-lg font-black text-emerald-600">
                  {totalInStockModels} Available
                </span>
              </div>
            </div>
          )}

          {/* Marketing Model Breakdown Preview (Grouped by Brand) */}
          <div className="border border-slate-200 rounded-2xl overflow-hidden">
            <div className="px-4 py-2.5 bg-slate-100 border-b border-slate-200 flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
                In-Stock Models Breakdown
              </span>
              <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                Only in-stock items
              </span>
            </div>

            {totalInStockModels === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400">
                <Package className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="font-semibold text-slate-700">No in-stock models currently available</p>
                <p className="mt-1">All models under "{selectedProduct}" have 0 quantity.</p>
              </div>
            ) : (
              <div className="p-4 space-y-4 max-h-60 overflow-y-auto bg-slate-50/50 font-sans">
                {Object.keys(groupedByBrand).map((brand) => (
                  <div key={brand} className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs">
                    <div className="text-xs font-black uppercase text-blue-900 mb-2 border-b border-slate-100 pb-1 flex items-center justify-between">
                      <span>{brand}</span>
                      <span className="text-[10px] text-slate-400 font-normal">
                        {groupedByBrand[brand].length} models
                      </span>
                    </div>

                    <div className="space-y-1.5 pl-1">
                      {groupedByBrand[brand].map((m, idx) => (
                        <div
                          key={m.id || idx}
                          className="flex items-center justify-between text-xs text-slate-800"
                        >
                          <div className="flex items-center gap-2 font-medium">
                            <span className="text-slate-400 font-mono">{idx + 1}.</span>
                            <span className="font-bold text-slate-900">{m.model || m.name}</span>
                          </div>
                          <span className="text-[11px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.2 rounded-full">
                            In Stock
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions: Copy Text & Download PDF */}
        <div className="flex flex-col sm:flex-row items-center gap-2.5 pt-4 border-t border-slate-100 mt-4 shrink-0">
          <button
            type="button"
            onClick={handleCopyMarketingText}
            disabled={totalInStockModels === 0}
            className={`w-full sm:flex-1 py-3 px-4 rounded-xl font-bold text-xs sm:text-sm border transition-all flex items-center justify-center gap-2 ${
              copied
                ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-300 shadow-xs'
            }`}
          >
            {copied ? (
              <>
                <Check className="w-4 h-4 text-emerald-600" />
                <span>✓ Copied Marketing Text!</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4 text-slate-500" />
                <span>Copy Marketing Text</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleDownloadPDF}
            disabled={totalInStockModels === 0}
            className="w-full sm:flex-1 py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs sm:text-sm rounded-xl shadow-md shadow-blue-600/25 active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            <span>Download PDF</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto px-5 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs sm:text-sm rounded-xl transition-colors"
          >
            Close
          </button>
        </div>
      </motion.div>
    </div>
  )
}
