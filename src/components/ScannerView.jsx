import { useEffect, useRef, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Zap, ZapOff, RefreshCw, AlertCircle, Camera, ScanText, Loader2 } from 'lucide-react'

// ─── Configuration ────────────────────────────────────────────────────────────
const OCR_SCRIPT_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js'
const FAST_LANG_PATH = 'https://cdn.jsdelivr.net/gh/naptha/tessdata@gh-pages/4.0.0_fast'
const OCR_INTERVAL_MS = 1600       // ms between auto OCR reads
const DUPLICATE_COOLDOWN_MS = 4000 // suppress re-emitting the same code

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function compactText(value) {
  return normalizeText(value).replace(/[^a-z0-9]/gi, '').toUpperCase()
}

/**
 * Check if a token looks like a model label (e.g. V22, F31, A6PRO, G64).
 * Must contain at least one letter and one digit, length 2-14.
 */
function isUsefulToken(value) {
  const text = compactText(value)
  if (text.length < 2 || text.length > 14) return false
  return /[A-Z]/.test(text) && /[0-9]/.test(text)
}

/**
 * Extract the best model-like candidate from raw OCR text.
 * Robust to whitespace inserted by plastic glare (e.g. "G 64" -> "G64").
 */
function chooseCandidate(rawText) {
  if (!rawText) return null
  const source = normalizeText(rawText).toUpperCase()

  const lines = source.split(/[\r\n]+/).map((l) => l.trim()).filter(Boolean)
  const candidates = []

  // 1. Check whole lines compacted (e.g. "G 64" -> "G64", "V 22" -> "V22")
  for (const line of lines) {
    const compacted = compactText(line)
    if (isUsefulToken(compacted)) {
      candidates.push(compacted)
    }
  }

  // 2. Direct regex search for common model pattern (e.g. G64, V22, F31, A6PRO, S23)
  const modelRegex = /\b([A-Z]{1,3}\s*[-]?\s*[0-9]{1,4}[A-Z]{0,3})\b/g
  let match
  while ((match = modelRegex.exec(source)) !== null) {
    const cleaned = compactText(match[1])
    if (isUsefulToken(cleaned)) {
      candidates.push(cleaned)
    }
  }

  // 3. Split into tokens by common separators
  const words = source
    .split(/[\s,;|/:_\\()[\]{}<>-]+/)
    .map(compactText)
    .filter(Boolean)

  for (const word of words) {
    if (isUsefulToken(word)) {
      candidates.push(word)
    }
  }

  // 4. Check adjacent word pairs (e.g. "G" + "64" -> "G64", "NOTE" + "10" -> "NOTE10")
  for (let i = 0; i < words.length - 1; i++) {
    const pair = words[i] + words[i + 1]
    if (isUsefulToken(pair)) {
      candidates.push(pair)
    }
  }

  const unique = [...new Set(candidates)]
  if (unique.length === 0) return null

  // Score: prefer 3-6 char tokens (V22, F31, G64, A6PRO), penalize very long ones
  unique.sort((a, b) => {
    const idealLen = 4
    const aScore = Math.abs(a.length - idealLen) + (a.length > 8 ? 4 : 0)
    const bScore = Math.abs(b.length - idealLen) + (b.length > 8 ? 4 : 0)
    return aScore - bScore
  })

  return unique[0]
}

/**
 * Timeout wrapper for promises to prevent infinite stalls on network or worker hangs.
 */
function withTimeout(promise, ms, message) {
  let timer = null
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message || `Timeout after ${ms}ms`)), ms)
  })
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer)
  })
}

/**
 * Crop and preprocess the center scan window area for fast, accurate OCR.
 * - Targets the exact reticle region
 * - Clamps max width to 560px for sub-200ms processing
 * - Returns a standard JPEG Data URL for reliable Web Worker ingestion
 */
function buildOcrImage(video) {
  const width = video.videoWidth || 1280
  const height = video.videoHeight || 720

  // Center crop matching the scan reticle with padding
  const cropWidth = Math.floor(width * 0.55)
  const cropHeight = Math.floor(height * 0.45)
  const sx = Math.floor((width - cropWidth) / 2)
  const sy = Math.floor((height - cropHeight) / 2)

  // Clamp target resolution for fast LSTM recognition
  const targetWidth = Math.min(560, cropWidth)
  const scale = targetWidth / cropWidth
  const targetHeight = Math.round(cropHeight * scale)

  const canvas = document.createElement('canvas')
  canvas.width = targetWidth
  canvas.height = targetHeight
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('Canvas context unavailable')

  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(video, sx, sy, cropWidth, cropHeight, 0, 0, targetWidth, targetHeight)

  // Grayscale & contrast stretch
  const image = ctx.getImageData(0, 0, targetWidth, targetHeight)
  const d = image.data

  let minLum = 255
  let maxLum = 0
  const lums = new Uint8Array(d.length / 4)

  for (let i = 0, j = 0; i < d.length; i += 4, j++) {
    const lum = Math.round(d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114)
    lums[j] = lum
    if (lum < minLum) minLum = lum
    if (lum > maxLum) maxLum = lum
  }

  const range = maxLum - minLum
  const canStretch = range > 35

  for (let i = 0, j = 0; i < d.length; i += 4, j++) {
    let val = lums[j]
    if (canStretch) {
      val = Math.round(((val - minLum) / range) * 255)
    }
    // Deepen dark text and brighten paper background
    if (val < 95) {
      val = Math.max(0, Math.round(val * 0.5))
    } else if (val > 150) {
      val = Math.min(255, Math.round(val * 1.15))
    }

    d[i] = val
    d[i + 1] = val
    d[i + 2] = val
    d[i + 3] = 255
  }

  ctx.putImageData(image, 0, 0)
  // Convert to Data URL: fixes worker postMessage serialization issues with raw canvas
  return canvas.toDataURL('image/jpeg', 0.85)
}

// ─── Tesseract Loader ─────────────────────────────────────────────────────────

let tesseractLoadPromise = null

async function loadTesseract() {
  if (typeof window === 'undefined') return null
  if (window.Tesseract) return window.Tesseract
  if (tesseractLoadPromise) return tesseractLoadPromise

  tesseractLoadPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-inventory-tesseract]')
    if (existing) {
      if (window.Tesseract) {
        resolve(window.Tesseract)
        return
      }
      existing.addEventListener('load', () => resolve(window.Tesseract), { once: true })
      existing.addEventListener('error', () => reject(new Error('OCR script failed to load')), { once: true })
      return
    }

    const script = document.createElement('script')
    script.src = OCR_SCRIPT_URL
    script.async = true
    script.dataset.inventoryTesseract = 'true'
    script.onload = () => {
      if (window.Tesseract) {
        resolve(window.Tesseract)
      } else {
        reject(new Error('Tesseract loaded but not available on window'))
      }
    }
    script.onerror = () => reject(new Error('Failed to load OCR engine from CDN'))
    document.head.appendChild(script)
  })

  return tesseractLoadPromise
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ScannerView({ onScan }) {
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const trackRef = useRef(null)
  const barcodeDetectorRef = useRef(null)
  const onScanRef = useRef(onScan)
  const ocrBusyRef = useRef(false)
  const ocrWorkerRef = useRef(null)
  const workerInitPromiseRef = useRef(null)
  const ocrConsensusRef = useRef({ text: null, count: 0 })
  const lastCodeRef = useRef({ text: null, at: 0 })
  const barcodeFrameRef = useRef(null)
  const ocrTimerRef = useRef(null)
  const runOcrRef = useRef(null)
  const mountedRef = useRef(true)

  const [error, setError] = useState(null)
  const [hasTorch, setHasTorch] = useState(false)
  const [torchOn, setTorchOn] = useState(false)
  const [facingMode, setFacingMode] = useState('environment')
  const [isInitializing, setIsInitializing] = useState(true)
  const [isOcrRunning, setIsOcrRunning] = useState(false)
  const [, setOcrReady] = useState(false)
  const [scannerHint, setScannerHint] = useState('Starting camera…')
  const [lastRead, setLastRead] = useState('')

  useEffect(() => { onScanRef.current = onScan }, [onScan])
  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  // ── Emit a detected code ────────────────────────────────────────────────
  const emitDetected = useCallback((value, source) => {
    const text = compactText(value)
    if (!text) return false
    const now = Date.now()
    if (lastCodeRef.current.text === text && now - lastCodeRef.current.at < DUPLICATE_COOLDOWN_MS) return false

    lastCodeRef.current = { text, at: now }
    setScannerHint(source === 'ocr' ? `✓ Read label: ${text}` : `✓ Scanned code: ${text}`)
    setLastRead(`Detected: ${text}`)
    try { if (navigator.vibrate) navigator.vibrate(45) } catch {}
    onScanRef.current?.(text)
    return true
  }, [])

  // ── Create / reuse the Tesseract worker ─────────────────────────────────
  async function getOcrWorker(tesseract) {
    if (ocrWorkerRef.current) return ocrWorkerRef.current
    if (workerInitPromiseRef.current) return workerInitPromiseRef.current

    workerInitPromiseRef.current = (async () => {
      try {
        if (mountedRef.current) setScannerHint('Loading OCR engine…')

        const createPromise = tesseract.createWorker('eng', 1, {
          langPath: FAST_LANG_PATH,
          gzip: true,
          logger: (m) => {
            if (!mountedRef.current) return
            if (m?.status) {
              const pct = typeof m.progress === 'number' ? Math.round(m.progress * 100) : null
              if (m.status.includes('loading') || m.status.includes('downloading')) {
                setScannerHint(pct !== null ? `Loading OCR model (${pct}%)…` : 'Loading OCR model…')
              } else if (m.status.includes('init')) {
                setScannerHint('Initializing OCR…')
              }
            }
          },
        })

        const worker = await withTimeout(createPromise, 15000, 'OCR engine setup timed out')

        await worker.setParameters({
          tessedit_pageseg_mode: '6', // Assume a single uniform block of text
          tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 -/',
        })

        ocrWorkerRef.current = worker
        if (mountedRef.current) {
          setOcrReady(true)
          setScannerHint('Point at the printed model label')
        }
        return worker
      } catch (err) {
        console.error('[OCR] Worker creation failed:', err)
        workerInitPromiseRef.current = null
        throw err
      }
    })()

    return workerInitPromiseRef.current
  }

  // ── Consensus logic ────────────────────────────────────────────────────
  function acceptOcrCandidate(candidate, confidence, manual) {
    if (!candidate) return false

    // Manual tap or reasonable confidence: accept immediately
    const confirmed = manual || confidence >= 30 || ocrConsensusRef.current.text === candidate

    if (!confirmed) {
      ocrConsensusRef.current = { text: candidate, count: 1 }
      setScannerHint(`Verifying: ${candidate}…`)
      return false
    }

    ocrConsensusRef.current = { text: null, count: 0 }
    return emitDetected(candidate, 'ocr')
  }

  // ── Run one OCR pass ───────────────────────────────────────────────────
  async function runOcr({ manual = false } = {}) {
    if (ocrBusyRef.current) return false
    if (!videoRef.current || videoRef.current.readyState < 2) return false

    ocrBusyRef.current = true
    if (mountedRef.current) setIsOcrRunning(true)
    if (manual) setScannerHint('Reading label…')

    try {
      const tesseract = await withTimeout(loadTesseract(), 8000, 'OCR engine load timed out')
      if (!tesseract) throw new Error('OCR engine not available')

      const worker = await getOcrWorker(tesseract)
      if (!worker) throw new Error('OCR worker unavailable')

      const dataUrl = buildOcrImage(videoRef.current)
      const recognizePromise = worker.recognize(dataUrl)
      const result = await withTimeout(recognizePromise, 5000, 'OCR recognition timed out')

      const rawText = result?.data?.text || ''
      const confidence = Number(result?.data?.confidence || 0)
      const candidate = chooseCandidate(rawText)

      if (mountedRef.current) {
        setLastRead(
          candidate
            ? `Read: "${candidate}" (${Math.round(confidence)}%)`
            : (rawText.trim() ? `Seen: "${rawText.trim().slice(0, 15)}"` : 'No text seen')
        )
      }

      if (!candidate) {
        if (manual && mountedRef.current) {
          setScannerHint('Could not read label — align in center box')
        }
        return false
      }

      return acceptOcrCandidate(candidate, confidence, manual)
    } catch (err) {
      console.error('[OCR] Error:', err)
      if (mountedRef.current) {
        setLastRead(`OCR note: ${err.message || 'scan retrying'}`)
        if (manual) {
          setScannerHint('Could not read — check lighting & hold steady')
        }
      }
      return false
    } finally {
      ocrBusyRef.current = false
      if (mountedRef.current) setIsOcrRunning(false)
    }
  }

  useEffect(() => {
    runOcrRef.current = runOcr
  })

  // ── Camera startup ──────────────────────────────────────────────────────
  useEffect(() => {
    let active = true
    setIsInitializing(true)
    setError(null)
    setTorchOn(false)
    setScannerHint('Starting camera…')

    async function startCamera() {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error('Camera access is not supported by this browser.')
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: facingMode },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        })

        if (!active) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }

        streamRef.current = stream
        const track = stream.getVideoTracks()[0]
        trackRef.current = track

        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play()
        }

        // Enable autofocus if supported on device
        try {
          const capabilities = typeof track.getCapabilities === 'function' ? track.getCapabilities() : {}
          setHasTorch(Boolean(capabilities?.torch))
          if (capabilities?.focusMode && Array.isArray(capabilities.focusMode) && capabilities.focusMode.includes('continuous')) {
            await track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] })
          }
        } catch {}

        // Pre-load Tesseract in background
        loadTesseract()
          .then((tess) => {
            if (active && tess) {
              getOcrWorker(tess).catch(() => {})
            }
          })
          .catch((err) => {
            console.warn('[OCR] Pre-load failed:', err.message)
          })

        // Set up native barcode detector if available
        if ('BarcodeDetector' in window) {
          try {
            const supported = typeof window.BarcodeDetector.getSupportedFormats === 'function'
              ? await window.BarcodeDetector.getSupportedFormats()
              : []
            const preferred = ['qr_code', 'code_128', 'code_39', 'code_93', 'ean_13', 'ean_8', 'upc_a', 'upc_e', 'itf', 'codabar', 'data_matrix', 'pdf417', 'aztec']
            const formats = supported.filter((f) => preferred.includes(f))
            barcodeDetectorRef.current = formats.length
              ? new window.BarcodeDetector({ formats })
              : new window.BarcodeDetector()
          } catch {
            barcodeDetectorRef.current = null
          }
        }

        setIsInitializing(false)
        setScannerHint('Point at the printed model label')
      } catch (err) {
        if (!active) return
        console.error('[Camera] Start error:', err)
        setIsInitializing(false)
        setError(err?.message || 'Camera permission denied or unavailable.')
      }
    }

    startCamera()

    return () => {
      active = false
      if (barcodeFrameRef.current) cancelAnimationFrame(barcodeFrameRef.current)
      if (ocrTimerRef.current) clearTimeout(ocrTimerRef.current)
      barcodeFrameRef.current = null
      ocrTimerRef.current = null
      barcodeDetectorRef.current = null
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
      trackRef.current = null
      ocrConsensusRef.current = { text: null, count: 0 }
      const worker = ocrWorkerRef.current
      ocrWorkerRef.current = null
      workerInitPromiseRef.current = null
      if (worker?.terminate) worker.terminate().catch(() => {})
    }
  }, [facingMode])

  // ── Barcode detection loop (native browser API) ─────────────────────────
  useEffect(() => {
    let active = true
    let busy = false

    async function loop() {
      if (!active) return
      if (!barcodeDetectorRef.current || !videoRef.current || videoRef.current.readyState < 2) {
        barcodeFrameRef.current = requestAnimationFrame(loop)
        return
      }
      if (busy) {
        barcodeFrameRef.current = requestAnimationFrame(loop)
        return
      }
      busy = true
      try {
        const results = await barcodeDetectorRef.current.detect(videoRef.current)
        const match = results?.find((item) => compactText(item.rawValue))
        if (match?.rawValue) emitDetected(match.rawValue, 'barcode')
      } catch {}
      busy = false
      if (active) barcodeFrameRef.current = requestAnimationFrame(loop)
    }

    if (!isInitializing && !error) {
      barcodeFrameRef.current = requestAnimationFrame(loop)
    }

    return () => {
      active = false
      if (barcodeFrameRef.current) cancelAnimationFrame(barcodeFrameRef.current)
    }
  }, [isInitializing, error, emitDetected])

  // ── Auto OCR loop ──────────────────────────────────────────────────────
  useEffect(() => {
    if (isInitializing || error) return undefined
    let active = true

    async function autoLoop() {
      if (!active) return
      await runOcrRef.current?.()
      if (active) ocrTimerRef.current = setTimeout(autoLoop, OCR_INTERVAL_MS)
    }

    // Delay first auto-OCR run to let camera focus stabilize
    ocrTimerRef.current = setTimeout(autoLoop, 1200)

    return () => {
      active = false
      if (ocrTimerRef.current) clearTimeout(ocrTimerRef.current)
      ocrTimerRef.current = null
    }
  }, [isInitializing, error, facingMode])

  // ── Controls ────────────────────────────────────────────────────────────
  async function toggleTorch() {
    const track = trackRef.current
    if (!track?.applyConstraints) return
    try {
      const next = !torchOn
      await track.applyConstraints({ advanced: [{ torch: next }] })
      setTorchOn(next)
    } catch (err) {
      console.warn('[Torch] Toggle failed:', err)
    }
  }

  function flipCamera() {
    setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'))
  }

  function retryCamera() {
    setError(null)
    setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'))
    setTimeout(() => setFacingMode('environment'), 100)
  }

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3 }}
      className="relative w-full aspect-[4/3] sm:aspect-[16/10] bg-slate-950 rounded-2xl md:rounded-3xl overflow-hidden shadow-xl shadow-slate-900/10 border border-slate-800 mb-6"
    >
      <video ref={videoRef} className="w-full h-full object-cover block" muted playsInline autoPlay />

      {/* Scan overlay */}
      <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center">
        <div className="relative w-48 h-48 sm:w-56 sm:h-56 rounded-2xl ring-[4000px] ring-black/50">
          <div className="absolute top-0 left-0 w-7 h-7 border-t-3 border-l-3 border-sky-400 rounded-tl-xl" />
          <div className="absolute top-0 right-0 w-7 h-7 border-t-3 border-r-3 border-sky-400 rounded-tr-xl" />
          <div className="absolute bottom-0 left-0 w-7 h-7 border-b-3 border-l-3 border-sky-400 rounded-bl-xl" />
          <div className="absolute bottom-0 right-0 w-7 h-7 border-b-3 border-r-3 border-sky-400 rounded-br-xl" />
          <motion.div
            animate={{ top: ['5%', '92%', '5%'], opacity: [0.25, 0.9, 0.25] }}
            transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
            className="absolute left-2 right-2 h-0.5 bg-gradient-to-r from-transparent via-sky-400 to-transparent shadow-[0_0_12px_#38bdf8]"
          />
        </div>
        <div className="absolute bottom-3 bg-slate-900/90 backdrop-blur-md px-3.5 py-1.5 rounded-full border border-white/10 text-white text-xs font-medium tracking-wide flex items-center gap-1.5 shadow-lg max-w-[92%]">
          <span className={`w-2 h-2 rounded-full shrink-0 ${isOcrRunning ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400 animate-pulse'}`} />
          <span className="truncate">
            {scannerHint}
            {lastRead ? ` • ${lastRead}` : ''}
          </span>
        </div>
      </div>

      {/* Top controls */}
      <div className="absolute top-3 left-3 right-3 flex items-center justify-between z-10 pointer-events-auto">
        <button
          type="button"
          onClick={() => runOcr({ manual: true })}
          disabled={isOcrRunning || isInitializing || Boolean(error)}
          title="Read printed model text now"
          className="h-10 px-3 rounded-full flex items-center justify-center gap-1.5 bg-slate-900/70 text-slate-100 backdrop-blur-md border border-white/20 hover:bg-slate-800/80 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md text-xs font-semibold"
        >
          {isOcrRunning ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin text-sky-400" />
              <span>Reading…</span>
            </>
          ) : (
            <>
              <ScanText className="w-4 h-4" />
              <span>Read now</span>
            </>
          )}
        </button>

        <div className="flex items-center gap-2">
          {hasTorch && (
            <button
              type="button"
              onClick={toggleTorch}
              title={torchOn ? 'Turn Flash Off' : 'Turn Flash On'}
              className={`w-10 h-10 rounded-full flex items-center justify-center backdrop-blur-md border transition-all ${
                torchOn
                  ? 'bg-amber-500 text-white border-amber-400 shadow-lg shadow-amber-500/30'
                  : 'bg-slate-900/70 text-slate-200 border-white/20 hover:bg-slate-800/80 active:scale-95'
              }`}
            >
              {torchOn ? <Zap className="w-5 h-5 fill-current" /> : <ZapOff className="w-5 h-5" />}
            </button>
          )}
          <button
            type="button"
            onClick={flipCamera}
            title="Switch Camera"
            className="w-10 h-10 rounded-full flex items-center justify-center bg-slate-900/70 text-slate-200 backdrop-blur-md border border-white/20 hover:bg-slate-800/80 active:scale-95 transition-all shadow-md"
          >
            <RefreshCw className="w-4.5 h-4.5" />
          </button>
        </div>
      </div>

      {/* Initializing overlay */}
      {isInitializing && !error && (
        <div className="absolute inset-0 bg-slate-950 flex flex-col items-center justify-center p-4 text-center z-20">
          <div className="w-10 h-10 border-3 border-slate-700 border-t-sky-400 rounded-full animate-spin mb-3" />
          <p className="text-slate-300 text-sm font-medium">Starting camera…</p>
        </div>
      )}

      {/* Error overlay */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-slate-950/95 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center z-30"
          >
            <div className="w-12 h-12 rounded-full bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400 mb-3">
              <AlertCircle className="w-6 h-6" />
            </div>
            <h4 className="text-rose-400 font-semibold text-base mb-1">Camera Feed Unavailable</h4>
            <p className="text-slate-400 text-xs max-w-xs mb-4">{error}</p>
            <button
              type="button"
              onClick={retryCamera}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold rounded-xl border border-slate-700 active:scale-95 transition-all flex items-center gap-1.5"
            >
              <Camera className="w-3.5 h-3.5" />
              Retry Camera
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
