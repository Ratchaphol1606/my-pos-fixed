"use client"
import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/src/lib/supabase'
import { Trash2, Edit3, Plus, Search, AlertCircle, X, Save, Tag, Barcode } from 'lucide-react'

interface Product {
  id: string;
  name: string;
  category: string;
  cost_price: number;
  retail_price: number;
  stock: number;
  date_add: string;
}

export default function ProductPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [form, setForm] = useState({ id: '', name: '', category: 'ทั่วไป', costPrice: 0, retailPrice: 0, stock: 0 })
  
  const idInputRef = useRef<HTMLInputElement>(null) // สำหรับ Auto Focus

  const categories = ['ทั่วไป','พลาสติก', 'อุปกรณ์ครัว', 'อุปกรณ์ไฟฟ้า', 'เครื่องแต่งกาย', 'กิฟต์ชอป', 'เครื่องมือช่าง','เครื่องนอน']

  // Generate a unique 10-digit internal ID: "INT" + timestamp suffix
  const generateProductId = () => {
    const ts = Date.now().toString().slice(-7) // last 7 digits of timestamp
    const rand = Math.floor(Math.random() * 1000).toString().padStart(3, '0')
    return `INT${ts}${rand}`
  }

  const fetchProducts = async () => {
    const { data } = await supabase.from('products').select('*').order('date_add', { ascending: false })
    if (data) setProducts(data)
  }

  useEffect(() => { 
    fetchProducts()
    setForm(f => ({ ...f, id: generateProductId() }))
    idInputRef.current?.focus()
  }, [])

  const margin = form.retailPrice - form.costPrice
  const marginPercent = form.retailPrice > 0 ? (margin / form.retailPrice) * 100 : 0

  const resetForm = () => {
    setForm({ id: generateProductId(), name: '', category: 'ทั่วไป', costPrice: 0, retailPrice: 0, stock: 0 })
    setIsEditing(false)
    setTimeout(() => idInputRef.current?.focus(), 100)
  }

  const handleSave = async () => {
    if (!form.name.trim()) {
      alert("⚠️ กรุณากรอกชื่อสินค้าให้ครบถ้วน");
      return;
    }

    setLoading(true)
    try {
      if (!isEditing) {
        const { data: existing } = await supabase.from('products').select('id').eq('id', form.id).single()
        if (existing) {
          alert(`❌ รหัสสินค้า "${form.id}" ซ้ำ! มีอยู่ในระบบแล้ว`);
          setLoading(false); return;
        }
      }

      const { error } = await supabase.from('products').upsert({
        id: form.id,
        name: form.name,
        category: form.category,
        cost_price: form.costPrice,
        retail_price: form.retailPrice,
        stock: form.stock,
        date_add: new Date().toISOString()
      });

      if (error) throw error
      
      alert(isEditing ? '✅ อัปเดตข้อมูลแล้ว' : '✅ บันทึกสินค้าใหม่แล้ว')
      resetForm()
      fetchProducts()
    } catch (err: any) {
      alert("Error: " + err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleEdit = (p: Product) => {
    setForm({ id: p.id, name: p.name, category: p.category || 'ทั่วไป', costPrice: p.cost_price, retailPrice: p.retail_price, stock: p.stock })
    setIsEditing(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <div className="p-4 md:p-8 bg-[#F8FAFC] min-h-screen font-sans text-slate-900">
      <div className="max-w-6xl mx-auto">
        <header className="mb-10 flex justify-between items-center">
          <div>
            <h1 className="text-4xl font-black italic tracking-tighter uppercase flex items-center gap-3">
              <Barcode className="text-blue-600" size={40} /> Inventory Manager
            </h1>
            <p className="text-slate-500 font-medium">จัดการสต็อกสินค้าและต้นทุนอย่างเป็นระบบ</p>
          </div>
        </header>

        {/* --- Input Section --- */}
        <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100 mb-10 grid grid-cols-1 lg:grid-cols-3 gap-8 relative overflow-hidden">
          <div className="lg:col-span-2 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em] mb-2 block">ID / Barcode</label>
                <div className="flex gap-2">
                  <input 
                    ref={idInputRef}
                    disabled={isEditing} 
                    className={`flex-1 p-4 border rounded-2xl outline-none transition-all font-mono text-sm ${isEditing ? 'bg-slate-50 text-slate-400 border-slate-200 cursor-not-allowed' : 'bg-white border-slate-200 focus:border-blue-500'}`} 
                    value={form.id} onChange={e => setForm({...form, id: e.target.value})} 
                  />
                  {!isEditing && (
                    <button
                      type="button"
                      onClick={() => setForm(f => ({ ...f, id: generateProductId() }))}
                      title="สร้างรหัสใหม่"
                      className="px-3 py-2 bg-slate-100 hover:bg-blue-100 text-slate-500 hover:text-blue-600 rounded-2xl transition-all text-xs font-bold"
                    >
                      🔄
                    </button>
                  )}
                </div>
                {!isEditing && (
                  <p className="text-[9px] text-slate-400 mt-1 ml-1">สร้างอัตโนมัติ — แก้ไขได้ หรือกด 🔄 เพื่อสร้างใหม่</p>
                )}
              </div>
              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em] mb-2 block">Category</label>
                <select 
                  className="w-full p-4 border border-slate-200 rounded-2xl outline-none focus:border-blue-500 bg-white"
                  value={form.category} onChange={e => setForm({...form, category: e.target.value})}
                >
                  {categories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em] mb-2 block">Product Name</label>
              <input 
                className="w-full p-4 border border-slate-200 rounded-2xl outline-none focus:border-blue-500"
                value={form.name} onChange={e => setForm({...form, name: e.target.value})} 
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em] mb-2 block">Cost (ทุน)</label>
                <input type="number" className="w-full p-4 border border-slate-200 rounded-2xl outline-none focus:border-blue-500"
                  value={form.costPrice} onChange={e => setForm({...form, costPrice: Number(e.target.value)})} />
              </div>
              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em] mb-2 block">Retail (ขาย)</label>
                <input type="number" className="w-full p-4 border border-slate-200 rounded-2xl outline-none focus:border-blue-500"
                  value={form.retailPrice} onChange={e => setForm({...form, retailPrice: Number(e.target.value)})} />
              </div>
              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em] mb-2 block">Stock</label>
                <input type="number" className="w-full p-4 border border-slate-200 rounded-2xl outline-none focus:border-blue-500 font-bold"
                  value={form.stock} onChange={e => setForm({...form, stock: Number(e.target.value)})} />
              </div>
            </div>
          </div>

          <div className={`p-8 rounded-[2.5rem] flex flex-col justify-between transition-all ${isEditing ? 'bg-amber-600 text-white' : 'bg-slate-900 text-white'}`}>
            <div className="space-y-6">
              <div>
                <p className="text-white/40 text-[10px] font-bold uppercase tracking-widest mb-1">Estimated Profit</p>
                <p className="text-4xl font-black tracking-tighter">฿{margin.toLocaleString()}</p>
                <p className={`text-xs font-bold mt-1 ${marginPercent > 20 ? 'text-emerald-400' : 'text-amber-400'}`}>
                  Margin: {marginPercent.toFixed(2)}%
                </p>
              </div>
              <div className="pt-6 border-t border-white/10">
                <Tag size={16} className="mb-2 opacity-50" />
                <p className="text-sm font-medium opacity-80">โหมด: {isEditing ? 'แก้ไขสินค้าเดิม' : 'เพิ่มสินค้าใหม่'}</p>
              </div>
            </div>
            
            <div className="space-y-3 mt-8">
              <button 
                onClick={handleSave} disabled={loading}
                className={`w-full py-4 rounded-2xl font-black flex items-center justify-center gap-2 transition-all shadow-xl active:scale-95 ${isEditing ? 'bg-white text-amber-600 hover:bg-amber-50' : 'bg-blue-600 text-white hover:bg-blue-700 shadow-blue-900/20'}`}
              >
                {loading ? '...' : isEditing ? <><Edit3 size={18}/> UPDATE</> : <><Plus size={18}/> SAVE PRODUCT</>}
              </button>
              {isEditing && (
                <button onClick={resetForm} className="w-full py-2 text-white/60 text-xs font-bold hover:text-white transition-colors">
                  ยกเลิกและเพิ่มใหม่
                </button>
              )}
            </div>
          </div>
        </div>

        {/* --- Table Section --- */}
        <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden">
          <div className="p-6 border-b border-slate-50 flex justify-between items-center bg-slate-50/50">
            <div className="relative flex-1 max-w-md group">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-blue-500 transition-colors" size={18} />
              <input 
                placeholder="ค้นหารหัสหรือชื่อสินค้า..." 
                className="w-full pl-12 pr-4 py-3 bg-white border border-slate-200 focus:border-blue-500 rounded-2xl outline-none transition-all"
                value={search} onChange={e => setSearch(e.target.value)} 
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="text-[10px] font-black text-slate-400 uppercase tracking-widest bg-slate-50/30">
                  <th className="p-6">Barcode / ID</th>
                  <th className="p-6">Information</th>
                  <th className="p-6">Pricing</th>
                  <th className="p-6 text-center">Stock</th>
                  <th className="p-6 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {products.filter(p => p.name.includes(search) || p.id.includes(search)).map(p => (
                  <tr key={p.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="p-6 font-mono text-sm text-slate-400">{p.id}</td>
                    <td className="p-6">
                      <p className="font-black text-slate-800 tracking-tight">{p.name}</p>
                      <span className="text-[9px] font-black px-2 py-0.5 bg-slate-100 text-slate-500 rounded uppercase tracking-wider">{p.category || 'ทั่วไป'}</span>
                    </td>
                    <td className="p-6 text-sm">
                      <div className="flex flex-col">
                        <span className="text-slate-400 text-xs font-medium">Cost: ฿{p.cost_price}</span>
                        <span className="text-blue-600 font-black">Sale: ฿{p.retail_price}</span>
                      </div>
                    </td>
                    <td className="p-6 text-center">
                      <div className={`inline-block px-4 py-1.5 rounded-xl font-black text-xs ${p.stock <= 5 ? 'bg-red-50 text-red-600 border border-red-100' : 'bg-emerald-50 text-emerald-600 border border-emerald-100'}`}>
                        {p.stock} <span className="text-[10px] opacity-60">PCS</span>
                      </div>
                    </td>
                    <td className="p-6 text-right space-x-2">
                      <button onClick={() => handleEdit(p)} className="p-3 bg-blue-50 text-blue-600 rounded-2xl hover:bg-blue-600 hover:text-white transition-all">
                        <Edit3 size={18}/>
                      </button>
                      <button 
                        onClick={async () => { if(confirm(`ต้องการลบ ${p.name}?`)) { await supabase.from('products').delete().eq('id', p.id); fetchProducts(); } }} 
                        className="p-3 bg-red-50 text-red-500 rounded-2xl hover:bg-red-500 hover:text-white transition-all"
                      >
                        <Trash2 size={18}/>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}