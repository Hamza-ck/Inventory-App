/**
 * Unlimited On-Device OCR Engine
 * 
 * 100% in-browser WebAssembly LSTM OCR engine.
 * - Zero cloud API calls
 * - Zero cost
 * - Unlimited monthly scans (never blocked by cloud credit limits)
 * - Runs fully client-side on mobile and desktop browsers
 */

const OCR_SCRIPT_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js'
const FAST_LANG_PATH = 'https://cdn.jsdelivr.net/gh/naptha/tessdata@gh-pages/4.0.0_fast'

let workerInstance = null
let workerPromise = null

/**
 * Initializes and warms up the WebAssembly OCR worker.
 */
export async function getOnDeviceWorker(onProgress) {
  if (workerInstance) return workerInstance
  if (workerPromise) return workerPromise

  workerPromise = (async () => {
    if (typeof window === 'undefined') return null

    // Ensure Tesseract.js is loaded from CDN if not already in document
    if (!window.Tesseract) {
      await new Promise((resolve, reject) => {
        const existing = document.querySelector('script[data-inventory-ocr]')
        if (existing) {
          if (window.Tesseract) return resolve(window.Tesseract)
          existing.addEventListener('load', () => resolve(window.Tesseract), { once: true })
          existing.addEventListener('error', reject, { once: true })
          return
        }
        const script = document.createElement('script')
        script.src = OCR_SCRIPT_URL
        script.async = true
        script.dataset.inventoryOcr = 'true'
        script.onload = () => resolve(window.Tesseract)
        script.onerror = () => reject(new Error('Failed to load on-device OCR engine'))
        document.head.appendChild(script)
      })
    }

    const worker = await window.Tesseract.createWorker('eng', 1, {
      langPath: FAST_LANG_PATH,
      gzip: true,
      logger: (m) => {
        if (m?.status && onProgress) {
          const pct = typeof m.progress === 'number' ? Math.round(m.progress * 100) : null
          onProgress({ status: m.status, percent: pct })
        }
      },
    })

    // Configure worker for alphanumeric warehouse codes & labels
    await worker.setParameters({
      tessedit_pageseg_mode: '6', // Assume a single uniform block of text
      tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 -/_',
    })

    workerInstance = worker
    return worker
  })()

  return workerPromise
}

/**
 * Pre-warm the on-device worker in the background when the scanner mounts.
 */
export function preloadOnDeviceOcr() {
  if (typeof window === 'undefined') return
  getOnDeviceWorker().catch((err) => {
    console.warn('[OnDeviceOCR] Background warmup warning:', err.message)
  })
}

/**
 * Recognize text from a canvas or dataUrl using on-device WebAssembly.
 */
export async function recognizeOnDevice({ dataUrl, onProgress }) {
  const startTime = performance.now()
  const worker = await getOnDeviceWorker(onProgress)
  const result = await worker.recognize(dataUrl)
  const latencyMs = Math.round(performance.now() - startTime)

  return {
    rawText: result?.data?.text || '',
    latencyMs,
    engine: 'On-Device (Unlimited Free)',
    isCloud: false,
  }
}
