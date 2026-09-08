import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Zap, ZapOff, RefreshCw, AlertCircle, Camera, Loader2 } from 'lucide-react'
import {
  recognizeText,
  getActiveEngineDetails,
  terminateOcrWorker,
  getUniversalWorker,
  OCR_ENGINE_TYPES,
  OCR_ENGINE_LABELS,
} from '../lib/ocrEngine'

// ─── Configuration ────────────────────────────────────────────────────────────
const OCR_INTERVAL_MS = 1600       // ms between auto OCR reads
const DUPLICATE_COOLDOWN_MS = 4000 // suppress re-emitting the same code

// ─── Text & Garbage Filtering ─────────────────────────────────────────────────

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function compactText(value) {
  return normalizeText(value).replace(/[^a-z0-9]/gi, '').toUpperCase()
}

/**
 * Strict check to reject OCR garbage (wood grain, plastic reflections, shadow lines).
 */
function isGarbageToken(token) {
  if (!token || token.length < 2 || token.length > 12) return true

  // Only 1s, Is, Ls, pipes (e.g. "II", "1I1", "|||") from packaging seams
  if (/^[I1lL|]+$/i.test(token)) return true

  // Only 0s and Os (e.g. "OO", "0O0")
  if (/^[O0]+$/i.test(token)) return true

  // Ambiguous 2-char pairs caused by reflection glare
  if (token.length === 2 && /^(I1|1I|O0|0O|S5|5S|Z2|2Z|B8|8B)$/i.test(token)) return true

  // Repetitive character strings e.g. "AAAA", "1111", "XXXX"
  if (/^(.)\1+$/.test(token)) return true

  // Must contain at least one Latin letter (A-Z) AND at least one digit (0-9)
  const hasLetter = /[A-Z]/.test(token)
  const hasDigit = /[0-9]/.test(token)
  if (!hasLetter || !hasDigit) return true

  // Reject packaging quantity/unit descriptors, not model codes
  // e.g. "50PCS", "2MM", "10SET", "1PC", "3PACK", "5KG"
  if (/^[0-9]{1,4}(PCS?|MM|CM|KG|SET|PACK|LOT|QTY)$/i.test(token)) return true

  // For 2-char tokens, reject if starts with ambiguous glare letters
  if (token.length === 2 && /^[IOLZ10]/i.test(token)) return true

  return false
}

/**
 * Check if a token looks like a valid model code (e.g. G64, V22, F31, A6PRO).
 */
function isUsefulToken(value) {
  const text = compactText(value)
  return !isGarbageToken(text)
}

/**
 * Extract the best model candidate from raw OCR text.
 * Prioritizes clean patterns like G64, V22, F31 and discards glare noise.
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

  // 2. Direct regex search for model pattern (1-3 letters + 1-4 digits + optional suffix)
  const modelRegex = /\b([A-Z]{1,3}\s*[-]?\s*[0-9]{1,4}[A-Z]{0,3})\b/g
  let match
  while ((match = modelRegex.exec(source)) !== null) {
    const cleaned = compactText(match[1])
    if (isUsefulToken(cleaned)) {
      candidates.push(cleaned)
    }
  }

  // 3. Split into words by common punctuation
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

// ─── Image Processing & Label Sticker Isolation ──────────────────────────────

/**
 * Detect the white rectangular sticker patch inside the scanned reticle area.
 * This cuts away the table wood grain, black phone case, and crimped plastic edges.
 */
function isolateLabelSticker(canvas) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return canvas

  const width = canvas.width
  const height = canvas.height
  const imgData = ctx.getImageData(0, 0, width, height)
  const d = imgData.data

  let minX = width
  let maxX = 0
  let minY = height
  let maxY = 0
  let whiteCount = 0

  // 3px sample grid for sub-millisecond execution
  const step = 3
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const idx = (y * width + x) * 4
      const r = d[idx]
      const g = d[idx + 1]
      const b = d[idx + 2]

      const lum = r * 0.299 + g * 0.587 + b * 0.114
      const sat = Math.max(r, g, b) - Math.min(r, g, b)

      // White label sticker is bright (lum > 165) and neutral (sat < 40)
      if (lum > 165 && sat < 40) {
        whiteCount++
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }

  const boxW = maxX - minX
  const boxH = maxY - minY

  // Check if a plausible sticker was found inside the center reticle
  if (whiteCount > 50 && boxW > 45 && boxH > 22 && boxW < width * 0.92 && boxH < height * 0.92) {
    const padX = 14
    const padY = 10
    const cropX = Math.max(0, minX - padX)
    const cropY = Math.max(0, minY - padY)
    const cropW = Math.min(width - cropX, boxW + padX * 2)
    const cropH = Math.min(height - cropY, boxH + padY * 2)

    const labelCanvas = document.createElement('canvas')
    labelCanvas.width = cropW
    labelCanvas.height = cropH
    const labelCtx = labelCanvas.getContext('2d', { willReadFrequently: true })
    if (labelCtx) {
      labelCtx.drawImage(canvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH)
      return labelCanvas
    }
  }

  return canvas
}

/**
 * Deepen black text and maximize contrast against white sticker paper.
 */
function enhanceContrast(canvas) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return canvas

  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const d = imgData.data

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
    // Push black text to 0 and white paper to 255
    if (val < 100) {
      val = Math.max(0, Math.round(val * 0.45))
    } else if (val > 140) {
      val = Math.min(255, Math.round(val * 1.2))
    }

    d[i] = val
    d[i + 1] = val
    d[i + 2] = val
    d[i + 3] = 255
  }

  ctx.putImageData(imgData, 0, 0)
  return canvas
}

/**
 * Estimate image sharpness via gradient variance (cheap Laplacian-style proxy).
 * Motion blur flattens edges, so a low score means the frame is too blurry to trust.
 */
function estimateSharpness(canvas) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return 0

  const { width, height } = canvas
  if (width < 3 || height < 3) return 0

  const imgData = ctx.getImageData(0, 0, width, height)
  const d = imgData.data

  let sum = 0
  let sumSq = 0
  let count = 0
  const step = 2

  for (let y = 1; y < height - 1; y += step) {
    for (let x = 1; x < width - 1; x += step) {
      const idx = (y * width + x) * 4
      const idxRight = (y * width + (x + 1)) * 4
      const idxDown = ((y + 1) * width + x) * 4

      const grad = Math.abs(d[idx] - d[idxRight]) + Math.abs(d[idx] - d[idxDown])
      sum += grad
      sumSq += grad * grad
      count++
    }
  }

  if (count === 0) return 0
  const mean = sum / count
  return Math.max(0, sumSq / count - mean * mean)
}

/**
 * Capture video frame snapshot, isolate label, enhance contrast, and export Data URL.
 * 100% on-device processing.
 */
function buildOcrImage(video) {
  const width = video.videoWidth || 1280
  const height = video.videoHeight || 720

  // Center crop matching the scan reticle with padding
  const cropWidth = Math.floor(width * 0.55)
  const cropHeight = Math.floor(height * 0.45)
  const sx = Math.floor((width - cropWidth) / 2)
  const sy = Math.floor((height - cropHeight) / 2)

  // Clamp target resolution for fast on-device recognition
  const targetWidth = Math.min(560, cropWidth)
  const scale = targetWidth / cropWidth
  const targetHeight = Math.round(cropHeight * scale)

  const initialCanvas = document.createElement('canvas')
  initialCanvas.width = targetWidth
  initialCanvas.height = targetHeight
  const initialCtx = initialCanvas.getContext('2d', { willReadFrequently: true })
  if (!initialCtx) throw new Error('Canvas context unavailable')

  initialCtx.imageSmoothingEnabled = true
  initialCtx.imageSmoothingQuality = 'high'
  initialCtx.drawImage(video, sx, sy, cropWidth, cropHeight, 0, 0, targetWidth, targetHeight)

  // Step 1: Isolate the white sticker from wood/phone case background
  const isolatedCanvas = isolateLabelSticker(initialCanvas)

  // Step 2: Apply high-contrast black/white enhancement
  const finalCanvas = enhanceContrast(isolatedCanvas)

  return {
    canvas: finalCanvas,
    dataUrl: finalCanvas.toDataURL('image/jpeg', 0.88),
    sharpness: estimateSharpness(finalCanvas),
  }
}

const MIN_SHARPNESS = 12 // frames below this are treated as motion-blurred

// ─── Component ────────────────────────────────────────────────────────────────

export default function ScannerView({ onScan }) {
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const trackRef = useRef(null)
  const barcodeDetectorRef = useRef(null)
  const onScanRef = useRef(onScan)
  const ocrBusyRef = useRef(false)
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
  const [scannerHint, setScannerHint] = useState('Starting camera…')
  const [lastRead, setLastRead] = useState('')
  const [shutterFlash, setShutterFlash] = useState(false)

  const engineDetails = useMemo(() => getActiveEngineDetails(), [])

  useEffect(() => { onScanRef.current = onScan }, [onScan])
  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  // ── Emit a detected code ────────────────────────────────────────────────
  const emitDetected = useCallback((value, source) => {
    const text = compactText(value)
    if (!text || isGarbageToken(text)) return false

    const now = Date.now()
    if (lastCodeRef.current.text === text && now - lastCodeRef.current.at < DUPLICATE_COOLDOWN_MS) return false

    lastCodeRef.current = { text, at: now }
    setScannerHint(source === 'ocr' ? `✓ Read label: ${text}` : `✓ Scanned code: ${text}`)
    setLastRead(`Detected: ${text}`)
    try { if (navigator.vibrate) navigator.vibrate(50) } catch {}
    onScanRef.current?.(text)
    return true
  }, [])

  // ── Consensus logic ────────────────────────────────────────────────────
  function acceptOcrCandidate(candidate, confidence, manual) {
    if (!candidate || isGarbageToken(candidate)) return false

    // Manual snapshot (deliberate user tap): accept immediately.
    // Auto scan: require the same candidate on two consecutive passes before queueing.
    const confirmed = manual || ocrConsensusRef.current.text === candidate

    if (!confirmed) {
      ocrConsensusRef.current = { text: candidate, count: 1 }
      setScannerHint(`Verifying: ${candidate}…`)
      return false
    }

    ocrConsensusRef.current = { text: null, count: 0 }
    return emitDetected(candidate, 'ocr')
  }

  // ── Run one OCR pass (Snap / Auto) via Unified Engine ───────────────────
  async function runOcr({ manual = false } = {}) {
    if (ocrBusyRef.current) return false
    if (!videoRef.current || videoRef.current.readyState < 2) return false

    ocrBusyRef.current = true
    if (mountedRef.current) setIsOcrRunning(true)

    if (manual) {
      // Trigger snapshot flash animation
      setShutterFlash(true)
      setTimeout(() => setShutterFlash(false), 220)
      setScannerHint('Reading snapshot…')
    }

    try {
      // Capture frame snapshot and isolate sticker
      const { canvas, dataUrl, sharpness } = buildOcrImage(videoRef.current)

      // Motion-blur guard: a smeared frame produces confident-but-wrong reads
      const isBlurry = sharpness < MIN_SHARPNESS
      if (isBlurry && !manual) {
        ocrConsensusRef.current = { text: null, count: 0 }
        if (mountedRef.current) setScannerHint('Hold camera steady on label…')
        return false
      }

      // Execute on-device OCR through the unified engine (Apple Vision -> Google ML Kit -> TextDetector -> WASM)
      const result = await recognizeText({
        canvas,
        dataUrl,
        onProgress: (p) => {
          if (!mountedRef.current) return
          if (p?.percent !== null) {
            setScannerHint(`Initializing OCR (${p.percent}%)…`)
          }
        },
      })

      const rawText = result?.text || ''
      const confidence = Number(result?.confidence || 0)
      const latencyMs = result?.latencyMs || 0
      const engineName = result?.engine ? (OCR_ENGINE_LABELS[result.engine]?.name || result.engine) : ''
      const candidate = chooseCandidate(rawText)

      if (mountedRef.current) {
        const blurNote = manual && isBlurry ? ' — blurry frame' : ''
        setLastRead(
          candidate
            ? `Read: "${candidate}" (${latencyMs}ms • ${engineName})${blurNote}`
            : (rawText.trim() && !isGarbageToken(compactText(rawText)) ? `Seen: "${rawText.trim().slice(0, 15)}" (${latencyMs}ms)` : '')
        )
      }

      if (!candidate) {
        if (manual && mountedRef.current) {
          setScannerHint('No clear model code found — align label & snap again')
        }
        return false
      }

      return acceptOcrCandidate(candidate, confidence, manual)
    } catch (err) {
      console.error('[OCR] Error:', err)
      if (mountedRef.current && manual) {
        setScannerHint('Could not read — align label & tap again')
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

        // Warm up universal WASM engine in background if it's the active engine
        if (engineDetails.type === OCR_ENGINE_TYPES.UNIVERSAL_WASM) {
          getUniversalWorker().catch((err) => {
            console.warn('[OCR Engine] Warmup note:', err.message)
          })
        }

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
        setScannerHint('Align white label in box')
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
      terminateOcrWorker().catch(() => {})
    }
  }, [facingMode, engineDetails.type])

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

  // ── Auto OCR loop (silent background pass) ───────────────────────────────
  useEffect(() => {
    if (isInitializing || error) return undefined
    let active = true

    async function autoLoop() {
      if (!active) return
      await runOcrRef.current?.()
      if (active) ocrTimerRef.current = setTimeout(autoLoop, OCR_INTERVAL_MS)
    }

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

      {/* Snapshot Shutter Flash Effect */}
      <AnimatePresence>
        {shutterFlash && (
          <motion.div
            initial={{ opacity: 0.85 }}
            animate={{ opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="absolute inset-0 bg-white pointer-events-none z-30"
          />
        )}
      </AnimatePresence>

      {/* Scan Reticle Overlay */}
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
      </div>

      {/* Top controls & OCR Engine Badge */}
      <div className="absolute top-3 left-3 right-3 flex items-start justify-between z-10 pointer-events-auto">
        <div className="flex flex-col gap-1.5 items-start max-w-[70%]">
          <div className="bg-slate-900/75 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10 text-white text-[11px] font-medium flex items-center gap-1.5 shadow-md">
            <span className={`w-2 h-2 rounded-full shrink-0 ${isOcrRunning ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400'}`} />
            <span className="truncate">{lastRead || scannerHint}</span>
          </div>

          {/* Active On-Device Engine Badge */}
          <div className="bg-slate-900/80 backdrop-blur-md px-2.5 py-0.5 rounded-full border border-white/10 text-[10px] text-slate-300 flex items-center gap-1.5 shadow-sm">
            <span className="w-1.5 h-1.5 rounded-full bg-sky-400 shrink-0" />
            <span className="font-semibold text-white">{engineDetails.badge}</span>
            <span className="text-slate-400 text-[9px] font-mono hidden sm:inline">({engineDetails.framework})</span>
          </div>
        </div>

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

      {/* Prominent Bottom "Snap & Read" Button */}
      <div className="absolute bottom-3.5 left-0 right-0 flex justify-center items-center pointer-events-auto z-10 px-4">
        <button
          type="button"
          onClick={() => runOcr({ manual: true })}
          disabled={isOcrRunning || isInitializing || Boolean(error)}
          title="Take sharp on-device snapshot & read text immediately"
          className="px-5 py-2.5 rounded-full bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 active:scale-95 text-white font-semibold text-xs flex items-center gap-2 shadow-xl shadow-sky-950/50 border border-sky-300/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isOcrRunning ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Analyzing…</span>
            </>
          ) : (
            <>
              <Camera className="w-4 h-4" />
              <span>Snap & Read Label</span>
            </>
          )}
        </button>
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
