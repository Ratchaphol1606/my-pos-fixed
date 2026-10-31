"use client"
import { useCallback, useEffect, useState } from 'react'
import { Percent, Plus, Trash2, Pencil, X } from 'lucide-react'
import { supabase } from '@/src/lib/supabase'
import { apiFetch } from '@/src/lib/apiFetch'
import {
  BILL_TYPES, LINE_TYPES, describePromo, validatePromo,
  type PromoScope, type PromoType, type Promotion,
} from '@/src/lib/promotions'

interface Props {
  scope: PromoScope
  productId?: string   // scope = 'product'
  category?: string    // scope = 'category'
  onChanged?: () => void
}

const TYPE_LABEL: Record<PromoType, string> = {
  percent: 'ลดเป็น %',
  amount: 'ลดเป็นบาท/ชิ้น',
  bundle: 'ซื้อครบชิ้น ราคาพิเศษ',
  buy_get: 'ซื้อ X แถม Y',
  bill_percent: 'ซื้อครบ ลดเป็น %',
  bill_amount: 'ซื้อครบ ลดเป็นบาท',
}

interface FormState {
  id: string | null
  name: string
  type: PromoType
  value: string
  buy_qty: string
  get_qty: string
  min_spend: string
  members_only: boolean
  starts_at: string
  ends_at: string
}

const emptyForm = (scope: PromoScope): FormState => ({
  id: null, name: '', type: scope === 'bill' ? 'bill_amount' : 'percent',
  value: '', buy_qty: '', get_qty: '', min_spend: '',
  members_only: false, starts_at: '', ends_at: '',
})

async function callApi(body: object): Promise<{ ok: boolean; error?: string }> {
  const res = await apiFetch('/api/promotions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const json = await res.json().catch(() => ({}))
  return { ok: res.ok && json.ok === true, error: json.error }
}

export default function PromoEditor({ scope, productId, category, onChanged }: Props) {
  const [promos, setPromos] = useState<Promotion[]>([])
  const [form, setForm] = useState<FormState | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    let q = supabase.from('promotions').select('*').eq('scope', scope).order('created_at', { ascending: false })
    if (scope === 'product') q = q.eq('product_id', productId ?? '')
    if (scope === 'category') q = q.eq('category', category ?? '')
    const { data } = await q
    setPromos((data ?? []) as Promotion[])
  }, [scope, productId, category])

  // Reload (and close any open form) whenever the target product/category changes.
  useEffect(() => {
    load(); setForm(null); setError(null)
  }, [load])

  const types = scope === 'bill' ? BILL_TYPES : LINE_TYPES

  const edit = (p: Promotion) => {
    setError(null)
    setForm({
      id: p.id, name: p.name, type: p.type,
      value: p.value == null ? '' : String(p.value),
      buy_qty: p.buy_qty == null ? '' : String(p.buy_qty),
      get_qty: p.get_qty == null ? '' : String(p.get_qty),
      min_spend: p.min_spend ? String(p.min_spend) : '',
      members_only: p.members_only,
      starts_at: p.starts_at ?? '', ends_at: p.ends_at ?? '',
    })
  }

  const run = async (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setBusy(true); setError(null)
    try {
      const r = await fn()
      if (!r.ok) { setError(r.error || 'บันทึกไม่สำเร็จ'); return false }
      await load(); onChanged?.()
      return true
    } finally { setBusy(false) }
  }

  const save = async () => {
    if (!form) return
    const promo = {
      name: form.name, scope,
      product_id: scope === 'product' ? productId ?? null : null,
      category: scope === 'category' ? category ?? null : null,
      type: form.type,
      value: form.value === '' ? null : Number(form.value),
      buy_qty: form.buy_qty === '' ? null : Number(form.buy_qty),
      get_qty: form.get_qty === '' ? null : Number(form.get_qty),
      min_spend: scope === 'bill' ? Number(form.min_spend || 0) : 0,
      members_only: form.members_only,
      starts_at: form.starts_at || null, ends_at: form.ends_at || null,
    }
    const problem = validatePromo(promo)
    if (problem) { setError(problem); return }
    if (await run(() => callApi({ action: 'save', id: form.id, promo }))) setForm(null)
  }

  const inputCls = 'w-full p-3 border border-slate-200 rounded-xl outline-none focus:border-blue-500 text-sm bg-white'
  const labelCls = 'text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1 block'
  const f = form

  return (
    <div className="space-y-3">
      {promos.length === 0 && !f && (
        <p className="text-xs text-slate-400 font-bold">ยังไม่มีโปรโมชั่น</p>
      )}

      {promos.map(p => (
        <div key={p.id} className={`flex items-center gap-3 p-3 rounded-2xl border ${p.is_active ? 'bg-emerald-50/50 border-emerald-100' : 'bg-slate-50 border-slate-100 opacity-70'}`}>
          <div className="min-w-0 flex-1">
            <p className="font-black text-sm text-slate-800 truncate">{p.name}</p>
            <p className="text-xs font-bold text-emerald-700">{describePromo(p)}</p>
            <p className="text-[10px] text-slate-400 font-bold">
              {p.members_only ? 'เฉพาะสมาชิก · ' : ''}
              {p.starts_at || p.ends_at ? `${p.starts_at ?? '...'} ถึง ${p.ends_at ?? '...'}` : 'ไม่มีกำหนดวัน'}
            </p>
          </div>
          <button
            disabled={busy}
            onClick={() => run(() => callApi({ action: 'toggle', id: p.id, is_active: !p.is_active }))}
            className={`px-3 py-1.5 rounded-xl text-[10px] font-black ${p.is_active ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-500'}`}
          >
            {p.is_active ? 'เปิดอยู่' : 'ปิดอยู่'}
          </button>
          <button onClick={() => edit(p)} className="p-2 rounded-xl bg-blue-50 text-blue-600" title="แก้ไข"><Pencil size={15} /></button>
          <button
            disabled={busy}
            onClick={() => { if (confirm(`ลบโปรโมชั่น "${p.name}" ?`)) run(() => callApi({ action: 'delete', id: p.id })) }}
            className="p-2 rounded-xl bg-red-50 text-red-500" title="ลบ"
          ><Trash2 size={15} /></button>
        </div>
      ))}

      {!f && (
        <button
          onClick={() => { setError(null); setForm(emptyForm(scope)) }}
          className="w-full py-3 rounded-2xl border-2 border-dashed border-slate-200 text-slate-500 font-black text-xs flex items-center justify-center gap-2 hover:border-blue-400 hover:text-blue-600"
        >
          <Plus size={16} /> เพิ่มโปรโมชั่น
        </button>
      )}

      {f && (
        <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
          <div className="flex items-center justify-between">
            <p className="font-black text-sm flex items-center gap-2"><Percent size={16} /> {f.id ? 'แก้ไขโปรโมชั่น' : 'โปรโมชั่นใหม่'}</p>
            <button onClick={() => setForm(null)} className="p-1 text-slate-400"><X size={16} /></button>
          </div>

          <div>
            <label className={labelCls}>ชื่อโปรโมชั่น</label>
            <input className={inputCls} value={f.name} maxLength={80} placeholder="เช่น ลดล้างสต็อก"
              onChange={e => setForm({ ...f, name: e.target.value })} />
          </div>

          <div>
            <label className={labelCls}>ประเภท</label>
            <select className={inputCls} value={f.type}
              onChange={e => setForm({ ...f, type: e.target.value as PromoType })}>
              {types.map(t => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {(f.type === 'percent' || f.type === 'bill_percent') && (
              <div><label className={labelCls}>ลด (%)</label>
                <input type="number" min="0" max="100" className={inputCls} value={f.value} onChange={e => setForm({ ...f, value: e.target.value })} /></div>
            )}
            {(f.type === 'amount' || f.type === 'bill_amount') && (
              <div><label className={labelCls}>{f.type === 'amount' ? 'ลดต่อชิ้น (บาท)' : 'ลด (บาท)'}</label>
                <input type="number" min="0" className={inputCls} value={f.value} onChange={e => setForm({ ...f, value: e.target.value })} /></div>
            )}
            {f.type === 'bundle' && (
              <>
                <div><label className={labelCls}>ซื้อครบ (ชิ้น)</label>
                  <input type="number" min="2" className={inputCls} value={f.buy_qty} onChange={e => setForm({ ...f, buy_qty: e.target.value })} /></div>
                <div><label className={labelCls}>ราคารวมของชุด (บาท)</label>
                  <input type="number" min="0" className={inputCls} value={f.value} onChange={e => setForm({ ...f, value: e.target.value })} /></div>
              </>
            )}
            {f.type === 'buy_get' && (
              <>
                <div><label className={labelCls}>ซื้อ (ชิ้น)</label>
                  <input type="number" min="1" className={inputCls} value={f.buy_qty} onChange={e => setForm({ ...f, buy_qty: e.target.value })} /></div>
                <div><label className={labelCls}>แถม (ชิ้น)</label>
                  <input type="number" min="1" className={inputCls} value={f.get_qty} onChange={e => setForm({ ...f, get_qty: e.target.value })} /></div>
              </>
            )}
            {scope === 'bill' && (
              <div><label className={labelCls}>ยอดซื้อขั้นต่ำ (บาท)</label>
                <input type="number" min="0" className={inputCls} value={f.min_spend} onChange={e => setForm({ ...f, min_spend: e.target.value })} /></div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div><label className={labelCls}>เริ่ม (ไม่บังคับ)</label>
              <input type="date" className={inputCls} value={f.starts_at} onChange={e => setForm({ ...f, starts_at: e.target.value })} /></div>
            <div><label className={labelCls}>สิ้นสุด (ไม่บังคับ)</label>
              <input type="date" className={inputCls} value={f.ends_at} onChange={e => setForm({ ...f, ends_at: e.target.value })} /></div>
          </div>

          <label className="flex items-center gap-2 text-sm font-bold text-slate-600">
            <input type="checkbox" checked={f.members_only} onChange={e => setForm({ ...f, members_only: e.target.checked })} />
            เฉพาะสมาชิก
          </label>

          {error && <p className="p-3 rounded-xl bg-red-50 text-red-600 text-xs font-bold">{error}</p>}

          <div className="flex gap-2">
            <button onClick={() => setForm(null)} className="flex-1 py-3 rounded-xl bg-white border border-slate-200 text-slate-500 font-black text-xs">ยกเลิก</button>
            <button onClick={save} disabled={busy} className="flex-1 py-3 rounded-xl bg-blue-600 text-white font-black text-xs disabled:opacity-50">
              {busy ? '...' : 'บันทึกโปรโมชั่น'}
            </button>
          </div>
        </div>
      )}

      {!f && error && <p className="p-3 rounded-xl bg-red-50 text-red-600 text-xs font-bold">{error}</p>}
    </div>
  )
}
