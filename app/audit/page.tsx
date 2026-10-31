"use client"
import { useCallback, useEffect, useState } from 'react'
import { ScrollText, ChevronDown, ChevronUp } from 'lucide-react'
import { useRole } from '@/src/lib/RoleContext'
import { supabase } from '@/src/lib/supabase'

// Admin only (middleware + RLS: audit_log is readable by admins and nobody else).
// Newest first, 50 at a time, filtered by action group, person and date.

type AuditRow = {
  id: number
  created_at: string
  username: string | null
  role: string | null
  action: string
  entity: string | null
  entity_id: string | null
  summary: string | null
  old_data: unknown
  new_data: unknown
}

const PAGE = 50

// action -> Thai label + chip colour
const LABELS: Record<string, { label: string; tone: 'blue' | 'red' | 'amber' | 'green' | 'slate' }> = {
  login: { label: 'เข้าสู่ระบบ', tone: 'slate' },
  'pin.set': { label: 'ตั้ง PIN', tone: 'slate' },
  'pin.locked': { label: 'PIN ถูกล็อก', tone: 'red' },
  'password.change': { label: 'เปลี่ยนรหัสผ่าน', tone: 'amber' },
  'refund.create': { label: 'คืนสินค้า', tone: 'red' },
  'promotion.create': { label: 'สร้างโปรโมชั่น', tone: 'green' },
  'promotion.update': { label: 'แก้โปรโมชั่น', tone: 'blue' },
  'promotion.toggle': { label: 'เปิด/ปิดโปรโมชั่น', tone: 'blue' },
  'promotion.delete': { label: 'ลบโปรโมชั่น', tone: 'red' },
  'user.create': { label: 'เพิ่มผู้ใช้', tone: 'green' },
  'user.update': { label: 'แก้ไขผู้ใช้', tone: 'blue' },
  'user.role': { label: 'เปลี่ยนสิทธิ์', tone: 'amber' },
  'user.disable': { label: 'ปิดบัญชี', tone: 'red' },
  'user.enable': { label: 'เปิดบัญชี', tone: 'green' },
  'user.reset_password': { label: 'รีเซ็ตรหัสผ่าน', tone: 'amber' },
  'user.reset_pin': { label: 'รีเซ็ต PIN', tone: 'amber' },
  'products.insert': { label: 'เพิ่มสินค้า', tone: 'green' },
  'products.update': { label: 'แก้สินค้า', tone: 'blue' },
  'products.delete': { label: 'ลบสินค้า', tone: 'red' },
  'customers.insert': { label: 'เพิ่มสมาชิก', tone: 'green' },
  'customers.update': { label: 'แก้สมาชิก', tone: 'blue' },
  'customers.delete': { label: 'ลบสมาชิก', tone: 'red' },
  'settings.insert': { label: 'ตั้งค่าร้าน', tone: 'blue' },
  'settings.update': { label: 'แก้ตั้งค่าร้าน', tone: 'blue' },
  'settings.delete': { label: 'ลบตั้งค่าร้าน', tone: 'red' },
}

// Filter groups: what the person picks, and which actions it covers.
const GROUPS: { key: string; label: string; match: (a: string) => boolean }[] = [
  { key: '', label: 'ทั้งหมด', match: () => true },
  { key: 'money', label: 'คืนสินค้า / โปรโมชั่น', match: a => a.startsWith('refund.') || a.startsWith('promotion.') },
  { key: 'catalog', label: 'สินค้า / สมาชิก / ตั้งค่า', match: a => /^(products|customers|settings)\./.test(a) },
  { key: 'staff', label: 'ผู้ใช้ / รหัสผ่าน / PIN', match: a => a.startsWith('user.') || a.startsWith('pin.') || a.startsWith('password.') },
  { key: 'login', label: 'เข้าสู่ระบบ', match: a => a === 'login' },
]

const TONES = {
  blue: 'bg-blue-50 text-blue-600',
  red: 'bg-red-50 text-red-500',
  amber: 'bg-amber-50 text-amber-600',
  green: 'bg-emerald-50 text-emerald-600',
  slate: 'bg-slate-100 text-slate-500',
}

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleString('th-TH', {
    timeZone: 'Asia/Bangkok',
    day: '2-digit',
    month: 'short',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })

// Date inputs are Thai calendar days.
const dayStart = (d: string) => new Date(`${d}T00:00:00+07:00`).toISOString()
const dayEnd = (d: string) => new Date(`${d}T23:59:59.999+07:00`).toISOString()

const field = 'p-3 border border-slate-200 rounded-xl outline-none focus:border-blue-500 bg-white font-bold text-sm'

export default function AuditPage() {
  const role = useRole()
  const [rows, setRows] = useState<AuditRow[]>([])
  const [loading, setLoading] = useState(true)
  const [more, setMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState<number | null>(null)

  const [group, setGroup] = useState('')
  const [who, setWho] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [people, setPeople] = useState<string[]>([])

  const fetchRows = useCallback(
    async (offset: number) => {
      let q = supabase.from('audit_log').select('*').order('created_at', { ascending: false }).order('id', { ascending: false })
      const g = GROUPS.find(x => x.key === group)
      if (g && g.key) {
        const actions = Object.keys(LABELS).filter(g.match)
        if (actions.length) q = q.in('action', actions)
      }
      if (who) q = q.eq('username', who)
      if (from) q = q.gte('created_at', dayStart(from))
      if (to) q = q.lte('created_at', dayEnd(to))
      const { data, error: err } = await q.range(offset, offset + PAGE - 1)
      if (err) throw err
      return (data ?? []) as AuditRow[]
    },
    [group, who, from, to],
  )

  // Reload from the top whenever a filter changes.
  useEffect(() => {
    if (role !== 'admin') return
    let alive = true
    ;(async () => {
      setLoading(true)
      try {
        const data = await fetchRows(0)
        if (!alive) return
        setRows(data)
        setMore(data.length === PAGE)
        setError(null)
      } catch {
        if (alive) setError('โหลดบันทึกไม่สำเร็จ — ตรวจสอบว่ารัน audit_migration.sql แล้ว')
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => { alive = false }
  }, [role, fetchRows])

  // Names for the person filter.
  useEffect(() => {
    if (role !== 'admin') return
    supabase.from('profiles').select('username').order('username').then(({ data }) => {
      setPeople((data ?? []).map((p: { username: string }) => p.username))
    })
  }, [role])

  const loadMore = async () => {
    setLoading(true)
    try {
      const data = await fetchRows(rows.length)
      setRows(r => [...r, ...data])
      setMore(data.length === PAGE)
    } catch {
      setError('โหลดเพิ่มไม่สำเร็จ')
    } finally {
      setLoading(false)
    }
  }

  if (role !== 'admin') {
    return <div className="p-8 text-center text-slate-500 font-bold">หน้านี้สำหรับผู้ดูแลระบบเท่านั้น</div>
  }

  return (
    <div className="p-4 md:p-8 bg-[#F8FAFC] min-h-screen font-sans text-slate-900">
      <div className="max-w-4xl mx-auto space-y-6">
        <header>
          <h1 className="text-4xl font-black italic tracking-tighter uppercase flex items-center gap-3">
            <ScrollText className="text-blue-600" size={40} /> Audit Log
          </h1>
          <p className="text-slate-500 font-medium">ใครทำอะไรเมื่อไหร่ — ลบหรือแก้ไขบันทึกนี้ไม่ได้</p>
        </header>

        <section className="bg-white p-4 rounded-[2rem] shadow-sm border border-slate-100 grid grid-cols-2 md:grid-cols-4 gap-3">
          <select value={group} onChange={e => setGroup(e.target.value)} className={`${field} col-span-2 md:col-span-1`}>
            {GROUPS.map(g => <option key={g.key} value={g.key}>{g.label}</option>)}
          </select>
          <select value={who} onChange={e => setWho(e.target.value)} className={`${field} col-span-2 md:col-span-1`}>
            <option value="">ทุกคน</option>
            {people.map(p => <option key={p} value={p}>@{p}</option>)}
            <option value="system">system</option>
          </select>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} aria-label="ตั้งแต่วันที่" className={field} />
          <input type="date" value={to} onChange={e => setTo(e.target.value)} aria-label="ถึงวันที่" className={field} />
        </section>

        {error && <p className="text-sm font-bold text-red-500">{error}</p>}

        <div className="space-y-2">
          {rows.map(r => {
            const meta = LABELS[r.action] ?? { label: r.action, tone: 'slate' as const }
            const isOpen = open === r.id
            const hasDetail = r.old_data != null || r.new_data != null
            return (
              <div key={r.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm">
                <button
                  onClick={() => hasDetail && setOpen(isOpen ? null : r.id)}
                  className={`w-full text-left p-4 flex flex-wrap items-center gap-x-3 gap-y-1 ${hasDetail ? '' : 'cursor-default'}`}
                >
                  <span className={`px-2 py-0.5 rounded-lg text-[10px] font-black ${TONES[meta.tone]}`}>{meta.label}</span>
                  <span className="text-sm font-bold flex-1 min-w-[10rem]">{r.summary || r.entity_id || '—'}</span>
                  <span className="text-xs text-slate-400 font-bold">@{r.username ?? 'system'}</span>
                  <span className="text-xs text-slate-400 font-bold">{fmtTime(r.created_at)}</span>
                  {hasDetail && (isOpen ? <ChevronUp size={14} className="text-slate-400" /> : <ChevronDown size={14} className="text-slate-400" />)}
                </button>
                {isOpen && (
                  <div className="px-4 pb-4 grid md:grid-cols-2 gap-3">
                    {r.old_data != null && (
                      <div>
                        <p className="text-[10px] font-black text-slate-400 uppercase mb-1">ก่อน</p>
                        <pre className="text-[11px] bg-slate-50 rounded-xl p-3 overflow-x-auto whitespace-pre-wrap break-words">{JSON.stringify(r.old_data, null, 2)}</pre>
                      </div>
                    )}
                    {r.new_data != null && (
                      <div>
                        <p className="text-[10px] font-black text-slate-400 uppercase mb-1">หลัง</p>
                        <pre className="text-[11px] bg-slate-50 rounded-xl p-3 overflow-x-auto whitespace-pre-wrap break-words">{JSON.stringify(r.new_data, null, 2)}</pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {loading && <p className="text-sm font-bold text-slate-400">กำลังโหลด...</p>}
        {!loading && !error && rows.length === 0 && <p className="text-sm font-bold text-slate-400">ไม่พบรายการ</p>}
        {more && !loading && (
          <button onClick={loadMore} className="w-full py-3 rounded-2xl bg-white border border-slate-200 text-slate-600 font-black text-xs">
            โหลดเพิ่ม
          </button>
        )}
      </div>
    </div>
  )
}
