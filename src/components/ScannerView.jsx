import { useEffect, useRef, useState } from 'react'
import QrScanner from 'qr-scanner'

export default function ScannerView({ onScan }) {
  const videoRef = useRef(null)
  const scannerRef = useRef(null)
  const [error, setError] = useState(null)
  const [hasTorch, setHasTorch] = useState(false)
  const [torchOn, setTorchOn] = useState(false)
  const [facingMode, setFacingMode] = useState('environment')
  const lastCodeRef = useRef({ text: null, at: 0 })

  useEffect(() => {
    if (!videoRef.current) return

    const scanner = new QrScanner(
      videoRef.current,
      (result) => {
        const text = result.data
        const now = Date.now()
        // Ignore duplicate scan within 1.5s
        if (lastCodeRef.current.text === text && now - lastCodeRef.current.at < 1500) return
        lastCodeRef.current = { text, at: now }
        
        // Haptic feedback on mobile if supported
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
          navigator.vibrate(40)
        }

        onScan(text)
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
        setError(null)
        scanner.hasFlash().then((supported) => setHasTorch(supported)).catch(() => {})
      })
      .catch((err) => {
        setError(err.message || 'Camera permission denied or camera unavailable')
      })

    return () => {
      scanner.stop()
      scanner.destroy()
    }
  }, [onScan, facingMode])

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
    } catch {
      // ignore
    }
  }

  function flipCamera() {
    setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'))
  }

  return (
    <div className="scanner-card">
      <video ref={videoRef} className="scanner-video" muted playsInline />
      
      {/* Reticle / Viewfinder Frame */}
      <div className="scanner-overlay">
        <div className="scanner-reticle">
          <div className="reticle-corner-tl" />
          <div className="reticle-corner-tr" />
          <div className="reticle-corner-bl" />
          <div className="reticle-corner-br" />
          <div className="scanner-laser" />
        </div>
        <div className="scanner-hint">Align QR code inside box</div>
      </div>

      {/* Camera Toolbar */}
      <div className="scanner-toolbar">
        {hasTorch && (
          <button
            type="button"
            className="scanner-tool-btn"
            onClick={toggleTorch}
            title={torchOn ? 'Turn Flash Off' : 'Turn Flash On'}
            style={{ background: torchOn ? '#f59e0b' : undefined }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill={torchOn ? 'white' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
            </svg>
          </button>
        )}
        <button
          type="button"
          className="scanner-tool-btn"
          onClick={flipCamera}
          title="Switch Camera"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 10c0-4.418-3.582-8-8-8s-8 3.582-8 8c0 1.5.418 2.9 1.144 4.1L3 17l4.5-1.5" />
            <path d="M4 14c0 4.418 3.582 8 8 8s8-3.582 8-8c0-1.5-.418-2.9-1.144-4.1L21 7l-4.5 1.5" />
          </svg>
        </button>
      </div>

      {error && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,0.9)', color: 'white', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 20, textAlign: 'center' }}>
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#f43f5e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 10 }}>
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <p style={{ color: '#f87171', fontWeight: 600, marginBottom: 6 }}>{error}</p>
          <p style={{ color: '#94a3b8', fontSize: '0.8rem' }}>Check camera permissions in your browser or use manual SKU entry below.</p>
        </div>
      )}
    </div>
  )
}
