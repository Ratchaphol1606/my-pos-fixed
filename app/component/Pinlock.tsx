"use client"
import { useState, useEffect } from 'react'
import { Lock, Delete } from 'lucide-react'

const CORRECT_PIN = '1609' // ← change this to your PIN

export default function PinLock({ children }: { children: React.ReactNode }) {
  const [unlocked, setUnlocked] = useState(false)
  const [pin, setPin]           = useState('')
  const [error, setError]       = useState(false)
  const [shake, setShake]       = useState(false)

  // Check session on mount
  useEffect(() => {
    const session = sessionStorage.getItem('pos_unlocked')
    if (session === 'true') setUnlocked(true)
  }, [])

  // Auto-submit when 4 digits entered
  useEffect(() => {
    if (pin.length === 4) {
      if (pin === CORRECT_PIN) {
        sessionStorage.setItem('pos_unlocked', 'true')
        setUnlocked(true)
        setError(false)
      } else {
        setError(true)
        setShake(true)
        setTimeout(() => { setPin(''); setShake(false) }, 600)
      }
    }
  }, [pin])

  const press = (val: string) => {
    if (pin.length < 4) setPin(p => p + val)
  }

  const del = () => setPin(p => p.slice(0, -1))

  if (unlocked) return <>{children}</>

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
        <div className="grid grid-cols-3 gap-3 mt-2">
          {['1','2','3','4','5','6','7','8','9'].map(n => (
            <button
              key={n}
              onClick={() => press(n)}
              className="w-20 h-20 bg-white/20 hover:bg-white/30 active:bg-white/10 text-white text-2xl font-bold rounded-2xl transition-all"
            >
              {n}
            </button>
          ))}
          {/* Bottom row */}
          <div /> {/* empty */}
          <button
            onClick={() => press('0')}
            className="w-20 h-20 bg-white/20 hover:bg-white/30 active:bg-white/10 text-white text-2xl font-bold rounded-2xl transition-all"
          >
            0
          </button>
          <button
            onClick={del}
            className="w-20 h-20 bg-white/20 hover:bg-white/30 active:bg-white/10 text-white rounded-2xl transition-all flex items-center justify-center"
          >
            <Delete size={24} />
          </button>
        </div>
      </div>
    </div>
  )
}
