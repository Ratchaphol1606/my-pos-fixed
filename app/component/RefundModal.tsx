"use client"
import { useEffect, useMemo, useState } from 'react'
import { X, Undo2, CheckCircle2 } from 'lucide-react'
import { supabase } from '@/src/lib/supabase'
import type { Sale } from '@/src/types'

interface Line {
  product_id: string
  name: string
  sold: number
  refunded: number
  price: number
}

interface Result {
  refund_no: string
  refund_amount: number
  points_taken_back: number
  points_restored: number
}

interface Props {
  sale: Sale
  onClose: () => void
  onDone: () => void
}

const baht = (n: number) => `฿${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`

export default function RefundModal({ sale, onClose, onDone }: Props) {
  const [lines, setLines] = useState<Line[]>([])
  const [qty, setQty] = useState<Record<string, number>>({})
  const [method, setMethod] = useState<'cash' | 'transfer'>(sale.payment_method === 'transfer' ? 'transfer' : 'cash')
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<Result | null>(null)

  const isWallet = sale.payment_method === 'wallet'

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const [{ data: items, error: itemsErr }, { data: refunds }] = await Promise.all([
        supabase
          .from('sale_items')
          .select('product_id, quantity, price_at_sale, products(name)')
          .eq('sale_id', sale.id),
        supabase
          .from('refunds')
          .select('refund_items(product_id, quantity)')
          .eq('sale_id', sale.id),
      ])
      if (cancelled) return
      if (itemsErr) { setError(itemsErr.message); setLoading(false); return }

      const refunded: Record<string, number> = {}
      ;((refunds ?? []) as unknown as { refund_items: { product_id: string; quantity: number }[] | null }[]).forEach(r =>
        (r.refund_items ?? []).forEach(i => {
          refunded[i.product_id] = (refunded[i.product_id] || 0) + Number(i.quantity)
        }))

      // Merge duplicate product rows (weighted price) so each product appears once
      const byProduct: Record<string, Line> = {}
      ;((items ?? []) as unknown as {
        product_id: string; quantity: number; price_at_sale: number; products: { name: string } | null
      }[]).forEach(i => {
        const q = Number(i.quantity) || 0
        const p = Number(i.price_at_sale) || 0
        const cur = byProduct[i.product_id]
        if (cur) {
          cur.price = (cur.price * cur.sold + p * q) / (cur.sold + q)
          cur.sold += q
        } else {
          byProduct[i.product_id] = {
            product_id: i.product_id,
            name: i.products?.name || i.product_id,
            sold: q,
            refunded: refunded[i.product_id] || 0,
            price: p,
          }
        }
      })
      setLines(Object.values(byProduct))
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [sale.id])

  const gross = lines.reduce((s, l) => s + l.price * l.sold, 0)
  const ratio = gross > 0 ? Number(sale.total_amount) / gross : 0

  // Preview only: the server does the real calculation (and exact rounding).
  const preview = useMemo(
    () => lines.reduce((s, l) => s + Math.round(l.price * (qty[l.product_id] || 0) * ratio * 100) / 100, 0),
    [lines, qty, ratio],
  )
  const chosen = lines.filter(l => (qty[l.product_id] || 0) > 0)
  const allGone = lines.length > 0 && lines.every(l => l.sold - l.refunded <= 0)

  const setLineQty = (l: Line, v: number) => {
    const max = l.sold - l.refunded
    setQty(prev => ({ ...prev, [l.product_id]: Math.max(0, Math.min(max, Math.floor(v) || 0)) }))
  }

  const submit = async () => {
    if (chosen.length === 0 || busy) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/refund', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sale_id: sale.id,
          method,
          reason,
          items: chosen.map(l => ({ product_id: l.product_id, quantity: qty[l.product_id] })),
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.ok) throw new Error(json.error || 'คืนสินค้าไม่สำเร็จ')
      setResult(json.result)
      onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'คืนสินค้าไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-3xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Undo2 size={20} className="text-red-500" /> คืนสินค้า #{sale.receipt_no}
          </h2>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-slate-100 text-slate-500"><X size={20} /></button>
        </div>

        {result ? (
          <div className="p-6 text-center">
            <CheckCircle2 size={56} className="mx-auto text-emerald-500 mb-3" />
            <p className="text-lg font-black">คืนสินค้าเรียบร้อย</p>
            <p className="text-sm text-slate-500 mt-1">ใบลดหนี้ {result.refund_no}</p>
            <p className="text-3xl font-black text-red-500 mt-4">คืนเงิน {baht(Number(result.refund_amount))}</p>
            <p className="text-sm text-slate-500 mt-1">{method === 'cash' ? 'เงินสด' : 'โอนเงิน'}</p>
            {(result.points_taken_back > 0 || result.points_restored > 0) && (
              <div className="mt-4 text-sm text-slate-600 space-y-1">
                {result.points_taken_back > 0 && <p>หักแต้มที่ได้รับ -{result.points_taken_back} แต้ม</p>}
                {result.points_restored > 0 && <p>คืนแต้มที่ใช้ +{result.points_restored} แต้ม</p>}
              </div>
            )}
            <button onClick={onClose} className="mt-6 w-full py-3 rounded-2xl bg-slate-100 text-slate-700 font-bold hover:bg-slate-200">ปิด</button>
          </div>
        ) : (
          <>
            <div className="p-5 space-y-4">
              {isWallet && (
                <p className="p-3 rounded-2xl bg-amber-50 text-amber-700 text-sm font-bold">
                  บิลเป๋าตังคืนผ่านระบบไม่ได้ ต้องจัดการด้วยตนเอง
                </p>
              )}
              {loading && <p className="text-center text-slate-400 py-6">กำลังโหลด...</p>}
              {!loading && allGone && (
                <p className="p-3 rounded-2xl bg-slate-100 text-slate-600 text-sm font-bold text-center">บิลนี้คืนสินค้าครบทุกรายการแล้ว</p>
              )}

              {!loading && lines.map(l => {
                const left = l.sold - l.refunded
                return (
                  <div key={l.product_id} className={`flex items-center gap-3 ${left <= 0 ? 'opacity-40' : ''}`}>
                    <div className="min-w-0 flex-1">
                      <p className="font-bold truncate">{l.name}</p>
                      <p className="text-xs text-slate-400">
                        {baht(l.price)} · ซื้อ {l.sold}{l.refunded > 0 ? ` · คืนแล้ว ${l.refunded}` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        disabled={left <= 0 || isWallet}
                        onClick={() => setLineQty(l, (qty[l.product_id] || 0) - 1)}
                        className="w-9 h-9 rounded-xl bg-slate-100 font-black disabled:opacity-40"
                      >−</button>
                      <input
                        type="number"
                        inputMode="numeric"
                        disabled={left <= 0 || isWallet}
                        value={qty[l.product_id] || 0}
                        onChange={e => setLineQty(l, Number(e.target.value))}
                        className="w-12 h-9 text-center font-black rounded-xl bg-slate-50 outline-none"
                      />
                      <button
                        disabled={left <= 0 || isWallet}
                        onClick={() => setLineQty(l, (qty[l.product_id] || 0) + 1)}
                        className="w-9 h-9 rounded-xl bg-slate-100 font-black disabled:opacity-40"
                      >+</button>
                    </div>
                  </div>
                )
              })}

              {!loading && !allGone && (
                <>
                  <div className="flex gap-2">
                    {(['cash', 'transfer'] as const).map(m => (
                      <button
                        key={m}
                        onClick={() => setMethod(m)}
                        className={`flex-1 py-2 rounded-xl font-bold text-sm ${method === m ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-500'}`}
                      >
                        {m === 'cash' ? 'คืนเงินสด' : 'คืนโอนเงิน'}
                      </button>
                    ))}
                  </div>
                  <input
                    value={reason}
                    onChange={e => setReason(e.target.value)}
                    maxLength={200}
                    placeholder="เหตุผล (ไม่บังคับ)"
                    className="w-full p-3 rounded-xl bg-slate-50 outline-none text-sm"
                  />
                  <div className="flex justify-between items-baseline border-t pt-3">
                    <span className="text-slate-500 font-bold">ยอดคืนเงิน</span>
                    <span className="text-3xl font-black text-red-500">{baht(preview)}</span>
                  </div>
                  {sale.customer_id && (
                    <p className="text-xs text-slate-400">แต้มสมาชิกจะถูกปรับตามสัดส่วนสินค้าที่คืนโดยอัตโนมัติ</p>
                  )}
                </>
              )}

              {error && <p className="p-3 rounded-2xl bg-red-50 text-red-600 text-sm font-bold">{error}</p>}
            </div>

            <div className="p-5 border-t flex gap-3">
              <button onClick={onClose} className="flex-1 py-3 rounded-2xl bg-slate-100 text-slate-600 font-bold hover:bg-slate-200">ยกเลิก</button>
              <button
                onClick={submit}
                disabled={busy || chosen.length === 0 || isWallet || allGone}
                className="flex-1 py-3 rounded-2xl bg-red-500 text-white font-bold hover:bg-red-600 disabled:opacity-40"
              >
                {busy ? 'กำลังบันทึก...' : 'ยืนยันคืนสินค้า'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
