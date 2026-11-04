"use client"
import { useCallback, useEffect, useState } from 'react'
import { Layers, Plus, Trash2 } from 'lucide-react'
import { supabase } from '@/src/lib/supabase'
import { apiFetch } from '@/src/lib/apiFetch'
import { tiersBelowCost, validateTiers, type PriceTier } from '@/src/lib/priceTiers'

type SaveResult = { ok: boolean; error?: string }

interface Props {
  productId: string
  retailPrice: number
  costPrice: number
  onChanged?: () => void
  // The product form's UPDATE button calls this so tier rows that were typed
  // but not saved yet are saved together with the product instead of being lost.
  flushRef?: { current: (() => Promise<SaveResult>) | null }
}

interface Row { min_qty: string; unit_price: string }

const toTiers = (rows: Row[]): PriceTier[] =>
  rows.map(r => ({ min_qty: Number(r.min_qty), unit_price: Number(r.unit_price) }))

export default function PriceTierEditor({ productId, retailPrice, costPrice, onChanged, flushRef }: Props) {
  const [rows, setRows] = useState<Row[]>([])
  const [saved, setSaved] = useState('')       // JSON of what is in the database
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('product_price_tiers').select('min_qty, unit_price').eq('product_id', productId).order('min_qty')
    const next = ((data ?? []) as { min_qty: number; unit_price: number }[])
      .map(t => ({ min_qty: String(t.min_qty), unit_price: String(t.unit_price) }))
    setRows(next); setSaved(JSON.stringify(next)); setError(null)
  }, [productId])

  // Reload whenever a different product is opened for editing.
  useEffect(() => { setNotice(null); load() }, [load])

  const dirty = JSON.stringify(rows) !== saved
  // Rows left completely blank (clicked "add" but never filled in) are ignored.
  const tiers = toTiers(rows.filter(r => r.min_qty !== '' || r.unit_price !== ''))
  const belowCost = tiersBelowCost(tiers.filter(t => Number.isFinite(t.unit_price)), costPrice)

  const update = (i: number, patch: Partial<Row>) =>
    setRows(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))

  const persist = async (): Promise<SaveResult> => {
    const problem = validateTiers(tiers, retailPrice)
    if (problem) { setError(problem); return { ok: false, error: problem } }
    setBusy(true); setError(null)
    try {
      const res = await apiFetch('/api/price-tiers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save', product_id: productId, tiers }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || json.ok !== true) {
        const msg = json.error || 'บันทึกไม่สำเร็จ'
        setError(msg)
        return { ok: false, error: msg }
      }
      await load(); onChanged?.()
      setNotice('บันทึกราคาส่งแล้ว ✓')
      return { ok: true }
    } finally { setBusy(false) }
  }
  const save = async () => { await persist() }

  // Hand the parent a way to save pending rows (re-registered every render so it
  // always sees the latest rows). Nothing pending means nothing to do.
  useEffect(() => {
    if (!flushRef) return
    flushRef.current = async () => (dirty ? persist() : { ok: true })
    return () => { flushRef.current = null }
  })

  const inputCls = 'w-full p-3 border border-slate-200 rounded-xl outline-none focus:border-blue-500 text-sm bg-white'

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-400 font-bold flex items-center gap-2">
        <Layers size={14} /> ปกติ ฿{retailPrice.toLocaleString()}/ชิ้น · ซื้อตั้งแต่จำนวนที่กำหนดขึ้นไป ได้ราคาส่งต่อชิ้น
      </p>

      {rows.length === 0 && (
        <p className="text-xs text-slate-400 font-bold">ยังไม่มีราคาส่ง</p>
      )}

      {rows.map((r, i) => (
        <div key={i} className="flex items-end gap-3">
          <div className="flex-1">
            <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1 block">ซื้อตั้งแต่ (ชิ้น)</label>
            <input type="number" min="2" className={inputCls} value={r.min_qty}
              onChange={e => update(i, { min_qty: e.target.value })} />
          </div>
          <div className="flex-1">
            <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1 block">ราคาต่อชิ้น (บาท)</label>
            <input type="number" min="0" className={inputCls} value={r.unit_price}
              onChange={e => update(i, { unit_price: e.target.value })} />
          </div>
          <button onClick={() => setRows(rows.filter((_, idx) => idx !== i))}
            className="p-3 rounded-xl bg-red-50 text-red-500" title="ลบขั้นนี้">
            <Trash2 size={15} />
          </button>
        </div>
      ))}

      {belowCost.length > 0 && (
        <p className="p-3 rounded-xl bg-amber-50 text-amber-700 text-xs font-bold">
          ⚠ ราคาต่ำกว่าทุน (฿{costPrice.toLocaleString()}): {belowCost.map(t => `${t.min_qty}+ ชิ้น ฿${t.unit_price}`).join(', ')}
        </p>
      )}
      {error && <p className="p-3 rounded-xl bg-red-50 text-red-600 text-xs font-bold">{error}</p>}
      {notice && !dirty && !error && (
        <p className="text-xs font-bold text-emerald-600">{notice}</p>
      )}
      {dirty && !error && (
        <p className="text-xs font-bold text-sky-600">ยังไม่ได้บันทึกราคาส่ง — กด “บันทึกราคาส่ง” หรือ UPDATE ด้านขวา</p>
      )}

      <div className="flex gap-2">
        <button
          onClick={() => { setError(null); setRows([...rows, { min_qty: '', unit_price: '' }]) }}
          disabled={rows.length >= 10}
          className="flex-1 py-3 rounded-2xl border-2 border-dashed border-slate-200 text-slate-500 font-black text-xs flex items-center justify-center gap-2 hover:border-blue-400 hover:text-blue-600 disabled:opacity-40"
        >
          <Plus size={16} /> เพิ่มขั้นราคาส่ง
        </button>
        {dirty && (
          <button onClick={save} disabled={busy}
            className="flex-1 py-3 rounded-2xl bg-blue-600 text-white font-black text-xs disabled:opacity-50">
            {busy ? '...' : 'บันทึกราคาส่ง'}
          </button>
        )}
      </div>
    </div>
  )
}
