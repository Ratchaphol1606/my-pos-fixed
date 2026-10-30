"use client"
import { useCallback, useEffect, useState } from 'react'
import { Percent, Receipt as ReceiptIcon, Layers, Package } from 'lucide-react'
import { supabase } from '@/src/lib/supabase'
import { PRODUCT_CATEGORIES } from '@/src/lib/categories'
import { describePromo, type Promotion } from '@/src/lib/promotions'
import PromoEditor from '../component/PromoEditor'

// Bill-level and category promos are managed here. Promos for a single
// product are set on that product's form (Products page).
export default function PromotionsPage() {
  const [category, setCategory] = useState(PRODUCT_CATEGORIES[0])
  const [productPromos, setProductPromos] = useState<(Promotion & { product_name?: string })[]>([])

  const loadProductPromos = useCallback(async () => {
    const { data } = await supabase
      .from('promotions')
      .select('*, products(name)')
      .eq('scope', 'product')
      .order('created_at', { ascending: false })
    setProductPromos(((data ?? []) as unknown as (Promotion & { products: { name: string } | null })[])
      .map(p => ({ ...p, product_name: p.products?.name })))
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadProductPromos()
  }, [loadProductPromos])

  const card = 'bg-white p-6 md:p-8 rounded-[2.5rem] shadow-sm border border-slate-100'
  const title = 'text-xl font-black tracking-tight flex items-center gap-2 mb-1'
  const sub = 'text-xs text-slate-400 font-bold mb-4'

  return (
    <div className="p-4 md:p-8 bg-[#F8FAFC] min-h-screen font-sans text-slate-900">
      <div className="max-w-3xl mx-auto space-y-6">
        <header>
          <h1 className="text-4xl font-black italic tracking-tighter uppercase flex items-center gap-3">
            <Percent className="text-blue-600" size={40} /> Promotions
          </h1>
          <p className="text-slate-500 font-medium">โปรโมชั่นใช้อัตโนมัติที่หน้าคิดเงิน — แต่ละรายการสินค้าใช้โปรที่ลูกค้าได้ประโยชน์สูงสุดเพียง 1 โปร</p>
        </header>

        <section className={card}>
          <h2 className={title}><ReceiptIcon size={20} className="text-emerald-600" /> โปรทั้งบิล</h2>
          <p className={sub}>เช่น ซื้อครบ ฿1,000 ลด ฿50 — คิดจากยอดหลังหักโปรสินค้าแล้ว</p>
          <PromoEditor scope="bill" />
        </section>

        <section className={card}>
          <h2 className={title}><Layers size={20} className="text-purple-600" /> โปรตามหมวดหมู่</h2>
          <p className={sub}>ใช้กับสินค้าทุกชิ้นในหมวดที่เลือก</p>
          <select
            value={category}
            onChange={e => setCategory(e.target.value)}
            className="w-full p-3 mb-4 border border-slate-200 rounded-xl outline-none focus:border-blue-500 bg-white font-bold text-sm"
          >
            {PRODUCT_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <PromoEditor scope="category" category={category} />
        </section>

        <section className={card}>
          <h2 className={title}><Package size={20} className="text-blue-600" /> โปรของสินค้าแต่ละชิ้น</h2>
          <p className={sub}>ตั้งค่าได้ที่หน้า สินค้า → แก้ไขสินค้า (ด้านล่างฟอร์ม)</p>
          {productPromos.length === 0 ? (
            <p className="text-xs text-slate-400 font-bold">ยังไม่มีโปรโมชั่นสินค้า</p>
          ) : (
            <div className="divide-y divide-slate-50">
              {productPromos.map(p => (
                <div key={p.id} className={`py-3 flex items-center gap-3 ${p.is_active ? '' : 'opacity-50'}`}>
                  <div className="min-w-0 flex-1">
                    <p className="font-black text-sm truncate">{p.product_name ?? p.product_id}</p>
                    <p className="text-xs text-slate-500 font-bold truncate">{p.name} · {describePromo(p)}</p>
                  </div>
                  <span className={`px-2 py-1 rounded-lg text-[10px] font-black ${p.is_active ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
                    {p.is_active ? 'เปิด' : 'ปิด'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
