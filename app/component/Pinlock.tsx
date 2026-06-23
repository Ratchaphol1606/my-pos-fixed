"use client"
import { useState, useEffect } from 'react'
import { Lock, Delete } from 'lucide-react'

export default function PinLock({ children }: { children: React.ReactNode }) {
  const [unlocked, setUnlocked] = useState(false)
  const [checking, setChecking] = useState(true)
  const [pin, setPin]           = useState('')
  const [error, setError]       = useState(false)
  const [shake, setShake]       = useState(false)
  const [submitting, setSubmitting] = useState(false)

  // Ask the server if we already have a valid session cookie.
  // The cookie is httpOnly, so JS can't read it directly — we just
  // try a request and see if it's accepted.
  useEffect(() => {
    fetch('/api/auth', { method: 'GET' })
      .then(res => setUnlocked(res.ok))
      .catch(() => setUnlocked(false))
      .finally(() => setChecking(false))
  }, [])

  // Verified on the server, never compared in the browser. Called
  // directly from press() once the 4th digit goes in, instead of
  // watching `pin` in an effect — keeps the submit as a normal event
  // handler so there's no setState-in-effect timing issue.
  const submitPin = async (candidate: string) => {
    setSubmitting(true)
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: candidate })
      })
      if (res.ok) {
        setUnlocked(true)
        setError(false)
      } else {
        setError(true)
        setShake(true)
        setTimeout(() => { setPin(''); setShake(false) }, 600)
      }
    } catch {
      setError(true)
      setShake(true)
      setTimeout(() => { setPin(''); setShake(false) }, 600)
    } finally {
      setSubmitting(false)
    }
  }

  const press = (val: string) => {
    if (submitting || pin.length >= 4) return
    const next = pin + val
    setPin(next)
    if (next.length === 4) submitPin(next)
  }

  const del = () => setPin(p => p.slice(0, -1))

  if (unlocked) return <>{children}</>

  if (checking) {
    return (
      <div className="fixed inset-0 z-50 bg-gradient-to-br from-blue-600 to-blue-800 flex items-center justify-center print:hidden">
        <div className="text-white/60 text-sm font-bold uppercase tracking-widest">กำลังตรวจสอบ...</div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 bg-gradient-to-br from-blue-600 to-blue-800 flex flex-col items-center justify-center print:hidden">
      <div className="flex flex-col items-center gap-6">

        {/* Icon */}
        <div className="bg-white/20 p-5 rounded-full">
          <Lock size={40} className="text-white" />
        </div>

        {/* Title */}
        <div className="text-center">
          <h1 className="text-white text-2xl font-black">บุญชอบเครื่องครัว</h1>
          <p className="text-blue-200 text-sm mt-1">กรุณาใส่รหัส PIN</p>
        </div>

        {/* PIN dots */}
        <div className={`flex gap-4 ${shake ? 'animate-bounce' : ''}`}>
          {[0,1,2,3].map(i => (
            <div
              key={i}
              className={`w-4 h-4 rounded-full border-2 border-white transition-all ${
                pin.length > i ? 'bg-white' : 'bg-transparent'
              } ${error ? 'border-red-400 bg-red-400' : ''}`}
            />
          ))}
        </div>

        {error && (
          <p className="text-red-300 text-sm font-bold -mt-2">รหัสไม่ถูกต้อง</p>
        )}

        {/* Numpad */}
        <div className={`grid grid-cols-3 gap-3 mt-2 ${submitting ? 'opacity-50 pointer-events-none' : ''}`}>
          {['1','2','3','4','5','6','7','8','9'].map(n => (
            <button
              key={n}
              onClick={() => press(n)}
              disabled={submitting}
              className="w-20 h-20 bg-white/20 hover:bg-white/30 active:bg-white/10 text-white text-2xl font-bold rounded-2xl transition-all"
            >
              {n}
            </button>
          ))}
          {/* Bottom row */}
          <div /> {/* empty */}
          <button
            onClick={() => press('0')}
            disabled={submitting}
            className="w-20 h-20 bg-white/20 hover:bg-white/30 active:bg-white/10 text-white text-2xl font-bold rounded-2xl transition-all"
          >
            0
          </button>
          <button
            onClick={del}
            disabled={submitting}
            className="w-20 h-20 bg-white/20 hover:bg-white/30 active:bg-white/10 text-white rounded-2xl transition-all flex items-center justify-center"
          >
            <Delete size={24} />
          </button>
        </div>
      </div>
    </div>
  )
}
