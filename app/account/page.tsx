"use client"
import { useState } from 'react'
import { UserCircle, KeyRound, Lock, ShieldCheck } from 'lucide-react'
import { useAuth } from '@/src/lib/RoleContext'
import { apiFetch } from '@/src/lib/apiFetch'
import { MIN_PASSWORD } from '@/src/lib/staffEmail'
import PasswordInput from '../component/PasswordInput'

// "My account": any logged-in person can change their own PIN and password here.
// Both calls need the page to be PIN-unlocked, which it always is when you can see it.

type Msg = { ok: boolean; text: string } | null

async function post(url: string, body: object): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await apiFetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const json = await res.json().catch(() => ({}))
    return res.ok && json.ok ? { ok: true } : { ok: false, error: json.error ?? 'ไม่สำเร็จ' }
  } catch {
    return { ok: false, error: 'เชื่อมต่อไม่ได้ กรุณาลองใหม่อีกครั้ง' }
  }
}

const card = 'bg-white p-6 md:p-8 rounded-[2.5rem] shadow-sm border border-slate-100'
const title = 'text-xl font-black tracking-tight flex items-center gap-2 mb-1'
const sub = 'text-xs text-slate-400 font-bold mb-4'
const label = 'text-xs font-black text-slate-500 mb-1 block'
const input =
  'w-full p-3 border border-slate-200 rounded-xl outline-none focus:border-blue-500 bg-white font-bold text-sm'
const save = 'w-full py-3 rounded-xl bg-blue-600 text-white font-black text-xs disabled:opacity-50'

const digits = (v: string) => v.replace(/\D/g, '').slice(0, 4)

function Notice({ msg }: { msg: Msg }) {
  if (!msg) return null
  return (
    <p className={`text-sm font-bold ${msg.ok ? 'text-emerald-600' : 'text-red-500'}`}>{msg.text}</p>
  )
}

function PinForm() {
  const [pin, setPin] = useState('')
  const [again, setAgain] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<Msg>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (busy) return
    if (pin.length !== 4) return setMsg({ ok: false, text: 'PIN ต้องเป็นตัวเลข 4 หลัก' })
    if (pin !== again) return setMsg({ ok: false, text: 'PIN ทั้งสองครั้งไม่ตรงกัน' })
    setBusy(true)
    const r = await post('/api/pin', { action: 'set', pin })
    setBusy(false)
    if (r.ok) {
      setPin('')
      setAgain('')
      setMsg({ ok: true, text: 'เปลี่ยน PIN แล้ว ใช้ PIN ใหม่ตอนรีเซ็ตหน้าจอครั้งถัดไป' })
    } else setMsg({ ok: false, text: r.error ?? 'ไม่สำเร็จ' })
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div>
        <label className={label}>PIN ใหม่ (ตัวเลข 4 หลัก)</label>
        <input
          type="password"
          inputMode="numeric"
          autoComplete="off"
          maxLength={4}
          value={pin}
          onChange={e => setPin(digits(e.target.value))}
          className={`${input} tracking-[0.5em]`}
        />
      </div>
      <div>
        <label className={label}>ยืนยัน PIN ใหม่</label>
        <input
          type="password"
          inputMode="numeric"
          autoComplete="off"
          maxLength={4}
          value={again}
          onChange={e => setAgain(digits(e.target.value))}
          className={`${input} tracking-[0.5em]`}
        />
      </div>
      <Notice msg={msg} />
      <button type="submit" disabled={busy} className={save}>
        {busy ? 'กำลังบันทึก...' : 'บันทึก PIN'}
      </button>
    </form>
  )
}

function PasswordForm() {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [again, setAgain] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<Msg>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (busy) return
    if (!current) return setMsg({ ok: false, text: 'กรุณาใส่รหัสผ่านปัจจุบัน' })
    if (next.length < MIN_PASSWORD) {
      return setMsg({ ok: false, text: `รหัสผ่านใหม่ต้องยาวอย่างน้อย ${MIN_PASSWORD} ตัวอักษร` })
    }
    if (next !== again) return setMsg({ ok: false, text: 'รหัสผ่านใหม่ทั้งสองครั้งไม่ตรงกัน' })
    setBusy(true)
    const r = await post('/api/account', { action: 'changePassword', currentPassword: current, newPassword: next })
    setBusy(false)
    if (r.ok) {
      setCurrent('')
      setNext('')
      setAgain('')
      setMsg({ ok: true, text: 'เปลี่ยนรหัสผ่านแล้ว อุปกรณ์เครื่องอื่นที่ล็อกอินบัญชีนี้จะถูกออกจากระบบ' })
    } else setMsg({ ok: false, text: r.error ?? 'ไม่สำเร็จ' })
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div>
        <label className={label}>รหัสผ่านปัจจุบัน</label>
        <PasswordInput value={current} onChange={setCurrent} autoComplete="current-password" />
      </div>
      <div>
        <label className={label}>รหัสผ่านใหม่ (อย่างน้อย {MIN_PASSWORD} ตัวอักษร)</label>
        <PasswordInput value={next} onChange={setNext} />
      </div>
      <div>
        <label className={label}>ยืนยันรหัสผ่านใหม่</label>
        <PasswordInput value={again} onChange={setAgain} />
      </div>
      <Notice msg={msg} />
      <button type="submit" disabled={busy} className={save}>
        {busy ? 'กำลังบันทึก...' : 'เปลี่ยนรหัสผ่าน'}
      </button>
    </form>
  )
}

export default function AccountPage() {
  const { user } = useAuth()

  return (
    <div className="p-4 md:p-8 bg-[#F8FAFC] min-h-screen font-sans text-slate-900">
      <div className="max-w-xl mx-auto space-y-6">
        <header>
          <h1 className="text-4xl font-black italic tracking-tighter uppercase flex items-center gap-3">
            <UserCircle className="text-blue-600" size={40} /> Account
          </h1>
          <p className="text-slate-500 font-medium">บัญชีของฉัน — เปลี่ยน PIN และรหัสผ่านของตัวเอง</p>
        </header>

        {user && (
          <section className={card}>
            <p className="text-2xl font-black">{user.displayName}</p>
            <p className="text-sm text-slate-400 font-bold">@{user.username}</p>
            <span
              className={`inline-flex items-center gap-1 mt-3 px-2 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-wider ${
                user.role === 'admin' ? 'bg-amber-50 text-amber-600' : 'bg-blue-50 text-blue-600'
              }`}
            >
              <ShieldCheck size={10} /> {user.role === 'admin' ? 'ผู้ดูแลระบบ' : 'แคชเชียร์'}
            </span>
          </section>
        )}

        <section className={card}>
          <h2 className={title}>
            <Lock size={20} className="text-blue-600" /> เปลี่ยน PIN
          </h2>
          <p className={sub}>PIN ใช้ปลดล็อกหน้าจอเมื่อรีเฟรช — ลืม PIN ให้ผู้ดูแลระบบรีเซ็ตให้</p>
          <PinForm />
        </section>

        <section className={card}>
          <h2 className={title}>
            <KeyRound size={20} className="text-purple-600" /> เปลี่ยนรหัสผ่าน
          </h2>
          <p className={sub}>รหัสผ่านใช้เข้าสู่ระบบตอนเปิดแอปใหม่หรือข้ามวัน</p>
          <PasswordForm />
        </section>
      </div>
    </div>
  )
}
