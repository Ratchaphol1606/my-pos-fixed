"use client"
import { useCallback, useEffect, useMemo, useState } from 'react'
import { usePathname } from 'next/navigation'
import { Lock, Delete, Eye, EyeOff } from 'lucide-react'
import { RoleContext, AuthContext, type AuthUser } from '@/src/lib/RoleContext'
import { supabase } from '@/src/lib/supabase'
import { apiFetch, setUnlockToken } from '@/src/lib/apiFetch'
import { usernameToEmail } from '@/src/lib/staffEmail'

// The front door of the whole app (the file keeps its old name so layout.tsx
// doesn't change). One component, five states:
//
//   booting   checking whether this tab already has a login
//   login     username + password            (new tab, app reopened, new day, logged out)
//   setup     choose your 4-digit PIN        (first login only)
//   locked    PIN pad                        (page was refreshed, or Lock was pressed)
//   unlocked  the app
//
// The unlock state lives only in React state + a module variable, so refreshing
// the page always lands on `locked`. Closing the tab/app drops the Supabase login
// (sessionStorage), and the server kills every login at the 04:00 cutoff.

type Phase = 'booting' | 'login' | 'setup' | 'locked' | 'unlocked'
type PinResult = { ok: boolean; message?: string }

// Server codes that mean "this login is no good any more": go back to the password.
const RELOGIN_CODES = ['pin_locked', 'session_expired', 'no_login', 'disabled', 'no_pin']

function Screen({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 bg-gradient-to-br from-blue-600 to-blue-800 overflow-y-auto print:hidden">
      <div className="min-h-full flex flex-col items-center justify-center py-8 px-4">{children}</div>
    </div>
  )
}

function Header({ shopName, subtitle }: { shopName: string; subtitle: string }) {
  return (
    <>
      <div className="bg-white/20 p-5 rounded-full">
        <Lock size={40} className="text-white" />
      </div>
      <div className="text-center">
        <h1 className="text-white text-2xl font-black">{shopName}</h1>
        <p className="text-blue-200 text-sm mt-1">{subtitle}</p>
      </div>
    </>
  )
}

function LoginForm({
  shopName,
  onSubmit,
}: {
  shopName: string
  onSubmit: (username: string, password: string) => Promise<string | null>
}) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (busy || !username.trim() || !password) return
    setBusy(true)
    setError(null)
    try {
      const message = await onSubmit(username, password)
      if (message) setError(message)
    } catch {
      setError('เชื่อมต่อไม่ได้ กรุณาลองใหม่อีกครั้ง')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col items-center gap-6 w-full max-w-sm">
      <Header shopName={shopName} subtitle="เข้าสู่ระบบเพื่อใช้งาน" />
      <form onSubmit={submit} className="bg-white rounded-3xl p-6 w-full shadow-xl flex flex-col gap-4">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-bold text-gray-500">ชื่อผู้ใช้</span>
          <input
            value={username}
            onChange={e => setUsername(e.target.value)}
            autoCapitalize="none"
            autoCorrect="off"
            autoComplete="username"
            spellCheck={false}
            className="w-full px-4 py-3 rounded-2xl border border-gray-200 text-gray-800 outline-none focus:ring-2 focus:ring-blue-500"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-bold text-gray-500">รหัสผ่าน</span>
          <div className="relative">
            <input
              type={show ? 'text' : 'password'}
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoComplete="current-password"
              className="w-full px-4 py-3 pr-12 rounded-2xl border border-gray-200 text-gray-800 outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="button"
              onClick={() => setShow(s => !s)}
              aria-label={show ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
            >
              {show ? <EyeOff size={20} /> : <Eye size={20} />}
            </button>
          </div>
        </label>
        {error && <p className="text-red-500 text-sm font-bold -mt-1">{error}</p>}
        <button
          type="submit"
          disabled={busy || !username.trim() || !password}
          className="bg-blue-600 text-white font-bold py-3 rounded-2xl disabled:opacity-50"
        >
          {busy ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}
        </button>
      </form>
    </div>
  )
}

function PinPad({
  title,
  subtitle,
  notice,
  onComplete,
  footer,
}: {
  title: string
  subtitle: string
  notice?: string | null
  onComplete: (pin: string) => Promise<PinResult>
  footer?: React.ReactNode
}) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [shake, setShake] = useState(false)
  const [busy, setBusy] = useState(false)

  const fail = (message: string) => {
    setError(message)
    setShake(true)
    setTimeout(() => { setPin(''); setShake(false) }, 600)
  }

  // Called straight from the 4th key press (not from an effect), so it stays a
  // plain event handler.
  const submit = async (candidate: string) => {
    setBusy(true)
    try {
      const result = await onComplete(candidate)
      if (!result.ok) fail(result.message ?? 'PIN ไม่ถูกต้อง')
    } catch {
      fail('เชื่อมต่อไม่ได้ กรุณาลองใหม่อีกครั้ง')
    } finally {
      setBusy(false)
    }
  }

  const press = (digit: string) => {
    if (busy || pin.length >= 4) return
    const next = pin + digit
    setError(null)
    setPin(next)
    if (next.length === 4) void submit(next)
  }

  const del = () => setPin(p => p.slice(0, -1))
  const message = error ?? notice ?? null

  return (
    <div className="flex flex-col items-center gap-6">
      <div className="bg-white/20 p-5 rounded-full">
        <Lock size={40} className="text-white" />
      </div>
      <div className="text-center">
        <h1 className="text-white text-2xl font-black">{title}</h1>
        <p className="text-blue-200 text-sm mt-1">{subtitle}</p>
      </div>

      <div className={`flex gap-4 ${shake ? 'animate-bounce' : ''}`}>
        {[0, 1, 2, 3].map(i => (
          <div
            key={i}
            className={`w-4 h-4 rounded-full border-2 border-white transition-all ${
              pin.length > i ? 'bg-white' : 'bg-transparent'
            } ${error ? 'border-red-400 bg-red-400' : ''}`}
          />
        ))}
      </div>

      {message && <p className="text-red-300 text-sm font-bold -mt-2 text-center max-w-xs">{message}</p>}

      <div className={`grid grid-cols-3 gap-3 mt-2 ${busy ? 'opacity-50 pointer-events-none' : ''}`}>
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(n => (
          <button
            key={n}
            onClick={() => press(n)}
            disabled={busy}
            className="w-20 h-20 bg-white/20 hover:bg-white/30 active:bg-white/10 text-white text-2xl font-bold rounded-2xl transition-all"
          >
            {n}
          </button>
        ))}
        <div />
        <button
          onClick={() => press('0')}
          disabled={busy}
          className="w-20 h-20 bg-white/20 hover:bg-white/30 active:bg-white/10 text-white text-2xl font-bold rounded-2xl transition-all"
        >
          0
        </button>
        <button
          onClick={del}
          disabled={busy}
          className="w-20 h-20 bg-white/20 hover:bg-white/30 active:bg-white/10 text-white rounded-2xl transition-all flex items-center justify-center"
        >
          <Delete size={24} />
        </button>
      </div>

      {footer}
    </div>
  )
}

export default function PinLock({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [phase, setPhase] = useState<Phase>('booting')
  const [user, setUser] = useState<AuthUser | null>(null)
  const [exp, setExp] = useState(0)
  const [shopName, setShopName] = useState('บุญชอบเครื่องครัว')
  // PIN setup asks twice; this holds the first entry while the second is typed.
  const [setupFirst, setSetupFirst] = useState<string | null>(null)
  const [setupNotice, setSetupNotice] = useState<string | null>(null)

  useEffect(() => {
    const fetchShopName = async () => {
      const { data } = await supabase.from('settings').select('shop_name').eq('id', 1).single()
      if (data?.shop_name) setShopName(data.shop_name)
    }
    fetchShopName()
  }, [])

  // Back to the password screen. Local sign-out only, so other devices that the
  // same person is logged in on are not kicked out.
  const logout = useCallback(async () => {
    setUnlockToken(null)
    await fetch('/api/session', { method: 'DELETE' }).catch(() => {})
    await supabase.auth.signOut({ scope: 'local' }).catch(() => {})
    setUser(null)
    setSetupFirst(null)
    setSetupNotice(null)
    setPhase('login')
  }, [])

  // Back to the PIN screen (same person, quick).
  const lock = useCallback(() => {
    setUnlockToken(null)
    setPhase('locked')
  }, [])

  // On every full page load: is this tab still logged in? If so the PIN screen
  // comes up, which is the "re-unlock on refresh" behaviour.
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const { data } = await supabase.auth.getSession()
        if (!data.session) {
          if (alive) setPhase('login')
          return
        }
        const res = await apiFetch('/api/session')
        const json = res.ok ? await res.json() : null
        if (!alive) return
        if (json?.ok && json.hasPin) {
          setUser(json.user)
          setExp(json.exp)
          setPhase('locked')
          return
        }
        // Login without a valid POS session, or PIN setup never finished: start over.
        await logout()
      } catch {
        if (alive) setPhase('login')
      }
    })()
    return () => { alive = false }
  }, [logout])

  // Supabase drops the session on its own if the refresh token stops working.
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange(event => {
      if (event === 'SIGNED_OUT') {
        setUnlockToken(null)
        setUser(null)
        setPhase('login')
      }
    })
    return () => data.subscription.unsubscribe()
  }, [])

  // The server ends every login at the 04:00 cutoff; the browser notices here.
  useEffect(() => {
    if (phase !== 'locked' && phase !== 'unlocked' && phase !== 'setup') return
    const id = setInterval(() => {
      if (exp && Date.now() >= exp) void logout()
    }, 30_000)
    return () => clearInterval(id)
  }, [phase, exp, logout])

  const handleLogin = async (username: string, password: string): Promise<string | null> => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: usernameToEmail(username),
      password,
    })
    if (error || !data.session) return 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง'

    const res = await apiFetch('/api/session', { method: 'POST' })
    const json = await res.json().catch(() => null)
    if (!res.ok || !json?.ok) {
      await supabase.auth.signOut({ scope: 'local' })
      return json?.error ?? 'เข้าสู่ระบบไม่สำเร็จ'
    }

    // Typing the password counts as unlocking, so no PIN is asked right after login.
    setUnlockToken(json.unlock)
    setUser(json.user)
    setExp(json.exp)
    setSetupFirst(null)
    setSetupNotice(null)
    setPhase(json.hasPin ? 'unlocked' : 'setup')
    return null
  }

  const handleVerify = async (pin: string): Promise<PinResult> => {
    const res = await apiFetch('/api/pin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'verify', pin }),
    })
    const json = await res.json().catch(() => ({}))
    if (res.ok && json.ok) {
      setUnlockToken(json.unlock)
      setPhase('unlocked')
      return { ok: true }
    }
    if (RELOGIN_CODES.includes(json.code)) {
      setTimeout(() => void logout(), 1500)
      return { ok: false, message: json.error }
    }
    if (json.code === 'bad_pin' && typeof json.remaining === 'number') {
      return { ok: false, message: `PIN ไม่ถูกต้อง (เหลืออีก ${json.remaining} ครั้ง)` }
    }
    return { ok: false, message: json.error ?? 'PIN ไม่ถูกต้อง' }
  }

  const handleSetup = async (pin: string): Promise<PinResult> => {
    if (setupFirst === null) {
      setSetupFirst(pin)
      setSetupNotice(null)
      return { ok: true }
    }
    if (pin !== setupFirst) {
      setSetupFirst(null)
      setSetupNotice('PIN ไม่ตรงกัน ลองตั้งใหม่อีกครั้ง')
      return { ok: true }
    }
    const res = await apiFetch('/api/pin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'set', pin }),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok || !json.ok) {
      setSetupFirst(null)
      setSetupNotice(json.error ?? 'บันทึก PIN ไม่สำเร็จ ลองอีกครั้ง')
      return { ok: true }
    }
    setSetupFirst(null)
    setSetupNotice(null)
    setPhase('unlocked')
    return { ok: true }
  }

  const authApi = useMemo(() => ({ user, lock, logout }), [user, lock, logout])

  // The customer display (/display) is a read-only screen that only shows
  // what the cashier's POS broadcasts to it — it has no database access
  // and must not ask the customer to log in.
  if (pathname === '/display') return <>{children}</>

  if (phase === 'unlocked' && user) {
    return (
      <RoleContext.Provider value={user.role}>
        <AuthContext.Provider value={authApi}>{children}</AuthContext.Provider>
      </RoleContext.Provider>
    )
  }

  if (phase === 'booting') {
    return (
      <Screen>
        <div className="text-white/60 text-sm font-bold uppercase tracking-widest">กำลังตรวจสอบ...</div>
      </Screen>
    )
  }

  if (phase === 'setup' && user) {
    return (
      <Screen>
        <PinPad
          key={setupFirst === null ? 'setup-1' : 'setup-2'}
          title={setupFirst === null ? 'ตั้ง PIN 4 หลัก' : 'ยืนยัน PIN อีกครั้ง'}
          subtitle={`สวัสดี ${user.displayName} · ใช้ปลดล็อกเมื่อรีเฟรชหน้าจอ`}
          notice={setupNotice}
          onComplete={handleSetup}
        />
      </Screen>
    )
  }

  if (phase === 'locked' && user) {
    return (
      <Screen>
        <PinPad
          title={shopName}
          subtitle={`สวัสดี ${user.displayName} · ใส่ PIN เพื่อปลดล็อก`}
          onComplete={handleVerify}
          footer={
            <button onClick={() => void logout()} className="text-blue-200 text-sm underline mt-2">
              ไม่ใช่คุณ? ออกจากระบบ
            </button>
          }
        />
      </Screen>
    )
  }

  return (
    <Screen>
      <LoginForm shopName={shopName} onSubmit={handleLogin} />
    </Screen>
  )
}
