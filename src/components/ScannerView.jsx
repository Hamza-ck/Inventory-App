import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Zap, ZapOff, RefreshCw, AlertCircle, Camera, ScanText } from 'lucide-react'

const OCR_SCRIPT_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js'

function normalizeDetectedText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function isUsefulOcrText(value) {
  const text = normalizeDetectedText(value)
  if (!text || text.length > 24) return false
  const compact = text.replace(/\s/g, '')
  return /[a-z0-9]/i.test(compact) && compact.length >= 2
}

async function loadTesseract() {
  if (typeof window === 'undefined') return null
  if (window.Tesseract) return window.Tesseract

  await new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-inventory-tesseract]')
    if (existing) {
      existing.addEventListener('load', resolve, { once: true })
      existing.addEventListener('error', reject, { once: true })
      return
    }
    const script = document.createElement('script')
    script.src = OCR_SCRIPT_URL
    script.async = true
    script.dataset.inventoryTesseract = 'true'
    script.onload = resolve
    script.onerror = () => reject(new Error('OCR engine could not be loaded.'))
    document.head.appendChild(script)
  })

  return window.Tesseract || null
}

function makeImageFingerprint(video) {
  if (!video?.videoWidth || !video?.videoHeight) return null
  const canvas = document.createElement('canvas')
  canvas.width = 32
  canvas.height = 18
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) return null
  context.drawImage(video, 0, 0, 32, 18)
  const data = context.getImageData(0, 0, 32, 18).data
  let hash = 0
  for (let i = 0; i < data.length; i += 16) {
    hash = (hash * 31 + data[i] + data[i + 1] + data[i + 2]) | 0
  }
  return hash
}

export default function ScannerView({ onScan }) {
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const trackRef = useRef(null)
  const barcodeDetectorRef = useRef(null)
  const onScanRef = useRef(onScan)
  const ocrBusyRef = useRef(false)
  const lastCodeRef = useRef({ text: null, at: 0 })
  const lastOcrAtRef = useRef(0)
  const lastOcrFingerprintRef = useRef(null)
  const animationFrameRef = useRef(null)
  const autoOcrTimerRef = useRef(null)
  const [error, setError] = useState(null)
  const [hasTorch, setHasTorch] = useState(false)
  const [torchOn, setTorchOn] = useState(false)
  const [facingMode, setFacingMode] = useState('environment')
  const [isInitializing, setIsInitializing] = useState(true)
  const [isOcrRunning, setIsOcrRunning] = useState(false)
  const [scannerHint, setScannerHint] = useState('Point at a supplier label, QR code or barcode')

  useEffect(() => {
    onScanRef.current = onScan
  }, [onScan])

  useEffect(() => {
    let isMounted = true
    setIsInitializing(true)
    setError(null)
    setTorchOn(false)
    setScannerHint('Point at a supplier label, QR code or barcode')
    lastOcrFingerprintRef.current = null
    lastOcrAtRef.current = 0

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
        if (!isMounted) {
          stream.getTracks().forEach((track) => track.stop())
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

        if ('BarcodeDetector' in window) {
          try {
            const supported = typeof window.BarcodeDetector.getSupportedFormats === 'function'
              ? await window.BarcodeDetector.getSupportedFormats()
              : []
            const preferred = [
              'qr_code', 'code_128', 'code_39', 'code_93',
              'ean_13', 'ean_8', 'upc_a', 'upc_e', 'itf',
              'codabar', 'data_matrix', 'pdf417', 'aztec',
            ]
            const formats = supported.filter((format) => preferred.includes(format))
            barcodeDetectorRef.current = formats.length
              ? new window.BarcodeDetector({ formats })
              : new window.BarcodeDetector()
          } catch {
            barcodeDetectorRef.current = null
          }
        }
        setIsInitializing(false)
        setError(null)
      } catch (err) {
        if (!isMounted) return
        console.error('Camera start error:', err)
        setIsInitializing(false)
        setError(err?.message || 'Camera permission denied or camera hardware unavailable.')
      }
    }

    startCamera()

    return () => {
      isMounted = false
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current)
      if (autoOcrTimerRef.current) clearTimeout(autoOcrTimerRef.current)
      animationFrameRef.current = null
      autoOcrTimerRef.current = null
      barcodeDetectorRef.current = null
      if (streamRef.current) streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
      trackRef.current = null
    }
  }, [facingMode])

  useEffect(() => {
    let active = true

    async function scanBarcodes() {
      if (!active || !barcodeDetectorRef.current || !videoRef.current || videoRef.current.readyState < 2) {
        if (active) animationFrameRef.current = requestAnimationFrame(scanBarcodes)
        return
      }
      try {
        const results = await barcodeDetectorRef.current.detect(videoRef.current)
        const match = results?.find((result) => normalizeDetectedText(result.rawValue))
        if (match?.rawValue) {
          const text = normalizeDetectedText(match.rawValue)
          const now = Date.now()
          if (!(lastCodeRef.current.text === text && now - lastCodeRef.current.at < 2500)) {
            lastCodeRef.current = { text, at: now }
            lastOcrFingerprintRef.current = makeImageFingerprint(videoRef.current)
            setScannerHint(`Detected ${match.format || 'code'}: ${text}`)
            if (navigator.vibrate) { try { navigator.vibrate(40) } catch {} }
            onScanRef.current?.(text)
          }
        }
      } catch {
        // Detection can fail transiently while the camera is moving.
      }
      if (active) animationFrameRef.current = requestAnimationFrame(scanBarcodes)
    }

    if (!isInitializing && !error) animationFrameRef.current = requestAnimationFrame(scanBarcodes)
    return () => {
      active = false
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current)
    }
  }, [isInitializing, error])

  async function runOcr({ automatic = false } = {}) {
    if (ocrBusyRef.current || !videoRef.current || videoRef.current.readyState < 2) return false
    const fingerprint = makeImageFingerprint(videoRef.current)
    const now = Date.now()
    if (automatic && fingerprint !== null) {
      if (fingerprint === lastOcrFingerprintRef.current && now - lastOcrAtRef.current < 5000) return false
      if (now - lastOcrAtRef.current < 1800) return false
    }

    ocrBusyRef.current = true
    lastOcrAtRef.current = now
    setIsOcrRunning(true)
    if (!automatic) setScannerHint('Reading printed model label…')

    try {
      const tesseract = await loadTesseract()
      if (!tesseract) throw new Error('OCR engine unavailable.')

      const canvas = document.createElement('canvas')
      const source = videoRef.current
      const width = source.videoWidth || 1280
      const height = source.videoHeight || 720
      const cropWidth = Math.floor(width * 0.86)
      const cropHeight = Math.floor(height * 0.52)
      const sx = Math.floor((width - cropWidth) / 2)
      const sy = Math.floor((height - cropHeight) / 2)
      canvas.width = cropWidth
      canvas.height = cropHeight
      const context = canvas.getContext('2d', { willReadFrequently: true })
      if (!context) throw new Error('Camera image could not be processed.')
      context.drawImage(source, sx, sy, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight)

      // Improve small black-on-white supplier labels before OCR.
      const image = context.getImageData(0, 0, canvas.width, canvas.height)
      for (let i = 0; i < image.data.length; i += 4) {
        const gray = Math.round(image.data[i] * 0.299 + image.data[i + 1] * 0.587 + image.data[i + 2] * 0.114)
        const boosted = gray > 155 ? 255 : gray < 90 ? 0 : gray
        image.data[i] = boosted
        image.data[i + 1] = boosted
        image.data[i + 2] = boosted
      }
      context.putImageData(image, 0, 0)

      const result = await tesseract.recognize(canvas, 'eng', {
        logger: () => {},
        config: {
          tessedit_pageseg_mode: '6',
          tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._',
        },
      })

      const rawText = String(result?.data?.text || '')
      const lines = rawText
        .split(/[\n|]+/)
        .map(normalizeDetectedText)
        .filter(isUsefulOcrText)

      const words = rawText
        .split(/\s+/)
        .map(normalizeDetectedText)
        .filter(isUsefulOcrText)

      const candidates = [...new Set([...lines, ...words])]
      const candidate = candidates.sort((a, b) => {
        const aCompact = a.replace(/[^a-z0-9]/gi, '')
        const bCompact = b.replace(/[^a-z0-9]/gi, '')
        const aScore = (aCompact.length >= 2 && aCompact.length <= 12 ? 0 : 5) + Math.abs(aCompact.length - 4)
        const bScore = (bCompact.length >= 2 && bCompact.length <= 12 ? 0 : 5) + Math.abs(bCompact.length - 4)
        return aScore - bScore
      })[0]

      if (!candidate) {
        if (!automatic) setScannerHint('No clear model text found — move closer and improve lighting')
        return false
      }

      const resultFingerprint = makeImageFingerprint(videoRef.current)
      lastOcrFingerprintRef.current = resultFingerprint ?? fingerprint
      const scanNow = Date.now()
      if (!(lastCodeRef.current.text === candidate && scanNow - lastCodeRef.current.at < 3000)) {
        lastCodeRef.current = { text: candidate, at: scanNow }
        if (navigator.vibrate) { try { navigator.vibrate(40) } catch {} }
        onScanRef.current?.(candidate)
      }
      setScannerHint(`Detected printed label: ${candidate}`)
      return true
    } catch (err) {
      console.error('OCR error:', err)
      if (!automatic) setScannerHint(err?.message || 'OCR failed. Try better lighting and a closer label.')
      return false
    } finally {
      ocrBusyRef.current = false
      setIsOcrRunning(false)
    }
  }

  useEffect(() => {
    let active = true

    async function autoOcrLoop() {
      if (!active) return
      if (!isInitializing && !error && !ocrBusyRef.current && videoRef.current?.readyState >= 2) {
        await runOcr({ automatic: true })
      }
      if (active) autoOcrTimerRef.current = setTimeout(autoOcrLoop, 2200)
    }

    if (!isInitializing && !error) autoOcrTimerRef.current = setTimeout(autoOcrLoop, 1200)
    return () => {
      active = false
      if (autoOcrTimerRef.current) clearTimeout(autoOcrTimerRef.current)
      autoOcrTimerRef.current = null
    }
  }, [isInitializing, error])

  async function toggleTorch() {
    const track = trackRef.current
    if (!track || typeof track.applyConstraints !== 'function') return
    try {
      const next = !torchOn
      await track.applyConstraints({ advanced: [{ torch: next }] })
      setTorchOn(next)
    } catch (e) {
      console.warn('Torch toggle failed:', e)
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

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3 }}
      className="relative w-full aspect-[4/3] sm:aspect-[16/10] bg-slate-950 rounded-2xl md:rounded-3xl overflow-hidden shadow-xl shadow-slate-900/10 border border-slate-800 mb-6"
    >
      <video ref={videoRef} className="w-full h-full object-cover block" muted playsInline autoPlay />

      <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center">
        <div className="relative w-48 h-48 sm:w-56 sm:h-56 rounded-2xl ring-[4000px] ring-black/50">
          <div className="absolute top-0 left-0 w-7 h-7 border-t-3 border-l-3 border-sky-400 rounded-tl-xl" />
          <div className="absolute top-0 right-0 w-7 h-7 border-t-3 border-r-3 border-sky-400 rounded-tr-xl" />
          <div className="absolute bottom-0 left-0 w-7 h-7 border-b-3 border-l-3 border-sky-400 rounded-bl-xl" />
          <div className="absolute bottom-0 right-0 w-7 h-7 border-b-3 border-r-3 border-sky-400 rounded-br-xl" />
          <motion.div
            animate={{ top: ['5%', '92%', '5%'], opacity: [0.3, 0.9, 0.3] }}
            transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
            className="absolute left-2 right-2 h-0.5 bg-gradient-to-r from-transparent via-sky-400 to-transparent shadow-[0_0_12px_#38bdf8]"
          />
        </div>
        <div className="absolute bottom-4 bg-slate-900/80 backdrop-blur-md px-3.5 py-1.5 rounded-full border border-white/10 text-white text-xs font-medium tracking-wide flex items-center gap-1.5 shadow-lg">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          {scannerHint}
        </div>
      </div>

      <div className="absolute top-3 left-3 right-3 flex items-center justify-between z-10 pointer-events-auto">
        <button
          type="button"
          onClick={() => runOcr({ automatic: false })}
          disabled={isOcrRunning || isInitializing || Boolean(error)}
          title="Read printed model text"
          className="h-10 px-3 rounded-full flex items-center justify-center gap-1.5 bg-slate-900/70 text-slate-100 backdrop-blur-md border border-white/20 hover:bg-slate-800/80 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md text-xs font-semibold"
        >
          <ScanText className="w-4 h-4" />
          {isOcrRunning ? 'Reading…' : 'Read text'}
        </button>
        <div className="flex items-center gap-2">
          {hasTorch && (
            <button
              type="button"
              onClick={toggleTorch}
              title={torchOn ? 'Turn Flash Off' : 'Turn Flash On'}
              className={`w-10 h-10 rounded-full flex items-center justify-center backdrop-blur-md border transition-all ${torchOn ? 'bg-amber-500 text-white border-amber-400 shadow-lg shadow-amber-500/30' : 'bg-slate-900/70 text-slate-200 border-white/20 hover:bg-slate-800/80 active:scale-95'}`}
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

      {isInitializing && !error && (
        <div className="absolute inset-0 bg-slate-950 flex flex-col items-center justify-center p-4 text-center z-20">
          <div className="w-10 h-10 border-3 border-slate-700 border-t-sky-400 rounded-full animate-spin mb-3" />
          <p className="text-slate-300 text-sm font-medium">Starting camera…</p>
        </div>
      )}

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
              <Camera className="w-3.5 h-3.5" /> Retry Camera
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
