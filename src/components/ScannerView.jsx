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
  Settings2,
  X,
  Check,
  RotateCcw
} from 'lucide-react'
import { 
  recognizeLabel, 
  getIdeficsConfig, 
  saveIdeficsConfig, 
  clearQuotaExhausted, 
  MODELS 
} from '../lib/ideficsOcr'
import { preloadOnDeviceOcr } from '../lib/onDeviceOcr'

// ─── Configuration ────────────────────────────────────────────────────────────
const DUPLICATE_COOLDOWN_MS = 3500 // suppress re-emitting the same code

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
 * Extract the best candidate model code from OCR / Vision response text.
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
  const cropWidth = Math.floor(width * 0.60)
  const cropHeight = Math.floor(height * 0.40)
  const sx = Math.floor((width - cropWidth) / 2)
  const sy = Math.floor((height - cropHeight) / 2)

  // Target crisp resolution for high-accuracy OCR
  const targetWidth = Math.min(800, cropWidth)
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
    dataUrl: canvas.toDataURL('image/jpeg', 0.92),
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
  const [quotaNotice, setQuotaNotice] = useState(false)

  // OCR configuration modal state
  const [isConfigOpen, setIsConfigOpen] = useState(false)
  const [configDraft, setConfigDraft] = useState({ token: '', endpoint: '', model: '', engine: 'auto' })
  const [configVersion, setConfigVersion] = useState(0)

  const ideficsConfig = useMemo(() => {
    void configVersion
    return getIdeficsConfig()
  }, [configVersion])

  useEffect(() => { onScanRef.current = onScan }, [onScan])

  useEffect(() => {
    mountedRef.current = true
    // Warm up the on-device WebAssembly OCR engine immediately in background
    preloadOnDeviceOcr()
    if (ideficsConfig.isQuotaExhausted) {
      setQuotaNotice(true)
    }
    return () => { mountedRef.current = false }
  }, [ideficsConfig.isQuotaExhausted])

  // ── Emit a detected code ────────────────────────────────────────────────
  const emitDetected = useCallback((value, source) => {
    const text = compactText(value)
    if (!text || isGarbageToken(text)) return false

    const now = Date.now()
    if (lastCodeRef.current.text === text && now - lastCodeRef.current.at < DUPLICATE_COOLDOWN_MS) return false

    lastCodeRef.current = { text, at: now }
    setScannerHint(source === 'barcode' ? `✓ Barcode: ${text}` : `✓ OCR: ${text}`)
    setLastRead(`Detected: ${text}`)
    try { if (navigator.vibrate) navigator.vibrate(50) } catch {}
    onScanRef.current?.(text)
    return true
  }, [])

  // ── Run OCR Pass (Auto Failover to On-Device if Quota Exhausted) ────────
  async function runOcr({ manual = false, forceCloud = false } = {}) {
    if (ocrBusyRef.current) return false
    if (!videoRef.current || videoRef.current.readyState < 2) return false

    ocrBusyRef.current = true
    if (mountedRef.current) setIsOcrRunning(true)

    if (manual) {
      setShutterFlash(true)
      setTimeout(() => setShutterFlash(false), 220)
      setScannerHint('Scanning label…')
    }

    try {
      const { dataUrl } = buildOcrImage(videoRef.current)

      const result = await recognizeLabel({ 
        dataUrl, 
        forceCloud,
        onProgress: (p) => {
          if (manual && mountedRef.current && p.status === 'recognizing text') {
            setScannerHint(`Reading text… ${p.percent !== null ? p.percent + '%' : ''}`)
          }
        }
      })

      const rawText = result.rawText || ''
      const candidate = chooseCandidate(rawText) || compactText(rawText)

      if (mountedRef.current) {
        if (result.quotaExhausted) {
          setQuotaNotice(true)
        }
        const engineLabel = result.isCloud ? 'AI' : '⚡ On-Device'
        setLastRead(
          candidate 
            ? `${engineLabel}: "${candidate}" (${result.latencyMs}ms)`
            : (rawText.trim() ? `Seen: "${rawText.slice(0, 18)}"` : '')
        )
      }

      if (!candidate || isGarbageToken(candidate)) {
        if (manual && mountedRef.current) {
          setScannerHint('No clear model code identified — align label & snap again')
        }
        return false
      }

      return emitDetected(candidate, result.isCloud ? 'vision' : 'on-device')
    } catch (err) {
      console.error('[OCR] Error:', err)
      if (mountedRef.current) {
        setScannerHint(err.message || 'OCR read failed')
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

        // Native Hardware Barcode Detector (Runs locally at 0 cost / 60 FPS)
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
        setScannerHint('Align code & tap Snap to read')
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
      barcodeFrameRef.current = null
      barcodeDetectorRef.current = null
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
      trackRef.current = null
    }
  }, [facingMode])

  // ── Hardware Barcode Detection Loop (Zero cloud API calls, 100% on-device) ─
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

  function openConfig() {
    const cfg = getIdeficsConfig()
    setConfigDraft({
      token: cfg.token,
      endpoint: cfg.endpoint,
      model: cfg.model,
      engine: cfg.engine,
    })
    setIsConfigOpen(true)
  }

  function handleSaveConfig(e) {
    e.preventDefault()
    saveIdeficsConfig(configDraft)
    setConfigVersion((v) => v + 1)
    setIsConfigOpen(false)
    setScannerHint('OCR settings updated')
  }

  function handleResetQuota() {
    clearQuotaExhausted()
    setQuotaNotice(false)
    setConfigVersion((v) => v + 1)
    setScannerHint('Quota status reset — testing Cloud Vision AI')
    runOcr({ manual: true, forceCloud: true })
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

            {/* Active Engine Badge */}
            {quotaNotice || ideficsConfig.isQuotaExhausted ? (
              <button
                type="button"
                onClick={openConfig}
                title="Hugging Face credits exhausted. Operating in Unlimited On-Device mode."
                className="hidden xs:flex bg-amber-950/80 hover:bg-amber-900/80 backdrop-blur-md px-2 py-0.5 rounded-full border border-amber-500/40 text-[10px] text-amber-300 items-center gap-1 shadow-sm shrink-0 transition-all cursor-pointer active:scale-95"
              >
                <Zap className="w-3 h-3 text-amber-400 fill-amber-400" />
                <span className="font-bold text-amber-200">On-Device Mode</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={openConfig}
                title="Click to configure OCR Engine & Vision AI"
                className="hidden xs:flex bg-indigo-950/80 hover:bg-indigo-900/80 backdrop-blur-md px-2.5 py-0.5 rounded-full border border-indigo-500/30 text-[10px] text-indigo-300 items-center gap-1 shadow-sm shrink-0 transition-all cursor-pointer active:scale-95"
              >
                {ideficsConfig.engine === 'ondevice' ? (
                  <>
                    <Zap className="w-3 h-3 text-emerald-400 fill-emerald-400" />
                    <span className="font-semibold text-white">On-Device</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3 h-3 text-indigo-400" />
                    <span className="font-semibold text-white">Vision AI</span>
                  </>
                )}
              </button>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            {/* Quick Snap button in minimized mode */}
            {isMinimized && (
              <button
                type="button"
                onClick={() => runOcr({ manual: true })}
                disabled={isOcrRunning || isInitializing || Boolean(error)}
                title="Snap label"
                className="h-8 px-2.5 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-bold flex items-center gap-1 transition-all active:scale-95 shadow-md disabled:opacity-50"
              >
                {isOcrRunning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5" />}
                <span>Snap</span>
              </button>
            )}

            {/* OCR Settings Button */}
            <button
              type="button"
              onClick={openConfig}
              title="Scanner & OCR Engine Settings"
              className="w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center bg-slate-900/70 text-slate-200 backdrop-blur-md border border-white/20 hover:bg-slate-800/80 active:scale-95 transition-all shadow-md"
            >
              <Settings2 className="w-4 h-4 text-indigo-300" />
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
              onClick={() => runOcr({ manual: true })}
              disabled={isOcrRunning || isInitializing || Boolean(error)}
              title="Snap and read label code"
              className="px-5 py-2 rounded-full bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 active:scale-95 text-white font-semibold text-xs flex items-center gap-2 shadow-xl shadow-indigo-950/50 border border-indigo-300/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isOcrRunning ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Reading Label…</span>
                </>
              ) : (
                <>
                  <Camera className="w-3.5 h-3.5 text-indigo-200" />
                  <span>Snap Label Code</span>
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

      {/* OCR Settings & Engine Configuration Modal */}
      <AnimatePresence>
        {isConfigOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-md flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.94, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: 16 }}
              className="bg-white rounded-3xl p-5 sm:p-6 w-full max-w-md shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-start justify-between mb-4">
                <div>
                  <div className="flex items-center gap-1.5 mb-1">
                    <Sparkles className="w-4 h-4 text-indigo-600" />
                    <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-600">Scanner Engine</span>
                  </div>
                  <h3 className="text-xl font-black text-slate-900">OCR & Vision Settings</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setIsConfigOpen(false)}
                  className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-xl"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Monthly Credit Alert Banner */}
              {quotaNotice || ideficsConfig.isQuotaExhausted ? (
                <div className="mb-4 p-3.5 bg-amber-50 border border-amber-200 rounded-2xl">
                  <div className="flex items-start gap-2.5">
                    <Zap className="w-4 h-4 text-amber-600 fill-amber-600 shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <h4 className="text-xs font-bold text-amber-900">Cloud Monthly Credits Exhausted</h4>
                      <p className="text-[11px] text-amber-700 mt-0.5 leading-relaxed">
                        Hugging Face monthly free serverless compute limit has been reached. The scanner is operating with <strong>Unlimited On-Device OCR</strong> (zero cloud calls, 100% free, no scan limits).
                      </p>
                      <button
                        type="button"
                        onClick={handleResetQuota}
                        className="mt-2.5 px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-[11px] font-bold inline-flex items-center gap-1 transition-all active:scale-95"
                      >
                        <RotateCcw className="w-3 h-3" />
                        Reset Quota & Test Cloud
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}

              <form onSubmit={handleSaveConfig} className="space-y-4">
                {/* Engine Mode */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Recognition Engine
                  </label>
                  <select
                    value={configDraft.engine}
                    onChange={(e) => setConfigDraft({ ...configDraft, engine: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-600"
                  >
                    <option value="auto">⚡ Auto Failover (Cloud with On-Device backup)</option>
                    <option value="ondevice">⚡ Unlimited On-Device (Free, zero credits, 100% offline)</option>
                    <option value="cloud">✨ Cloud Vision AI (Hugging Face / Dedicated)</option>
                  </select>
                  <p className="text-[10px] text-slate-500 mt-1">
                    On-Device mode runs locally in WebAssembly with zero network requests or credit limits.
                  </p>
                </div>

                {/* Vision Model */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Cloud Vision Model
                  </label>
                  <select
                    value={configDraft.model || ideficsConfig.model}
                    onChange={(e) => setConfigDraft({ ...configDraft, model: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-600"
                  >
                    <option value={MODELS.SERVERLESS_VISION}>Qwen 2.5 VL 72B (Free HF Serverless - Active)</option>
                    <option value={MODELS.IDEFICS3}>Idefics3 8B (Dedicated Endpoint / Self-Hosted)</option>
                  </select>
                </div>

                {/* Hugging Face Token */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Hugging Face Token
                  </label>
                  <input
                    type="password"
                    value={configDraft.token}
                    onChange={(e) => setConfigDraft({ ...configDraft, token: e.target.value })}
                    placeholder="hf_..."
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-600"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    Get your token from{' '}
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

                {/* Custom Endpoint */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Custom Endpoint URL (Optional)
                  </label>
                  <input
                    type="text"
                    value={configDraft.endpoint}
                    onChange={(e) => setConfigDraft({ ...configDraft, endpoint: e.target.value })}
                    placeholder="https://router.huggingface.co/v1/chat/completions"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-600"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">
                    Leave blank to use default Hugging Face Serverless Router.
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
