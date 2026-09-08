import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Zap, 
  ZapOff, 
  RefreshCw, 
  AlertCircle, 
  Camera, 
  Loader2, 
  Minimize2, 
  Maximize2,
  Sparkles,
  Key,
  X,
  Check
} from 'lucide-react'
import { recognizeWithIdefics3, getIdeficsConfig, saveIdeficsConfig } from '../lib/ideficsOcr'

// ─── Configuration ────────────────────────────────────────────────────────────
const OCR_INTERVAL_MS = 3200       // ms between auto Idefics3 reads (if token configured)
const DUPLICATE_COOLDOWN_MS = 4000 // suppress re-emitting the same code

// ─── Text & Garbage Filtering ─────────────────────────────────────────────────

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function compactText(value) {
  return normalizeText(value).replace(/[^a-z0-9]/gi, '').toUpperCase()
}

function isGarbageToken(token) {
  if (!token || token.length < 2 || token.length > 16) return true

  // Packaging seams or repeated pipes/1s/0s
  if (/^[I1lL|]+$/i.test(token)) return true
  if (/^[O0]+$/i.test(token)) return true
  if (/^(.)\1+$/.test(token)) return true

  // Must contain at least one Latin letter (A-Z) AND at least one digit (0-9)
  const hasLetter = /[A-Z]/.test(token)
  const hasDigit = /[0-9]/.test(token)
  if (!hasLetter || !hasDigit) return true

  // Reject unit quantities (e.g. 50PCS, 2MM, 10SET, 5KG)
  if (/^[0-9]{1,4}(PCS?|MM|CM|KG|SET|PACK|LOT|QTY)$/i.test(token)) return true

  return false
}

function isUsefulToken(value) {
  const text = compactText(value)
  return !isGarbageToken(text)
}

/**
 * Extract the best candidate model code from Idefics3 response text.
 */
function chooseCandidate(rawText) {
  if (!rawText) return null
  const source = normalizeText(rawText).toUpperCase()

  const lines = source.split(/[\r\n]+/).map((l) => l.trim()).filter(Boolean)
  const candidates = []

  // 1. Whole lines compacted
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

  // 3. Individual words
  const words = source
    .split(/[\s,;|/:_\\()[\]{}<>-]+/)
    .map(compactText)
    .filter(Boolean)

  for (const word of words) {
    if (isUsefulToken(word)) {
      candidates.push(word)
    }
  }

  // 4. Word pairs
  for (let i = 0; i < words.length - 1; i++) {
    const pair = words[i] + words[i + 1]
    if (isUsefulToken(pair)) {
      candidates.push(pair)
    }
  }

  const unique = [...new Set(candidates)]
  if (unique.length === 0) return null

  unique.sort((a, b) => {
    const idealLen = 4
    const aScore = Math.abs(a.length - idealLen) + (a.length > 8 ? 4 : 0)
    const bScore = Math.abs(b.length - idealLen) + (b.length > 8 ? 4 : 0)
    return aScore - bScore
  })

  return unique[0]
}

// ─── Image Processing ─────────────────────────────────────────────────────────

function buildOcrImage(video) {
  const width = video.videoWidth || 1280
  const height = video.videoHeight || 720

  // Focus center region matching the scan reticle
  const cropWidth = Math.floor(width * 0.52)
  const cropHeight = Math.floor(height * 0.36)
  const sx = Math.floor((width - cropWidth) / 2)
  const sy = Math.floor((height - cropHeight) / 2)

  // Target resolution for vision model ingestion
  const targetWidth = Math.min(512, cropWidth)
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

  return {
    canvas,
    dataUrl: canvas.toDataURL('image/jpeg', 0.90),
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ScannerView({ onScan }) {
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const trackRef = useRef(null)
  const barcodeDetectorRef = useRef(null)
  const onScanRef = useRef(onScan)
  const ocrBusyRef = useRef(false)
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
  const [isMinimized, setIsMinimized] = useState(false)

  // Idefics3 configuration modal state
  const [isConfigOpen, setIsConfigOpen] = useState(false)
  const [configDraft, setConfigDraft] = useState({ token: '', endpoint: '' })
  const [hasHfToken, setHasHfToken] = useState(() => getIdeficsConfig().hasToken)

  const ideficsConfig = useMemo(() => getIdeficsConfig(), [hasHfToken])

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
    setScannerHint(source === 'idefics' ? `✓ Idefics3: ${text}` : `✓ Scanned code: ${text}`)
    setLastRead(`Detected: ${text}`)
    try { if (navigator.vibrate) navigator.vibrate(50) } catch {}
    onScanRef.current?.(text)
    return true
  }, [])

  // ── Run Idefics3 OCR Pass ───────────────────────────────────────────────
  async function runIdeficsOcr({ manual = false } = {}) {
    if (ocrBusyRef.current) return false
    if (!videoRef.current || videoRef.current.readyState < 2) return false

    const currentConfig = getIdeficsConfig()
    if (!currentConfig.token && !currentConfig.endpoint.includes('localhost')) {
      if (manual) {
        setConfigDraft({ token: currentConfig.token, endpoint: currentConfig.endpoint })
        setIsConfigOpen(true)
        setScannerHint('Configure Hugging Face token for Idefics3')
      }
      return false
    }

    ocrBusyRef.current = true
    if (mountedRef.current) setIsOcrRunning(true)

    if (manual) {
      setShutterFlash(true)
      setTimeout(() => setShutterFlash(false), 220)
      setScannerHint('Analyzing with Idefics3 Vision AI…')
    }

    try {
      const { dataUrl } = buildOcrImage(videoRef.current)

      const result = await recognizeWithIdefics3({ dataUrl })
      const rawText = result.rawText || ''
      const candidate = chooseCandidate(rawText) || compactText(rawText)

      if (mountedRef.current) {
        setLastRead(
          candidate 
            ? `Idefics3: "${candidate}" (${result.latencyMs}ms)`
            : (rawText.trim() ? `Seen: "${rawText.slice(0, 18)}"` : '')
        )
      }

      if (!candidate || isGarbageToken(candidate)) {
        if (manual && mountedRef.current) {
          setScannerHint('No clear model code identified — align label & snap again')
        }
        return false
      }

      return emitDetected(candidate, 'idefics')
    } catch (err) {
      console.error('[Idefics3 OCR] Error:', err)
      if (mountedRef.current) {
        setScannerHint(err.message || 'Idefics3 vision call failed')
        if (err.message.includes('API key')) {
          setIsConfigOpen(true)
        }
      }
      return false
    } finally {
      ocrBusyRef.current = false
      if (mountedRef.current) setIsOcrRunning(false)
    }
  }

  useEffect(() => {
    runOcrRef.current = runIdeficsOcr
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

        try {
          const capabilities = typeof track.getCapabilities === 'function' ? track.getCapabilities() : {}
          setHasTorch(Boolean(capabilities?.torch))
          if (capabilities?.focusMode && Array.isArray(capabilities.focusMode) && capabilities.focusMode.includes('continuous')) {
            await track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] })
          }
        } catch {}

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
        setScannerHint('Align label in box & tap Snap')
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
    }
  }, [facingMode])

  // ── Barcode detection loop (Hardware QR/1D barcode) ─────────────────────
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

  // ── Auto OCR loop (if configured) ───────────────────────────────────────
  useEffect(() => {
    if (isInitializing || error) return undefined
    let active = true

    async function autoLoop() {
      if (!active) return
      // Auto run only if user has an active token configured
      const cfg = getIdeficsConfig()
      if (cfg.token) {
        await runOcrRef.current?.()
      }
      if (active) ocrTimerRef.current = setTimeout(autoLoop, OCR_INTERVAL_MS)
    }

    ocrTimerRef.current = setTimeout(autoLoop, 2500)

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

  function handleSaveConfig(e) {
    e.preventDefault()
    saveIdeficsConfig(configDraft)
    setHasHfToken(Boolean(configDraft.token))
    setIsConfigOpen(false)
    setScannerHint('Idefics3 token configured')
  }

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <>
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3 }}
        className={`relative w-full bg-slate-950 rounded-2xl sm:rounded-3xl overflow-hidden shadow-xl shadow-slate-900/10 border border-slate-800 mb-4 transition-all duration-300 ${
          isMinimized ? 'h-15' : 'h-48 sm:h-56'
        }`}
      >
        <video
          ref={videoRef}
          className={`w-full h-full object-cover block transition-opacity duration-200 ${isMinimized ? 'opacity-25' : 'opacity-100'}`}
          muted
          playsInline
          autoPlay
        />

        {/* Snapshot Shutter Flash Effect */}
        <AnimatePresence>
          {shutterFlash && !isMinimized && (
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
        {!isMinimized && (
          <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center">
            <div className="relative w-48 h-24 sm:w-56 sm:h-28 rounded-xl ring-[4000px] ring-black/50">
              <div className="absolute top-0 left-0 w-5 h-5 border-t-2 border-l-2 border-indigo-400 rounded-tl-lg" />
              <div className="absolute top-0 right-0 w-5 h-5 border-t-2 border-r-2 border-indigo-400 rounded-tr-lg" />
              <div className="absolute bottom-0 left-0 w-5 h-5 border-b-2 border-l-2 border-indigo-400 rounded-bl-lg" />
              <div className="absolute bottom-0 right-0 w-5 h-5 border-b-2 border-r-2 border-indigo-400 rounded-br-xl" />
              <motion.div
                animate={{ top: ['8%', '88%', '8%'], opacity: [0.25, 0.9, 0.25] }}
                transition={{ duration: 2.0, repeat: Infinity, ease: 'easeInOut' }}
                className="absolute left-2 right-2 h-0.5 bg-gradient-to-r from-transparent via-indigo-400 to-transparent shadow-[0_0_10px_#818cf8]"
              />
            </div>
          </div>
        )}

        {/* Top Controls Bar */}
        <div className="absolute top-2.5 left-2.5 right-2.5 flex items-center justify-between z-10 pointer-events-auto">
          <div className="flex items-center gap-1.5 max-w-[65%] sm:max-w-[70%]">
            <div className="bg-slate-900/85 backdrop-blur-md px-2.5 py-1 rounded-full border border-white/10 text-white text-[11px] font-medium flex items-center gap-1.5 shadow-md truncate">
              <span className={`w-2 h-2 rounded-full shrink-0 ${isOcrRunning ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400'}`} />
              <span className="truncate">{lastRead || scannerHint}</span>
            </div>

            {/* Idefics3 Engine Badge */}
            <button
              type="button"
              onClick={() => {
                const cfg = getIdeficsConfig()
                setConfigDraft({ token: cfg.token, endpoint: cfg.endpoint })
                setIsConfigOpen(true)
              }}
              title="Click to configure Idefics3 token or endpoint"
              className="hidden xs:flex bg-indigo-950/80 hover:bg-indigo-900/80 backdrop-blur-md px-2.5 py-0.5 rounded-full border border-indigo-500/30 text-[10px] text-indigo-300 items-center gap-1 shadow-sm shrink-0 transition-all cursor-pointer active:scale-95"
            >
              <Sparkles className="w-3 h-3 text-indigo-400" />
              <span className="font-semibold text-white">Idefics3 OCR</span>
              {!hasHfToken && <span className="text-[9px] text-amber-400 font-bold ml-0.5">Setup</span>}
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            {/* Quick Snap button in minimized mode */}
            {isMinimized && (
              <button
                type="button"
                onClick={() => runIdeficsOcr({ manual: true })}
                disabled={isOcrRunning || isInitializing || Boolean(error)}
                title="Snap with Idefics3"
                className="h-8 px-2.5 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-bold flex items-center gap-1 transition-all active:scale-95 shadow-md disabled:opacity-50"
              >
                {isOcrRunning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5" />}
                <span>Snap</span>
              </button>
            )}

            {/* Config Token Button */}
            <button
              type="button"
              onClick={() => {
                const cfg = getIdeficsConfig()
                setConfigDraft({ token: cfg.token, endpoint: cfg.endpoint })
                setIsConfigOpen(true)
              }}
              title="Configure Idefics3 API Key"
              className="w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center bg-slate-900/70 text-slate-200 backdrop-blur-md border border-white/20 hover:bg-slate-800/80 active:scale-95 transition-all shadow-md"
            >
              <Key className="w-4 h-4 text-indigo-300" />
            </button>

            {hasTorch && !isMinimized && (
              <button
                type="button"
                onClick={toggleTorch}
                title={torchOn ? 'Turn Flash Off' : 'Turn Flash On'}
                className={`w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center backdrop-blur-md border transition-all ${
                  torchOn
                    ? 'bg-amber-500 text-white border-amber-400 shadow-lg shadow-amber-500/30'
                    : 'bg-slate-900/70 text-slate-200 border-white/20 hover:bg-slate-800/80 active:scale-95'
                }`}
              >
                {torchOn ? <Zap className="w-4 h-4 fill-current" /> : <ZapOff className="w-4 h-4" />}
              </button>
            )}

            {!isMinimized && (
              <button
                type="button"
                onClick={flipCamera}
                title="Switch Camera"
                className="w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center bg-slate-900/70 text-slate-200 backdrop-blur-md border border-white/20 hover:bg-slate-800/80 active:scale-95 transition-all shadow-md"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            )}

            {/* Minimize / Maximize Viewport Toggle */}
            <button
              type="button"
              onClick={() => setIsMinimized((prev) => !prev)}
              title={isMinimized ? 'Expand Camera View' : 'Minimize Camera View'}
              className="w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center bg-slate-900/80 text-indigo-300 backdrop-blur-md border border-indigo-400/30 hover:bg-slate-800 active:scale-95 transition-all shadow-md"
            >
              {isMinimized ? <Maximize2 className="w-4 h-4" /> : <Minimize2 className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Snap & Read Button (When expanded) */}
        {!isMinimized && (
          <div className="absolute bottom-2.5 left-0 right-0 flex justify-center items-center pointer-events-auto z-10 px-4">
            <button
              type="button"
              onClick={() => runIdeficsOcr({ manual: true })}
              disabled={isOcrRunning || isInitializing || Boolean(error)}
              title="Analyze label with Idefics3 Vision Model"
              className="px-4 py-2 rounded-full bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 active:scale-95 text-white font-semibold text-xs flex items-center gap-2 shadow-xl shadow-indigo-950/50 border border-indigo-300/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isOcrRunning ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Idefics3 Reading…</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5 text-indigo-200" />
                  <span>Snap with Idefics3</span>
                </>
              )}
            </button>
          </div>
        )}

        {/* Initializing overlay */}
        {isInitializing && !error && (
          <div className="absolute inset-0 bg-slate-950 flex flex-col items-center justify-center p-4 text-center z-20">
            <div className="w-8 h-8 border-2 border-slate-700 border-t-indigo-400 rounded-full animate-spin mb-2" />
            <p className="text-slate-300 text-xs font-medium">Starting camera…</p>
          </div>
        )}

        {/* Error overlay */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-950/95 backdrop-blur-sm flex flex-col items-center justify-center p-4 text-center z-30"
            >
              <div className="w-10 h-10 rounded-full bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400 mb-2">
                <AlertCircle className="w-5 h-5" />
              </div>
              <h4 className="text-rose-400 font-semibold text-sm mb-1">Camera Unavailable</h4>
              <p className="text-slate-400 text-[11px] max-w-xs mb-3">{error}</p>
              <button
                type="button"
                onClick={retryCamera}
                className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold rounded-xl border border-slate-700 active:scale-95 transition-all flex items-center gap-1.5"
              >
                <Camera className="w-3 h-3" />
                Retry Camera
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Idefics3 API Settings Modal */}
      <AnimatePresence>
        {isConfigOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-md flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.94, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: 16 }}
              className="bg-white rounded-3xl p-5 sm:p-6 w-full max-w-md shadow-2xl border border-slate-200"
            >
              <div className="flex items-start justify-between mb-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Sparkles className="w-4 h-4 text-indigo-600" />
                    <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-600">Idefics3 OCR Setup</span>
                  </div>
                  <h3 className="text-xl font-black text-slate-900">Hugging Face Idefics3</h3>
                  <p className="text-xs text-slate-500 mt-1">
                    Powered by <span className="font-mono font-bold text-slate-700">{ideficsConfig.model}</span> for state-of-the-art visual label OCR.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsConfigOpen(false)}
                  className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-xl"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSaveConfig} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Hugging Face Access Token (free)
                  </label>
                  <input
                    type="password"
                    value={configDraft.token}
                    onChange={(e) => setConfigDraft({ ...configDraft, token: e.target.value })}
                    placeholder="hf_..."
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-600"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    Get your free token from{' '}
                    <a
                      href="https://huggingface.co/settings/tokens"
                      target="_blank"
                      rel="noreferrer"
                      className="text-indigo-600 hover:underline font-medium"
                    >
                      huggingface.co/settings/tokens
                    </a>
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Custom Endpoint (Optional)
                  </label>
                  <input
                    type="text"
                    value={configDraft.endpoint}
                    onChange={(e) => setConfigDraft({ ...configDraft, endpoint: e.target.value })}
                    placeholder={ideficsConfig.endpoint}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-600"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">
                    Leave blank to use default Hugging Face Serverless Inference Router.
                  </p>
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    type="submit"
                    className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-md transition-all active:scale-95 flex items-center justify-center gap-1.5"
                  >
                    <Check className="w-4 h-4" /> Save Configuration
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsConfigOpen(false)}
                    className="px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl transition-all"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
