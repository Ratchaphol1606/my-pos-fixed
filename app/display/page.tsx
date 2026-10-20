"use client"
import { useEffect, useRef, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { CheckCircle2, Link2, WifiOff } from 'lucide-react'
import { normalizePairCode, useDisplayReceiver, type DisplayState } from '@/src/lib/customerDisplay'

const TARGET_KEY = 'pos_display_target'

const baht = (n: number) => `฿${n.toLocaleString()}`
const baht2 = (n: number) =>
  `฿${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const METHOD_LABEL = { cash: 'เงินสด', transfer: 'โอนเงิน / QR', wallet: 'เป๋าตัง' } as const

// Customer-facing screen. Open it on the iPad via the QR code in the POS
// screen's "จอลูกค้า" dialog. It only renders what the POS broadcasts.
export default function CustomerDisplayPage() {
  const [pairCode, setPairCode] = useState<string | null>(null)
  const [codeInput, setCodeInput] = useState('')
  const [flash, setFlash] = useState<string | null>(null)
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const listEndRef = useRef<HTMLDivElement>(null)

  const applyInitialCode = (code: string) => {
    if (!code) return
    setPairCode(code)
    setCodeInput(code)
  }

  // Pick up the code from the QR link (?c=XXXXXX), falling back to the
  // last one used on this device. Read after mount so server and client
  // HTML match.
  useEffect(() => {
    let code = ''
    try {
      code = normalizePairCode(new URLSearchParams(window.location.search).get('c') ?? '')
      if (code) localStorage.setItem(TARGET_KEY, code)
      else code = localStorage.getItem(TARGET_KEY) ?? ''
    } catch { /* ignore */ }
    // One-time read of browser-only state after mount (can't be done
    // during render without a server/client HTML mismatch).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    applyInitialCode(code)
  }, [])

  const showFlash = (name: string) => {
    setFlash(name)
    if (flashTimer.current) clearTimeout(flashTimer.current)
    flashTimer.current = setTimeout(() => setFlash(null), 1800)
  }

  const { state, connected, posOnline } = useDisplayReceiver(pairCode, showFlash)

  const lineCount = state?.lines.length ?? 0
  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [lineCount])

  const connectWith = () => {
    const code = normalizePairCode(codeInput)
    if (code.length < 4) return
    try { localStorage.setItem(TARGET_KEY, code) } catch { /* ignore */ }
    setPairCode(code)
  }

  // Covers the app navbar so the customer only sees this screen.
  const shell = 'fixed inset-0 z-[100] bg-gray-100 text-gray-900 overflow-hidden flex flex-col'

  if (!pairCode) {
    return (
      <div className={`${shell} items-center justify-center p-6`}>
        <div className="bg-white rounded-3xl shadow-xl p-8 w-full max-w-sm text-center">
          <h1 className="text-xl font-black mb-1">จอลูกค้า</h1>
          <p className="text-sm text-gray-500 mb-5">ใส่รหัสเชื่อมต่อจากหน้าจอเครื่องคิดเงิน</p>
          <input
            autoFocus
            className="w-full p-4 text-center text-2xl font-mono tracking-[0.3em] uppercase rounded-xl bg-gray-50 outline-none focus:ring-2 ring-blue-500 mb-3"
            placeholder="------"
            value={codeInput}
            maxLength={8}
            onChange={(e) => setCodeInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') connectWith() }}
          />
          <button
            onClick={connectWith}
            className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold flex items-center justify-center gap-2"
          >
            <Link2 size={18} /> เชื่อมต่อ
          </button>
        </div>
      </div>
    )
  }

  if (!connected || !posOnline) {
    return (
      <div className={`${shell} items-center justify-center text-center p-6`}>
        <WifiOff size={56} className="text-gray-300 mb-4" />
        <p className="text-2xl font-black text-gray-400">
          {state?.shopName || 'จอลูกค้า'}
        </p>
        <p className="text-sm text-gray-400 mt-2">
          {connected ? 'รอเครื่องคิดเงิน...' : 'กำลังเชื่อมต่อ...'}
        </p>
        <button
          onClick={() => {
            try { localStorage.removeItem(TARGET_KEY) } catch { /* ignore */ }
            setPairCode(null)
          }}
          className="mt-8 text-xs text-gray-300 underline"
        >
          เปลี่ยนรหัสเชื่อมต่อ
        </button>
      </div>
    )
  }

  const s: DisplayState | null = state

  if (!s || s.stage === 'idle') {
    return (
      <div className={`${shell} items-center justify-center text-center bg-gradient-to-br from-blue-600 to-blue-800 text-white`}>
        <p className="text-5xl font-black tracking-tight">ยินดีต้อนรับ</p>
        <p className="text-xl text-blue-100 mt-3">{s?.shopName}</p>
      </div>
    )
  }

  if (s.stage === 'paid' && s.paid) {
    return (
      <div className={`${shell} items-center justify-center text-center bg-gradient-to-br from-emerald-500 to-emerald-700 text-white`}>
        <CheckCircle2 size={96} className="mb-4" />
        <p className="text-4xl font-black">ชำระเงินเรียบร้อย</p>
        <p className="text-6xl font-black mt-6">{baht(s.paid.total)}</p>
        {s.paid.method === 'cash' && s.paid.change > 0 && (
          <p className="text-2xl mt-3 text-emerald-50">เงินทอน {baht(s.paid.change)}</p>
        )}
        {!!s.paid.pointsEarned && s.paid.pointsEarned > 0 && (
          <p className="text-lg mt-3 text-emerald-100">ได้รับ {s.paid.pointsEarned} แต้ม</p>
        )}
        <p className="text-xl mt-8 text-emerald-100">ขอบคุณที่ใช้บริการ</p>
      </div>
    )
  }

  const paying = s.stage === 'paying' && s.payment
  const pay = s.payment

  return (
    <div className={`${shell} md:flex-row`}>
      {/* Left: items */}
      <div className="flex-1 min-h-0 flex flex-col p-4 md:p-6">
        <div className="flex items-baseline justify-between mb-3">
          <h1 className="text-xl font-black">รายการสินค้า</h1>
          {s.customerName && (
            <span className="text-sm font-bold text-blue-600">สมาชิก: {s.customerName}</span>
          )}
        </div>

        <div className="relative flex-1 min-h-0 bg-white rounded-3xl shadow-sm overflow-y-auto">
          {s.lines.map((l, i) => (
            <div key={`${l.name}-${i}`} className="flex items-center gap-3 px-5 py-4 border-b last:border-b-0 border-gray-100">
              <span className="min-w-0 flex-1 text-lg font-bold truncate">{l.name}</span>
              <span className="text-gray-400 text-sm shrink-0">{baht(l.price)} × {l.qty}</span>
              <span className="w-24 text-right text-lg font-black shrink-0">{baht(l.price * l.qty)}</span>
            </div>
          ))}
          <div ref={listEndRef} />
        </div>

        {flash && !paying && (
          <div className="mt-3 bg-emerald-500 text-white rounded-2xl px-5 py-3 font-bold text-lg truncate animate-pulse">
            + {flash}
          </div>
        )}
      </div>

      {/* Right: totals / payment */}
      <div className="md:w-[24rem] shrink-0 bg-white md:rounded-l-[2.5rem] shadow-2xl p-6 flex flex-col justify-center gap-4">
        {!paying && (
          <>
            <div className="flex justify-between text-gray-500 font-bold">
              <span>ยอดรวม</span>
              <span>{baht(s.subtotal)}</span>
            </div>
            {s.discount > 0 && (
              <div className="flex justify-between text-green-600 font-bold">
                <span>ส่วนลด</span>
                <span>-{baht(s.discount)}</span>
              </div>
            )}
            <div className="border-t pt-4">
              <p className="text-gray-400 font-bold text-sm">ยอดชำระ</p>
              <p className="text-6xl font-black tracking-tighter text-blue-600">{baht(s.total)}</p>
            </div>
            {!!s.pointsEarned && s.pointsEarned > 0 && (
              <p className="text-sm font-bold text-blue-500">จะได้รับ {s.pointsEarned} แต้ม</p>
            )}
          </>
        )}

        {paying && pay && (
          <>
            <div>
              <p className="text-gray-400 font-bold text-sm">ยอดชำระ · {METHOD_LABEL[pay.method]}</p>
              <p className="text-6xl font-black tracking-tighter text-blue-600">{baht(s.total)}</p>
            </div>

            {pay.method === 'cash' && (
              <div className="space-y-2 border-t pt-4">
                <div className="flex justify-between text-xl font-bold text-gray-500">
                  <span>เงินที่รับมา</span>
                  <span>{pay.received ? baht(pay.received) : '—'}</span>
                </div>
                <div className="flex justify-between text-3xl font-black">
                  <span>เงินทอน</span>
                  <span className={(pay.change ?? 0) < 0 ? 'text-red-500' : 'text-green-600'}>
                    {baht(Math.max(0, pay.change ?? 0))}
                  </span>
                </div>
              </div>
            )}

            {pay.method === 'transfer' && (
              <div className="flex flex-col items-center border-t pt-4">
                {pay.qrPayload ? (
                  <>
                    <div className="bg-white p-3 rounded-2xl border">
                      <QRCodeSVG value={pay.qrPayload} size={220} />
                    </div>
                    <p className="mt-3 font-bold text-blue-600 tracking-widest text-sm">สแกนเพื่อชำระเงิน</p>
                  </>
                ) : (
                  <p className="text-gray-400 font-bold">กรุณารอสักครู่</p>
                )}
              </div>
            )}

            {pay.method === 'wallet' && (
              <div className="space-y-2 border-t pt-4">
                <div className="flex justify-between text-lg font-bold text-green-600">
                  <span>รัฐบาลช่วยจ่าย</span>
                  <span>-{baht2(pay.govShare ?? 0)}</span>
                </div>
                <div className="flex justify-between text-3xl font-black text-blue-600">
                  <span>ลูกค้าจ่าย</span>
                  <span>{baht2(pay.userShare ?? 0)}</span>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
