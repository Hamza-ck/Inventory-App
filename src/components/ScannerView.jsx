import { useEffect, useRef, useState } from 'react'
import QrScanner from 'qr-scanner'
import { motion, AnimatePresence } from 'framer-motion'
import { Zap, ZapOff, RefreshCw, AlertCircle, Camera } from 'lucide-react'

export default function ScannerView({ onScan }) {
  const videoRef = useRef(null)
  const scannerRef = useRef(null)
  const onScanRef = useRef(onScan)
  const [error, setError] = useState(null)
  const [hasTorch, setHasTorch] = useState(false)
  const [torchOn, setTorchOn] = useState(false)
  const [facingMode, setFacingMode] = useState('environment')
  const [isInitializing, setIsInitializing] = useState(true)
  const lastCodeRef = useRef({ text: null, at: 0 })

  // Always update onScanRef without triggering re-render or re-initializing the camera
  useEffect(() => {
    onScanRef.current = onScan
  }, [onScan])

  useEffect(() => {
    let isMounted = true
    setIsInitializing(true)
    setError(null)

    if (!videoRef.current) return

    const scanner = new QrScanner(
      videoRef.current,
      (result) => {
        const text = result?.data || result
        if (!text) return
        const now = Date.now()
        // Ignore duplicate scan within 1.5s
        if (lastCodeRef.current.text === text && now - lastCodeRef.current.at < 1500) return
        lastCodeRef.current = { text, at: now }

        // Haptic feedback on mobile devices if supported
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
          try {
            navigator.vibrate(40)
          } catch {
            // ignore vibration error
          }
        }

        if (onScanRef.current) {
          onScanRef.current(text)
        }
      },
      {
        highlightScanRegion: false,
        highlightCodeOutline: false,
        preferredCamera: facingMode,
        maxScansPerSecond: 10,
      }
    )

    scannerRef.current = scanner

    scanner
      .start()
      .then(() => {
        if (!isMounted) {
          scanner.stop()
          scanner.destroy()
          return
        }
        setIsInitializing(false)
        setError(null)
        scanner
          .hasFlash()
          .then((supported) => {
            if (isMounted) setHasTorch(supported)
          })
          .catch(() => {})
      })
      .catch((err) => {
        if (!isMounted) return
        setIsInitializing(false)
        console.error('Camera start error:', err)
        setError(err.message || 'Camera permission denied or camera hardware unavailable.')
      })

    return () => {
      isMounted = false
      try {
        scanner.stop()
        scanner.destroy()
      } catch (err) {
        console.warn('Error during scanner cleanup:', err)
      }
    }
  }, [facingMode])

  async function toggleTorch() {
    if (!scannerRef.current) return
    try {
      if (torchOn) {
        await scannerRef.current.turnFlashOff()
        setTorchOn(false)
      } else {
        await scannerRef.current.turnFlashOn()
        setTorchOn(true)
      }
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
    setTimeout(() => {
      setFacingMode('environment')
    }, 100)
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3 }}
      className="relative w-full aspect-[4/3] sm:aspect-[16/10] bg-slate-950 rounded-2xl md:rounded-3xl overflow-hidden shadow-xl shadow-slate-900/10 border border-slate-800 mb-6"
    >
      <video
        ref={videoRef}
        className="w-full h-full object-cover block"
        muted
        playsInline
        autoPlay
      />

      {/* Reticle / Viewfinder Frame Overlay */}
      <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center">
        <div className="relative w-48 h-48 sm:w-56 sm:h-56 rounded-2xl ring-[4000px] ring-black/50">
          {/* Corner borders */}
          <div className="absolute top-0 left-0 w-7 h-7 border-t-3 border-l-3 border-sky-400 rounded-tl-xl" />
          <div className="absolute top-0 right-0 w-7 h-7 border-t-3 border-r-3 border-sky-400 rounded-tr-xl" />
          <div className="absolute bottom-0 left-0 w-7 h-7 border-b-3 border-l-3 border-sky-400 rounded-bl-xl" />
          <div className="absolute bottom-0 right-0 w-7 h-7 border-b-3 border-r-3 border-sky-400 rounded-br-xl" />

          {/* Animated Laser line */}
          <motion.div
            animate={{
              top: ['5%', '92%', '5%'],
              opacity: [0.3, 0.9, 0.3],
            }}
            transition={{
              duration: 2.2,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
            className="absolute left-2 right-2 h-0.5 bg-gradient-to-r from-transparent via-sky-400 to-transparent shadow-[0_0_12px_#38bdf8]"
          />
        </div>

        <div className="absolute bottom-4 bg-slate-900/80 backdrop-blur-md px-3.5 py-1.5 rounded-full border border-white/10 text-white text-xs font-medium tracking-wide flex items-center gap-1.5 shadow-lg">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          Align QR code inside frame
        </div>
      </div>

      {/* Camera Toolbar */}
      <div className="absolute top-3 right-3 flex items-center gap-2 z-10 pointer-events-auto">
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

      {/* Initializing Loading State */}
      {isInitializing && !error && (
        <div className="absolute inset-0 bg-slate-950 flex flex-col items-center justify-center p-4 text-center z-20">
          <div className="w-10 h-10 border-3 border-slate-700 border-t-sky-400 rounded-full animate-spin mb-3" />
          <p className="text-slate-300 text-sm font-medium">Starting camera...</p>
        </div>
      )}

      {/* Error Overlay with Retry Option */}
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
            <div className="flex gap-2">
              <button
                type="button"
                onClick={retryCamera}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold rounded-xl border border-slate-700 active:scale-95 transition-all flex items-center gap-1.5"
              >
                <Camera className="w-3.5 h-3.5" /> Retry Camera
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
