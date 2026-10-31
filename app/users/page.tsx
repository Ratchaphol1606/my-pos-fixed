"use client"
import { useCallback, useEffect, useState } from 'react'
import { Users, UserPlus, ShieldCheck, KeyRound, RotateCcw, Power, Pencil, X } from 'lucide-react'
import { useRole } from '@/src/lib/RoleContext'
import { apiFetch } from '@/src/lib/apiFetch'
import { MIN_PASSWORD, USERNAME_RE, normalizeUsername } from '@/src/lib/staffEmail'
import PasswordInput from '../component/PasswordInput'

// Admin only (the middleware and the API both enforce it): add staff, rename them,
// change their role, disable them, reset a password or a forgotten PIN.

type StaffUser = {
  id: string
  username: string
  displayName: string
  role: 'admin' | 'cashier'
  isActive: boolean
  hasPin: boolean
  pinLocked: boolean
}

type ModalState =
  | { kind: 'create' }
  | { kind: 'edit'; user: StaffUser }
  | { kind: 'password'; user: StaffUser }
  | { kind: 'confirm'; title: string; text: string; label: string; danger?: boolean; body: object; done: string }
  | null

// Resolves to an error message, or null when it worked (the page then closes the dialog).
type Run = (body: object, done: string) => Promise<string | null>

async function call(body: object): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await apiFetch('/api/users', {
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

const card = 'bg-white p-5 md:p-6 rounded-[2rem] shadow-sm border border-slate-100'
const label = 'text-xs font-black text-slate-500 mb-1 block'
const input =
  'w-full p-3 border border-slate-200 rounded-xl outline-none focus:border-blue-500 bg-white font-bold text-sm'
const primary = 'flex-1 py-3 rounded-xl bg-blue-600 text-white font-black text-xs disabled:opacity-50'
const ghost = 'flex-1 py-3 rounded-xl bg-slate-100 text-slate-600 font-black text-xs'
const action =
  'flex items-center gap-1 px-3 py-2 rounded-xl bg-slate-100 text-slate-600 font-black text-[11px] hover:bg-slate-200 disabled:opacity-40 disabled:hover:bg-slate-100'

function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 print:hidden">
      <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-black text-lg">{title}</h2>
          <button onClick={onClose} aria-label="ปิด" className="text-slate-400 hover:text-slate-600">
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

function CreateForm({ run, onClose }: { run: Run; onClose: () => void }) {
  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [role, setRole] = useState<'admin' | 'cashier'>('cashier')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (busy) return
    const name = normalizeUsername(username)
    if (!USERNAME_RE.test(name)) return setError('ชื่อผู้ใช้ใช้ได้เฉพาะ a-z 0-9 . _ - ความยาว 3–30 ตัว')
    if (!displayName.trim()) return setError('กรุณาใส่ชื่อที่แสดง')
    if (password.length < MIN_PASSWORD) return setError(`รหัสผ่านต้องยาวอย่างน้อย ${MIN_PASSWORD} ตัวอักษร`)
    setBusy(true)
    setError(null)
    const err = await run({ action: 'create', username: name, displayName, role, password }, 'เพิ่มผู้ใช้แล้ว')
    setBusy(false)
    if (err) setError(err)
  }

  return (
    <ModalShell title="เพิ่มผู้ใช้" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className={label}>ชื่อผู้ใช้ (ใช้ตอนเข้าสู่ระบบ)</label>
          <input
            value={username}
            onChange={e => setUsername(e.target.value)}
            autoCapitalize="none"
            autoCorrect="off"
            autoComplete="off"
            spellCheck={false}
            placeholder="เช่น somchai"
            className={input}
          />
        </div>
        <div>
          <label className={label}>ชื่อที่แสดง</label>
          <input value={displayName} onChange={e => setDisplayName(e.target.value)} maxLength={40} className={input} />
        </div>
        <div>
          <label className={label}>สิทธิ์</label>
          <select value={role} onChange={e => setRole(e.target.value as 'admin' | 'cashier')} className={input}>
            <option value="cashier">แคชเชียร์ — คิดเงิน สินค้า ยอดขาย</option>
            <option value="admin">ผู้ดูแลระบบ — เข้าถึงทุกหน้า</option>
          </select>
        </div>
        <div>
          <label className={label}>รหัสผ่านเริ่มต้น (อย่างน้อย {MIN_PASSWORD} ตัวอักษร)</label>
          <PasswordInput value={password} onChange={setPassword} />
          <p className="text-[11px] text-slate-400 font-bold mt-1">
            บอกรหัสนี้กับพนักงาน แล้วให้เปลี่ยนเองที่เมนูบัญชี — ตอนเข้าสู่ระบบครั้งแรกเขาจะได้ตั้ง PIN ของตัวเอง
          </p>
        </div>
        {error && <p className="text-sm font-bold text-red-500">{error}</p>}
        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose} className={ghost}>ยกเลิก</button>
          <button type="submit" disabled={busy} className={primary}>{busy ? 'กำลังบันทึก...' : 'เพิ่มผู้ใช้'}</button>
        </div>
      </form>
    </ModalShell>
  )
}

function EditForm({ user, isSelf, run, onClose }: { user: StaffUser; isSelf: boolean; run: Run; onClose: () => void }) {
  const [displayName, setDisplayName] = useState(user.displayName)
  const [role, setRole] = useState(user.role)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (busy) return
    if (!displayName.trim()) return setError('กรุณาใส่ชื่อที่แสดง')
    setBusy(true)
    setError(null)
    const err = await run({ action: 'update', id: user.id, displayName, role }, 'บันทึกแล้ว')
    setBusy(false)
    if (err) setError(err)
  }

  return (
    <ModalShell title={`แก้ไข @${user.username}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className={label}>ชื่อที่แสดง</label>
          <input value={displayName} onChange={e => setDisplayName(e.target.value)} maxLength={40} className={input} />
        </div>
        <div>
          <label className={label}>สิทธิ์</label>
          <select
            value={role}
            onChange={e => setRole(e.target.value as 'admin' | 'cashier')}
            disabled={isSelf}
            className={`${input} disabled:bg-slate-50 disabled:text-slate-400`}
          >
            <option value="cashier">แคชเชียร์</option>
            <option value="admin">ผู้ดูแลระบบ</option>
          </select>
          {isSelf && <p className="text-[11px] text-slate-400 font-bold mt-1">ลดสิทธิ์ของตัวเองไม่ได้</p>}
        </div>
        {error && <p className="text-sm font-bold text-red-500">{error}</p>}
        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose} className={ghost}>ยกเลิก</button>
          <button type="submit" disabled={busy} className={primary}>{busy ? 'กำลังบันทึก...' : 'บันทึก'}</button>
        </div>
      </form>
    </ModalShell>
  )
}

function PasswordForm({ user, run, onClose }: { user: StaffUser; run: Run; onClose: () => void }) {
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (busy) return
    if (password.length < MIN_PASSWORD) return setError(`รหัสผ่านต้องยาวอย่างน้อย ${MIN_PASSWORD} ตัวอักษร`)
    setBusy(true)
    setError(null)
    const err = await run({ action: 'resetPassword', id: user.id, password }, 'เปลี่ยนรหัสผ่านแล้ว')
    setBusy(false)
    if (err) setError(err)
  }

  return (
    <ModalShell title={`รีเซ็ตรหัสผ่าน @${user.username}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className={label}>รหัสผ่านใหม่ (อย่างน้อย {MIN_PASSWORD} ตัวอักษร)</label>
          <PasswordInput value={password} onChange={setPassword} />
          <p className="text-[11px] text-slate-400 font-bold mt-1">บอกรหัสใหม่กับ {user.displayName} แล้วให้เปลี่ยนเองที่เมนูบัญชี</p>
        </div>
        {error && <p className="text-sm font-bold text-red-500">{error}</p>}
        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose} className={ghost}>ยกเลิก</button>
          <button type="submit" disabled={busy} className={primary}>{busy ? 'กำลังบันทึก...' : 'ตั้งรหัสผ่านใหม่'}</button>
        </div>
      </form>
    </ModalShell>
  )
}

function ConfirmBox({
  modal,
  run,
  onClose,
}: {
  modal: Extract<NonNullable<ModalState>, { kind: 'confirm' }>
  run: Run
  onClose: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const go = async () => {
    if (busy) return
    setBusy(true)
    setError(null)
    const err = await run(modal.body, modal.done)
    setBusy(false)
    if (err) setError(err)
  }

  return (
    <ModalShell title={modal.title} onClose={onClose}>
      <p className="text-sm text-slate-500 mb-4">{modal.text}</p>
      {error && <p className="text-sm font-bold text-red-500 mb-3">{error}</p>}
      <div className="flex gap-2">
        <button onClick={onClose} className={ghost}>ยกเลิก</button>
        <button
          onClick={go}
          disabled={busy}
          className={`flex-1 py-3 rounded-xl text-white font-black text-xs disabled:opacity-50 ${modal.danger ? 'bg-red-500' : 'bg-blue-600'}`}
        >
          {busy ? 'กำลังดำเนินการ...' : modal.label}
        </button>
      </div>
    </ModalShell>
  )
}

export default function UsersPage() {
  const role = useRole()
  const [users, setUsers] = useState<StaffUser[]>([])
  const [me, setMe] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [modal, setModal] = useState<ModalState>(null)
  const [flash, setFlash] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await apiFetch('/api/users')
      const json = await res.json().catch(() => ({}))
      if (res.ok && json.ok) {
        setUsers(json.users)
        setMe(json.me)
        setLoadError(null)
      } else setLoadError(json.error ?? 'โหลดรายชื่อผู้ใช้ไม่สำเร็จ')
    } catch {
      setLoadError('เชื่อมต่อไม่ได้ กรุณาลองใหม่อีกครั้ง')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (role === 'admin') load()
  }, [role, load])

  const run: Run = async (body, done) => {
    const r = await call(body)
    if (!r.ok) return r.error ?? 'ไม่สำเร็จ'
    setModal(null)
    setFlash(done)
    setTimeout(() => setFlash(null), 4000)
    void load()
    return null
  }

  if (role !== 'admin') {
    return <div className="p-8 text-center text-slate-500 font-bold">หน้านี้สำหรับผู้ดูแลระบบเท่านั้น</div>
  }

  return (
    <div className="p-4 md:p-8 bg-[#F8FAFC] min-h-screen font-sans text-slate-900">
      <div className="max-w-3xl mx-auto space-y-6">
        <header className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-4xl font-black italic tracking-tighter uppercase flex items-center gap-3">
              <Users className="text-blue-600" size={40} /> Users
            </h1>
            <p className="text-slate-500 font-medium">จัดการบัญชีพนักงาน — เพิ่ม ปิดใช้งาน รีเซ็ตรหัสผ่านหรือ PIN</p>
          </div>
          <button
            onClick={() => setModal({ kind: 'create' })}
            className="shrink-0 flex items-center gap-2 px-4 py-3 rounded-2xl bg-blue-600 text-white font-black text-xs"
          >
            <UserPlus size={16} /> เพิ่มผู้ใช้
          </button>
        </header>

        {flash && <p className="text-sm font-black text-emerald-600">{flash}</p>}
        {loading && <p className="text-sm font-bold text-slate-400">กำลังโหลด...</p>}
        {loadError && <p className="text-sm font-bold text-red-500">{loadError}</p>}

        <div className="space-y-3">
          {users.map(u => {
            const isSelf = u.id === me
            return (
              <section key={u.id} className={`${card} ${u.isActive ? '' : 'opacity-60'}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-lg font-black">{u.displayName}{isSelf && <span className="text-slate-400 font-bold text-sm"> (คุณ)</span>}</p>
                  <span className="text-sm text-slate-400 font-bold">@{u.username}</span>
                </div>
                <div className="flex flex-wrap gap-2 mt-2">
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-wider ${
                      u.role === 'admin' ? 'bg-amber-50 text-amber-600' : 'bg-blue-50 text-blue-600'
                    }`}
                  >
                    <ShieldCheck size={10} /> {u.role === 'admin' ? 'ผู้ดูแลระบบ' : 'แคชเชียร์'}
                  </span>
                  {!u.isActive && (
                    <span className="px-2 py-0.5 rounded-lg text-[10px] font-black bg-slate-100 text-slate-500">ปิดใช้งาน</span>
                  )}
                  <span
                    className={`px-2 py-0.5 rounded-lg text-[10px] font-black ${
                      u.pinLocked
                        ? 'bg-red-50 text-red-500'
                        : u.hasPin
                          ? 'bg-emerald-50 text-emerald-600'
                          : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {u.pinLocked ? 'PIN ถูกล็อก' : u.hasPin ? 'ตั้ง PIN แล้ว' : 'ยังไม่ตั้ง PIN'}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2 mt-4">
                  <button className={action} onClick={() => setModal({ kind: 'edit', user: u })}>
                    <Pencil size={12} /> แก้ไข
                  </button>
                  <button className={action} onClick={() => setModal({ kind: 'password', user: u })}>
                    <KeyRound size={12} /> รีเซ็ตรหัสผ่าน
                  </button>
                  <button
                    className={action}
                    disabled={!u.hasPin}
                    onClick={() =>
                      setModal({
                        kind: 'confirm',
                        title: 'รีเซ็ต PIN?',
                        text: `${u.displayName} จะต้องตั้ง PIN ใหม่ตอนเข้าสู่ระบบด้วยรหัสผ่านครั้งถัดไป`,
                        label: 'รีเซ็ต PIN',
                        body: { action: 'resetPin', id: u.id },
                        done: 'รีเซ็ต PIN แล้ว',
                      })
                    }
                  >
                    <RotateCcw size={12} /> รีเซ็ต PIN
                  </button>
                  <button
                    className={action}
                    disabled={isSelf}
                    onClick={() =>
                      setModal({
                        kind: 'confirm',
                        title: u.isActive ? 'ปิดใช้งานบัญชีนี้?' : 'เปิดใช้งานบัญชีนี้?',
                        text: u.isActive
                          ? `${u.displayName} จะเข้าสู่ระบบไม่ได้อีก (ประวัติการขายยังอยู่ครบ) เปิดกลับมาได้ทุกเมื่อ`
                          : `${u.displayName} จะเข้าสู่ระบบได้อีกครั้ง`,
                        label: u.isActive ? 'ปิดใช้งาน' : 'เปิดใช้งาน',
                        danger: u.isActive,
                        body: { action: 'update', id: u.id, isActive: !u.isActive },
                        done: u.isActive ? 'ปิดใช้งานแล้ว' : 'เปิดใช้งานแล้ว',
                      })
                    }
                  >
                    <Power size={12} /> {u.isActive ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}
                  </button>
                </div>
              </section>
            )
          })}
        </div>
      </div>

      {modal?.kind === 'create' && <CreateForm run={run} onClose={() => setModal(null)} />}
      {modal?.kind === 'edit' && (
        <EditForm user={modal.user} isSelf={modal.user.id === me} run={run} onClose={() => setModal(null)} />
      )}
      {modal?.kind === 'password' && <PasswordForm user={modal.user} run={run} onClose={() => setModal(null)} />}
      {modal?.kind === 'confirm' && <ConfirmBox modal={modal} run={run} onClose={() => setModal(null)} />}
    </div>
  )
}
