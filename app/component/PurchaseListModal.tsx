"use client"
import { useState, useEffect } from 'react'
import { supabase } from '@/src/lib/supabase'
import { Search, X, Plus, Minus, Trash2, ShoppingBasket, Send } from 'lucide-react'
import { Product } from '@/src/types'
import { apiFetch } from '@/src/lib/apiFetch'

// Simple "things to buy" list. Lives in this browser only (localStorage),
// so it opens instantly and needs no database table.
const STORAGE_KEY = 'pos_purchase_list_v1'

type Item = { id: string; name: string; cost: number; qty: number }

const baht = (n: number) =>
  n.toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 2 })

export default function PurchaseListModal({
  open,
  onClose,
  onCountChange,
}: {
  open: boolean
  onClose: () => void
  onCountChange?: (count: number) => void
}) {
  const [items, setItems] = useState<Item[]>([])
  const [loaded, setLoaded] = useState(false)
  const [search, setSearch] = useState('')
  const [results, setResults] = useState<Product[]>([])
  const [searching, setSearching] = useState(false)
  const [sendState, setSendState] = useState<'idle' | 'sending' | 'sent'>('idle')

  // Load saved list once
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed)) setItems(parsed)
      }
    } catch {}
    setLoaded(true)
  }, [])

  // Save on every change (only after the first load, so we never wipe it)
  useEffect(() => {
    if (!loaded) return
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
    } catch {}
    onCountChange?.(items.length)
  }, [items, loaded])

  // Debounced product search
  useEffect(() => {
    const term = search.replace(/[,()%]/g, '').trim()
    if (!open || !term) {
      setResults([])
      return
    }
    setSearching(true)
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from('products')
        .select('*')
        .eq('is_active', true)
        .or(`name.ilike.%${term}%,id.ilike.%${term}%`)
        .limit(8)
      setResults((data ?? []) as Product[])
      setSearching(false)
    }, 250)
    return () => clearTimeout(t)
  }, [search, open])

  const addProduct = (p: Product) => {
    setItems(prev => {
      const existing = prev.find(i => i.id === p.id)
      if (existing) return prev.map(i => (i.id === p.id ? { ...i, qty: i.qty + 1 } : i))
      return [...prev, { id: p.id, name: p.name, cost: Number(p.cost_price) || 0, qty: 1 }]
    })
    setSearch('')
    setResults([])
  }

  const setQty = (id: string, qty: number) =>
    setItems(prev => prev.map(i => (i.id === id ? { ...i, qty: Math.max(1, Math.floor(qty) || 1) } : i)))

  const setCost = (id: string, cost: number) =>
    setItems(prev => prev.map(i => (i.id === id ? { ...i, cost: Math.max(0, cost || 0) } : i)))

  const remove = (id: string) => setItems(prev => prev.filter(i => i.id !== id))

  const clearAll = () => {
    if (items.length && confirm('ล้างรายการทั้งหมด?')) setItems([])
  }

  const sendToLine = async () => {
    if (!items.length || sendState === 'sending') return
    setSendState('sending')
    try {
      const res = await apiFetch('/api/line/purchase-list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: items.map(i => ({ name: i.name, qty: i.qty, cost: i.cost })) }),
      })
      const json = await res.json().catch(() => ({}))
      if (res.ok && json.ok) {
        setSendState('sent')
        setTimeout(() => setSendState('idle'), 2500)
        return
      }
      alert(json.error ?? 'ส่งเข้าไลน์ไม่สำเร็จ')
    } catch {
      alert('เชื่อมต่อไม่ได้ กรุณาลองใหม่อีกครั้ง')
    }
    setSendState('idle')
  }

  const total = items.reduce((s, i) => s + i.cost * i.qty, 0)
  const totalQty = items.reduce((s, i) => s + i.qty, 0)

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-6" onClick={onClose}>
      <div
        className="bg-white w-full sm:max-w-2xl h-[92vh] sm:h-auto sm:max-h-[85vh] rounded-t-[2rem] sm:rounded-[2rem] shadow-2xl flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-black text-lg text-slate-800 flex items-center gap-2">
            <ShoppingBasket size={20} className="text-blue-600" /> ของที่ต้องซื้อ
          </h2>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-slate-100 text-slate-400">
            <X size={20} />
          </button>
        </div>

        {/* Search */}
        <div className="p-4 border-b border-slate-50 relative">
          <Search className="absolute left-8 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
          <input
            autoFocus
            placeholder="พิมพ์ชื่อหรือรหัสสินค้า..."
            className="w-full pl-12 pr-4 py-3 bg-white border border-slate-200 focus:border-blue-500 rounded-2xl outline-none"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search.trim() && (
            <div className="mt-2 border border-slate-100 rounded-2xl overflow-hidden max-h-60 overflow-y-auto">
              {searching && results.length === 0 && (
                <div className="p-4 text-sm text-slate-400">กำลังค้นหา...</div>
              )}
              {!searching && results.length === 0 && (
                <div className="p-4 text-sm text-slate-400">ไม่พบสินค้า</div>
              )}
              {results.map(p => (
                <button
                  key={p.id}
                  onClick={() => addProduct(p)}
                  className="w-full text-left px-4 py-3 hover:bg-blue-50 flex items-center justify-between gap-3 border-b border-slate-50 last:border-0"
                >
                  <div className="min-w-0">
                    <div className="font-bold text-sm text-slate-800 truncate">{p.name}</div>
                    <div className="text-[11px] text-slate-400 font-mono">
                      {p.id} · สต็อก {p.stock}
                    </div>
                  </div>
                  <div className="text-xs font-bold text-slate-500 shrink-0">ทุน ฿{baht(Number(p.cost_price) || 0)}</div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-[120px]">
          {items.length === 0 && (
            <div className="text-center text-slate-300 py-10 text-sm font-medium">
              ยังไม่มีรายการ ค้นหาสินค้าด้านบนเพื่อเพิ่ม
            </div>
          )}
          {items.map(i => (
            <div key={i.id} className="border border-slate-100 rounded-2xl p-3 flex flex-col gap-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-bold text-sm text-slate-800 truncate">{i.name}</div>
                  <div className="text-[11px] text-slate-400 font-mono">{i.id}</div>
                </div>
                <button onClick={() => remove(i.id)} className="p-1.5 text-slate-300 hover:text-red-500 shrink-0">
                  <Trash2 size={16} />
                </button>
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setQty(i.id, i.qty - 1)}
                    className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center"
                  >
                    <Minus size={14} />
                  </button>
                  <input
                    type="number"
                    min={1}
                    value={i.qty}
                    onChange={e => setQty(i.id, Number(e.target.value))}
                    className="w-14 h-8 text-center border border-slate-200 rounded-xl outline-none focus:border-blue-500 font-bold text-sm"
                  />
                  <button
                    onClick={() => setQty(i.id, i.qty + 1)}
                    className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center"
                  >
                    <Plus size={14} />
                  </button>
                </div>
                <div className="flex items-center gap-1 text-xs text-slate-400">
                  ×
                  <input
                    type="number"
                    min={0}
                    value={i.cost}
                    onChange={e => setCost(i.id, Number(e.target.value))}
                    className="w-20 h-8 text-right px-2 border border-slate-200 rounded-xl outline-none focus:border-blue-500 text-sm text-slate-700"
                  />
                  ฿
                </div>
                <div className="ml-auto font-black text-slate-800">฿{baht(i.cost * i.qty)}</div>
              </div>
              {i.cost === 0 && (
                <div className="text-[11px] text-amber-600 font-medium">ไม่มีราคาทุน — ใส่ราคาเองได้</div>
              )}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between gap-3">
          <div>
            <div className="text-[11px] text-slate-400 font-bold">
              {items.length} รายการ · {totalQty} ชิ้น
            </div>
            <div className="text-2xl font-black text-slate-900">฿{baht(total)}</div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={sendToLine}
              disabled={items.length === 0 || sendState === 'sending'}
              className="px-4 py-2 rounded-2xl text-xs font-bold text-white bg-[#06C755] hover:bg-[#05b34c] disabled:opacity-40 flex items-center gap-1.5"
            >
              <Send size={14} />
              {sendState === 'sending' ? 'กำลังส่ง...' : sendState === 'sent' ? 'ส่งแล้ว ✓' : 'ส่งไลน์'}
            </button>
            <button
              onClick={clearAll}
              disabled={items.length === 0}
              className="px-4 py-2 rounded-2xl text-xs font-bold text-red-500 bg-white border border-red-100 hover:bg-red-50 disabled:opacity-40"
            >
              ล้างรายการ
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
