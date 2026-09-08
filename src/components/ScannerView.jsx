import { useEffect, useRef, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Zap, ZapOff, RefreshCw, AlertCircle, Camera, ScanText } from 'lucide-react'

// ─── Configuration ────────────────────────────────────────────────────────────
const OCR_SCRIPT_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js'
const OCR_INTERVAL_MS = 2200      // ms between auto OCR reads
const DUPLICATE_COOLDOWN_MS = 5000 // suppress re-emitting the same code
const OCR_CONSENSUS_NEEDED = 2     // require N consecutive matching reads

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
 * Prefers tokens that are 3-6 characters (typical model codes like V22, F31).
 */
function chooseCandidate(rawText) {
  if (!rawText) return null
  const source = normalizeText(rawText)

  // Split on any separator
  const pieces = source
    .split(/[\n|,;:/\\()\[\]{}<>]+/)
    .flatMap((line) => line.split(/\s+/))
    .map(compactText)
    .filter(isUsefulToken)

  const candidates = [...new Set(pieces)]
  if (candidates.length === 0) return null

  // Score: prefer 3-6 char tokens (V22, F31, G64, A6PRO), penalize very long ones
  candidates.sort((a, b) => {
    const idealLen = 4
    const aScore = Math.abs(a.length - idealLen) + (a.length > 10 ? 5 : 0)
    const bScore = Math.abs(b.length - idealLen) + (b.length > 10 ? 5 : 0)
    return aScore - bScore
  })

  return candidates[0]
}

/**
 * Quick hash of the video frame to skip OCR when the camera view hasn't changed.
 */
function makeFingerprint(video) {
  if (!video?.videoWidth || !video?.videoHeight) return null
  const canvas = document.createElement('canvas')
  canvas.width = 32
  canvas.height = 18
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data
  let hash = 0
  // Sample every 8th byte for more sensitivity to frame changes
  for (let i = 0; i < data.length; i += 8) {
    hash = (hash * 31 + data[i]) | 0
  }
  return hash
}

/**
 * Crop and preprocess the center of the video for OCR.
 * - Crops the scan window area (center region)
 * - Scales up 3x for better Tesseract accuracy
 * - Converts to high-contrast grayscale
 */
function buildOcrImage(video, mode = 'normal') {
  const width = video.videoWidth || 1280
  const height = video.videoHeight || 720

  // Crop a wide center region to capture the label
  const cropWidth = Math.floor(width * 0.78)
  const cropHeight = Math.floor(height * 0.36)
  const sx = Math.floor((width - cropWidth) / 2)
  const sy = Math.floor((height - cropHeight) / 2)
  const scale = 3

  const canvas = document.createElement('canvas')
  canvas.width = cropWidth * scale
  canvas.height = cropHeight * scale
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('Canvas context unavailable')

  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(video, sx, sy, cropWidth, cropHeight, 0, 0, canvas.width, canvas.height)

  // Apply contrast enhancement
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const d = image.data

  for (let i = 0; i < d.length; i += 4) {
    // Convert to grayscale using luminance formula
    const gray = Math.round(d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114)

    let value
    if (mode === 'threshold') {
      // Hard black/white threshold for high contrast labels
      value = gray > 140 ? 255 : 0
    } else if (mode === 'adaptive') {
      // Stretched contrast: push midtones toward extremes
      value = gray < 80 ? 0 : gray > 180 ? 255 : Math.round(((gray - 80) / 100) * 255)
    } else {
      value = gray
    }

    d[i] = value
    d[i + 1] = value
    d[i + 2] = value
    d[i + 3] = 255
  }
  ctx.putImageData(image, 0, 0)
  return canvas
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
  const ocrConsensusRef = useRef({ text: null, count: 0 })
  const lastCodeRef = useRef({ text: null, at: 0 })
  const lastOcrFingerprintRef = useRef(null)
  const barcodeFrameRef = useRef(null)
  const ocrTimerRef = useRef(null)
  const mountedRef = useRef(true)

  const [error, setError] = useState(null)
  const [hasTorch, setHasTorch] = useState(false)
  const [torchOn, setTorchOn] = useState(false)
  const [facingMode, setFacingMode] = useState('environment')
  const [isInitializing, setIsInitializing] = useState(true)
  const [isOcrRunning, setIsOcrRunning] = useState(false)
  const [ocrReady, setOcrReady] = useState(false)
  const [scannerHint, setScannerHint] = useState('Starting camera…')

  useEffect(() => { onScanRef.current = onScan }, [onScan])
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false } }, [])

  // ── Emit a detected code ────────────────────────────────────────────────
  const emitDetected = useCallback((value, source) => {
    const text = compactText(value)
    if (!text) return false
    const now = Date.now()
    if (lastCodeRef.current.text === text && now - lastCodeRef.current.at < DUPLICATE_COOLDOWN_MS) return false

    lastCodeRef.current = { text, at: now }
    setScannerHint(source === 'ocr' ? `✓ Read label: ${text}` : `✓ Scanned code: ${text}`)
    try { if (navigator.vibrate) navigator.vibrate(35) } catch {}
    onScanRef.current?.(text)
    return true
  }, [])

  // ── Create / reuse the Tesseract worker ─────────────────────────────────
  async function getOcrWorker(tesseract) {
    if (ocrWorkerRef.current) return ocrWorkerRef.current

    try {
      // Tesseract.js v5 API: createWorker(langs, oem, options)
      const worker = await tesseract.createWorker('eng', 1, {
        logger: () => {},
      })

      // Configure for single-word recognition of short model codes
      await worker.setParameters({
        tessedit_pageseg_mode: '7', // Treat image as a single text line
        tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789',
      })

      ocrWorkerRef.current = worker
      if (mountedRef.current) setOcrReady(true)
      return worker
    } catch (err) {
      console.error('[OCR] Worker creation failed:', err)
      throw err
    }
  }

  // ── Consensus logic: require N consecutive matching reads ───────────────
  function acceptOcrCandidate(candidate, confidence, manual) {
    if (!candidate) return false

    const current = ocrConsensusRef.current
    if (current.text === candidate) {
      current.count += 1
    } else {
      ocrConsensusRef.current = { text: candidate, count: 1 }
    }

    // Fast path for manual reads or high-confidence results.
    // Otherwise require N consecutive matching reads to filter OCR noise.
    const confirmed = manual || confidence >= 75 || ocrConsensusRef.current.count >= OCR_CONSENSUS_NEEDED

    if (!confirmed) {
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

    // Skip if the frame hasn't changed (saves CPU)
    const fingerprint = makeFingerprint(videoRef.current)
    if (!manual && fingerprint !== null && fingerprint === lastOcrFingerprintRef.current) return false

    ocrBusyRef.current = true
    if (mountedRef.current) setIsOcrRunning(true)
    if (manual) setScannerHint('Reading label…')

    try {
      const tesseract = await loadTesseract()
      if (!tesseract) throw new Error('OCR engine not available')

      const worker = await getOcrWorker(tesseract)

      // Pass 1: normal grayscale
      const normalImage = buildOcrImage(videoRef.current, 'normal')
      let result = await worker.recognize(normalImage)
      let candidate = chooseCandidate(result?.data?.text)
      let confidence = Number(result?.data?.confidence || 0)

      // Pass 2: adaptive contrast if pass 1 was weak
      if (!candidate || confidence < 55) {
        const adaptiveImage = buildOcrImage(videoRef.current, 'adaptive')
        result = await worker.recognize(adaptiveImage)
        const c2 = chooseCandidate(result?.data?.text)
        const conf2 = Number(result?.data?.confidence || 0)
        if (c2 && conf2 > confidence) {
          candidate = c2
          confidence = conf2
        }
      }

      // Pass 3: hard threshold if still weak
      if (!candidate || confidence < 50) {
        const threshImage = buildOcrImage(videoRef.current, 'threshold')
        result = await worker.recognize(threshImage)
        const c3 = chooseCandidate(result?.data?.text)
        const conf3 = Number(result?.data?.confidence || 0)
        if (c3 && conf3 > (confidence || 0)) {
          candidate = c3
          confidence = conf3
        }
      }

      lastOcrFingerprintRef.current = makeFingerprint(videoRef.current) ?? fingerprint

      if (!candidate || confidence < 35) {
        if (manual) setScannerHint('Could not read label — move closer and hold steady')
        return false
      }

      return acceptOcrCandidate(candidate, confidence, manual)
    } catch (err) {
      console.error('[OCR] Error:', err)
      if (manual && mountedRef.current) {
        setScannerHint(err?.message?.includes('CDN') || err?.message?.includes('load')
          ? 'OCR engine failed to load — check internet connection'
          : 'OCR failed. Try better lighting or hold camera steady.')
      }
      return false
    } finally {
      ocrBusyRef.current = false
      if (mountedRef.current) setIsOcrRunning(false)
    }
  }

  // ── Camera startup ──────────────────────────────────────────────────────
  useEffect(() => {
    let active = true
    setIsInitializing(true)
    setError(null)
    setTorchOn(false)
    setScannerHint('Starting camera…')
    lastOcrFingerprintRef.current = null

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

        const capabilities = typeof track.getCapabilities === 'function' ? track.getCapabilities() : {}
        setHasTorch(Boolean(capabilities?.torch))

        // Pre-load Tesseract in background (don't block camera)
        loadTesseract().then(() => {
          if (active) setScannerHint('Ready — point at label')
        }).catch((err) => {
          console.warn('[OCR] Pre-load failed:', err.message)
        })

        // Set up barcode detector if available
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
      await runOcr()
      if (active) ocrTimerRef.current = setTimeout(autoLoop, OCR_INTERVAL_MS)
    }

    // Delay first OCR run to let camera stabilize
    ocrTimerRef.current = setTimeout(autoLoop, 1500)

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
        <div className="absolute bottom-4 bg-slate-900/85 backdrop-blur-md px-3.5 py-1.5 rounded-full border border-white/10 text-white text-xs font-medium tracking-wide flex items-center gap-1.5 shadow-lg max-w-[90%]">
          <span className={`w-2 h-2 rounded-full shrink-0 ${isOcrRunning ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400 animate-pulse'}`} />
          <span className="truncate">{scannerHint}</span>
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
          <ScanText className="w-4 h-4" />
          {isOcrRunning ? 'Reading…' : 'Read now'}
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
