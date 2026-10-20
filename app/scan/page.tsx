"use client"
import { useEffect, useRef, useState } from 'react'
import { Camera, CheckCircle2, XCircle, Wifi, WifiOff, Link2 } from 'lucide-react'
import CameraScanner from '../component/CameraScanner'
import { normalizePairCode, useScanSender, type ScanResult } from '@/src/lib/useScanRelay'

const TARGET_KEY = 'pos_scan_target'

// One shared AudioContext, created/resumed on the first tap or keypress.
// iOS only lets audio play after a user gesture, and results arrive
// asynchronously over the websocket, so the context has to be unlocked
// ahead of time rather than created at beep time.
let audioCtx: AudioContext | null = null

function getAudio(): AudioContext | null {
  try {
    if (!audioCtx) {
      const Ctx = window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      audioCtx = new Ctx()
    }
    if (audioCtx.state === 'suspended') void audioCtx.resume()
    return audioCtx
  } catch {
    return null
  }
}

function playBeep(freq: number, durationMs: number) {
  const ctx = getAudio()
  if (!ctx) return
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.frequency.value = freq
  osc.connect(gain)
  gain.connect(ctx.destination)
  gain.gain.setValueAtTime(0.15, ctx.currentTime)
  osc.start()
  osc.stop(ctx.currentTime + durationMs / 1000)
}

interface LogEntry {
  key: number
  code: string
  status: 'sent' | 'found' | 'notfound' | 'failed'
  name?: string
}

// Remote scanner: scans here (hardware scanner or camera) show up on the
// paired POS screen in real time. Open it via the QR code in the POS
// screen's "เชื่อมต่อเครื่องสแกน" dialog.
export default function RemoteScanPage() {
  const [pairCode, setPairCode] = useState<string | null>(null)
  const [codeInput, setCodeInput] = useState('')
  const [manual, setManual] = useState('')
  const [showCamera, setShowCamera] = useState(false)
  const [log, setLog] = useState<LogEntry[]>([])
  const keyRef = useRef(0)
  const inputRef = useRef<HTMLInputElement>(null)

  // Unlock audio on the first interaction anywhere on the page.
  useEffect(() => {
    const unlock = () => { getAudio() }
    window.addEventListener('pointerdown', unlock)
    window.addEventListener('keydown', unlock)
    return () => {
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
    }
  }, [])

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

  const handleResult = (r: ScanResult) => {
    // Beep only once the POS confirms, so a high beep means the item
    // really landed in the cart; low buzz = not found.
    if (r.status === 'found') playBeep(880, 120)
    else playBeep(220, 250)
    setLog(prev => {
      // Mark the oldest still-pending entry for this code.
      const idx = [...prev].reverse().findIndex(e => e.code === r.code && e.status === 'sent')
      if (idx === -1) return prev
      const realIdx = prev.length - 1 - idx
      const next = [...prev]
      next[realIdx] = { ...next[realIdx], status: r.status, name: r.name }
      return next
    })
  }

  const { connected, posOnline, sendScan } = useScanSender(pairCode, handleResult)

  const send = async (raw: string) => {
    const code = raw.trim()
    if (!code) return
    const key = ++keyRef.current
    setLog(prev => [{ key, code, status: 'sent' as const }, ...prev].slice(0, 30))
    const ok = await sendScan(code)
    if (!ok) {
      playBeep(220, 250)
      setLog(prev => prev.map(e => (e.key === key ? { ...e, status: 'failed' as const } : e)))
    }
  }

  const connectWith = () => {
    const code = normalizePairCode(codeInput)
    if (code.length < 4) return
    try { localStorage.setItem(TARGET_KEY, code) } catch { /* ignore */ }
    setPairCode(code)
  }

  const statusLine = !pairCode
    ? 'ใส่รหัสเชื่อมต่อจากหน้าจอ POS'
    : !connected
      ? 'กำลังเชื่อมต่อ...'
      : posOnline
        ? 'เชื่อมต่อกับเครื่อง POS แล้ว'
        : 'ออนไลน์ แต่ยังไม่เห็นเครื่อง POS'

  return (
    <div className="max-w-md mx-auto p-4 flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-black text-gray-800">เครื่องสแกนระยะไกล</h1>
        <p className="text-xs text-gray-500">สแกนที่นี่ สินค้าจะขึ้นบนหน้าจอ POS ทันที</p>
      </div>

      <div className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold ${
        pairCode && connected && posOnline ? 'bg-emerald-50 text-emerald-700'
        : pairCode && connected ? 'bg-amber-50 text-amber-700'
        : 'bg-gray-100 text-gray-600'
      }`}>
        {pairCode && connected ? <Wifi size={16} /> : <WifiOff size={16} />}
        {statusLine}
        {pairCode && <span className="ml-auto font-mono tracking-widest text-xs">{pairCode}</span>}
      </div>

      <div className="flex gap-2">
        <input
          className="flex-1 p-3 rounded-xl shadow-sm text-black font-mono tracking-widest uppercase outline-none focus:ring-2 ring-blue-500"
          placeholder="รหัสเชื่อมต่อ"
          value={codeInput}
          maxLength={8}
          onChange={(e) => setCodeInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') connectWith() }}
        />
        <button
          onClick={connectWith}
          className="shrink-0 px-4 bg-blue-600 text-white rounded-xl shadow-sm font-bold text-sm flex items-center gap-1.5"
        >
          <Link2 size={16} /> เชื่อมต่อ
        </button>
      </div>

      <div className="flex gap-2">
        <input
          ref={inputRef}
          autoFocus
          disabled={!pairCode}
          className="flex-1 p-3 rounded-xl shadow-sm text-base text-black outline-none focus:ring-2 ring-blue-500 disabled:opacity-50"
          placeholder="ยิงบาร์โค้ดที่นี่..."
          value={manual}
          onChange={(e) => setManual(e.target.value)}
          onKeyDown={(e) => {
            // Hardware scanners type the code then press Enter.
            if (e.key === 'Enter' && manual.trim()) {
              send(manual)
              setManual('')
            }
          }}
        />
        <button
          disabled={!pairCode}
          onClick={() => setShowCamera(true)}
          title="สแกนด้วยกล้อง"
          className="shrink-0 px-4 bg-slate-900 text-white rounded-xl shadow-sm disabled:opacity-50 flex items-center justify-center"
        >
          <Camera size={18} />
        </button>
      </div>

      <ul className="flex flex-col gap-1.5">
        {log.map(e => (
          <li key={e.key} className="flex items-center gap-2 bg-white rounded-xl px-3 py-2 shadow-sm text-sm">
            {e.status === 'found' && <CheckCircle2 size={16} className="text-emerald-500 shrink-0" />}
            {(e.status === 'notfound' || e.status === 'failed') && <XCircle size={16} className="text-red-500 shrink-0" />}
            {e.status === 'sent' && <span className="w-4 h-4 rounded-full border-2 border-gray-300 border-t-blue-500 animate-spin shrink-0" />}
            <span className="min-w-0 flex-1 truncate text-gray-800">
              {e.status === 'found' && e.name ? e.name : e.code}
            </span>
            <span className="text-[10px] font-bold text-gray-400 shrink-0">
              {e.status === 'found' ? 'เพิ่มแล้ว'
                : e.status === 'notfound' ? 'ไม่พบสินค้า'
                : e.status === 'failed' ? 'ส่งไม่สำเร็จ'
                : 'รอผล'}
            </span>
          </li>
        ))}
      </ul>

      {/* Must stay mounted (see CameraScanner) — toggle with `visible`. */}
      <CameraScanner
        visible={showCamera}
        onScan={(code) => send(code)}
        onClose={() => { setShowCamera(false); inputRef.current?.focus() }}
      />
    </div>
  )
}
