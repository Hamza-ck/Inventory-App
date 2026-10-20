import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Delete, Shield, UserCheck, AlertCircle, Lock, Check } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

export default function Login() {
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [shaking, setShaking] = useState(false)
  const navigate = useNavigate()
  const { unlockWithPin, ownerPin, adminPin, teamUsers, isAuthenticated } = useAuth()

  // If already authenticated, redirect to home
  useEffect(() => {
    if (isAuthenticated) {
      navigate('/')
    }
  }, [isAuthenticated, navigate])

  // Listen to physical keyboard events
  useEffect(() => {
    function handleKeyDown(e) {
      if (/^[0-9]$/.test(e.key)) {
        handleDigit(e.key)
      } else if (e.key === 'Backspace') {
        handleBackspace()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [pin])

  const handleDigit = (digit) => {
    if (pin.length >= 4) return
    const nextPin = pin + digit
    setPin(nextPin)
    setError('')

    // Automatically check when 4th digit is typed
    if (nextPin.length === 4) {
      validatePin(nextPin)
    }
  }

  const handleBackspace = () => {
    setError('')
    setPin((prev) => prev.slice(0, -1))
  }

  const handleClear = () => {
    setError('')
    setPin('')
  }

  const validatePin = (inputPin) => {
    const result = unlockWithPin(inputPin)
    if (result.success) {
      navigate('/')
    } else {
      setShaking(true)
      setError(result.error)
      setTimeout(() => {
        setShaking(false)
        setPin('')
      }, 700)
    }
  }

  const handleQuickUnlock = (code) => {
    setPin(code)
    validatePin(code)
  }

  return (
    <main className="grid min-h-screen place-items-center bg-[#f4f7f4] p-4 sm:p-6">
      <div className="w-full max-w-[360px] text-center">
        {/* Brand Circular Logo 'S' */}
        <div className="mx-auto mb-5 grid h-16 w-16 place-items-center rounded-2xl bg-[#0e655d] text-white text-2xl font-black shadow-md">
          S
        </div>

        {/* Screen Title */}
        <h1 className="text-[26px] font-extrabold tracking-tight text-[#11382f]">
          Enter 4-Digit PIN
        </h1>
        <p className="mt-1 text-xs font-medium text-[#6c877e]">
          Quick secure access for Owner or Admin
        </p>

        {/* 4-Digit PIN Indicators */}
        <div className={`mt-8 mb-6 flex justify-center gap-4 ${shaking ? 'animate-shake' : ''}`}>
          {[0, 1, 2, 3].map((index) => {
            const isFilled = pin.length > index
            return (
              <div
                key={index}
                className={`grid h-13 w-13 place-items-center rounded-2xl border-2 transition-all duration-150 ${
                  isFilled
                    ? 'border-[#0e655d] bg-[#0e655d] text-white shadow-sm scale-105'
                    : 'border-[#d0ded7] bg-white text-transparent'
                }`}
              >
                <div
                  className={`h-3.5 w-3.5 rounded-full transition-all ${
                    isFilled ? 'bg-white scale-100' : 'bg-transparent scale-50'
                  }`}
                />
              </div>
            )
          })}
        </div>

        {/* Error message */}
        {error ? (
          <div className="mb-4 flex items-center justify-center gap-1.5 text-xs font-bold text-[#b83e29]">
            <AlertCircle size={15} />
            <span>{error}</span>
          </div>
        ) : (
          <div className="mb-4 h-4 text-[11px] text-[#718d84]">
            Type with keyboard or use keypad
          </div>
        )}

        {/* Keypad Container */}
        <div className="rounded-3xl border border-[#e1e9e3] bg-white p-5 shadow-[0_16px_48px_rgba(14,101,93,0.06)]">
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
              <button
                key={num}
                type="button"
                onClick={() => handleDigit(String(num))}
                className="grid h-13 place-items-center rounded-2xl border border-[#edf3f0] bg-[#fafcfb] text-lg font-bold text-[#11382f] shadow-2xs hover:bg-[#eef7f3] hover:border-[#b4d6cc] active:scale-95 transition"
              >
                {num}
              </button>
            ))}

            {/* Clear Button */}
            <button
              type="button"
              onClick={handleClear}
              className="grid h-13 place-items-center rounded-2xl text-xs font-extrabold text-[#759187] hover:bg-[#f1f6f3] active:scale-95 transition"
            >
              Clear
            </button>

            {/* Zero Button */}
            <button
              type="button"
              onClick={() => handleDigit('0')}
              className="grid h-13 place-items-center rounded-2xl border border-[#edf3f0] bg-[#fafcfb] text-lg font-bold text-[#11382f] shadow-2xs hover:bg-[#eef7f3] hover:border-[#b4d6cc] active:scale-95 transition"
            >
              0
            </button>

            {/* Backspace Button */}
            <button
              type="button"
              onClick={handleBackspace}
              className="grid h-13 place-items-center rounded-2xl text-[#759187] hover:bg-[#f1f6f3] active:scale-95 transition"
              aria-label="Backspace"
            >
              <Delete size={20} />
            </button>
          </div>

          {/* Quick PIN Chips for Team Users */}
          <div className="mt-5 pt-4 border-t border-[#edf3f0]">
            <p className="text-[11px] font-bold text-[#68857d] mb-2.5">
              Quick Access PINs
            </p>
            <div className="grid grid-cols-2 gap-2">
              {(teamUsers && teamUsers.length > 0
                ? teamUsers
                : [
                    { id: 'o', name: 'Owner', role: 'owner', pin: ownerPin },
                    { id: 'a', name: 'Admin', role: 'admin', pin: adminPin },
                  ]
              ).map((u) => {
                const isAdminRole = u.role === 'admin'
                return (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => handleQuickUnlock(u.pin)}
                    className={`flex items-center justify-center gap-1.5 rounded-xl px-2.5 py-2 text-xs font-bold transition active:scale-95 truncate ${
                      isAdminRole
                        ? 'bg-[#0e655d] text-white shadow-2xs hover:bg-[#0a4f49]'
                        : 'border border-[#cbe2d8] bg-[#f8faf9] text-[#145347] hover:bg-[#eef7f3]'
                    }`}
                  >
                    {isAdminRole ? <Shield size={13} className="shrink-0" /> : <UserCheck size={13} className="shrink-0" />}
                    <span className="truncate">
                      {u.name === 'You' ? 'Admin' : u.name} ({u.pin})
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
