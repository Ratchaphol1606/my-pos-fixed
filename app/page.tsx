"use client"
import { useState, useEffect } from 'react'
import { supabase } from '@/src/lib/supabase'
import { Search, ShoppingCart, Printer, X, Banknote, QrCode,Tag } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react' // อย่าลืม npm install qrcode.react

interface Product {
  id: string;
  name: string;
  category: string; // เพิ่มหมวดหมู่
  cost_price: number;
  retail_price: number;
  stock: number;
  date_add: string;
}

interface CartItem extends Product {
  qty: number;
}

export default function POSPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<string[]>(['ทั้งหมด'])
  const [selectedCat, setSelectedCat] = useState('ทั้งหมด')
  const [cart, setCart] = useState<CartItem[]>([])
  const [search, setSearch] = useState('')
  const [showPayModal, setShowPayModal] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'transfer'>('cash')
  const [receivedAmount, setReceivedAmount] = useState<number>(0)
  const [receiptDetail, setReceiptDetail] = useState<any>(null)
  const [discount, setDiscount] = useState<number>(0)
  const [shouldPrint, setShouldPrint] = useState(false)

  useEffect(() => {
    const fetchProducts = async () => {
      const { data } = await supabase.from('products').select('*')
      if (data) {
        setProducts(data)
        const cats = ['ทั้งหมด', ...Array.from(new Set(data.map((p: any) => p.category || 'ทั่วไป')))]
        setCategories(cats)
      }
    }
    fetchProducts()
  }, [])

  // Print via Raspberry Pi print server (falls back to window.print if not configured)
  const PRINT_SERVER = process.env.NEXT_PUBLIC_PRINT_SERVER_URL

  useEffect(() => {
    if (!shouldPrint || !receiptDetail) return
    const timer = setTimeout(async () => {
      if (PRINT_SERVER) {
        try {
          const res = await fetch(`${PRINT_SERVER}/print`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(receiptDetail)
          })
          const result = await res.json()
          if (!result.ok) throw new Error(result.error)
        } catch (err: any) {
          console.error('Pi print failed:', err)
          // fallback to browser print if Pi is unreachable
          window.print()
        }
      } else {
        // No Pi configured — use browser print
        window.print()
      }
      setShouldPrint(false)
    }, 300)
    return () => clearTimeout(timer)
  }, [shouldPrint])

  const addToCart = (product: Product) => {
    const existing = cart.find(item => item.id === product.id)
    if (existing) {
      setCart(cart.map(item => item.id === product.id ? {...item, qty: item.qty + 1} : item))
    } else {
      setCart([...cart, {...product, qty: 1}])
    }
  }

  const generateReceiptNo = async () => {
    const now = new Date();
    const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    const { count } = await supabase.from('sales').select('*', { count: 'exact', head: true })
      .gte('created_at', `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}T00:00:00`);
    return `INV${dateStr}${String((count || 0) + 1).padStart(2, '0')}`;
  };

  const subtotal = cart.reduce((sum, item) => sum + (item.retail_price * item.qty), 0)
  const total = Math.max(0, subtotal - discount) // ยอดรวมสุทธิ (ไม่ให้ติดลบ)
  const change = paymentMethod === 'cash' ? receivedAmount - total : 0

  const handleFinish = async () => {
    try {
      const currentReceiptNo = await generateReceiptNo();
      const snapshot = {
        items: cart.map(item => ({
          name: item.name,
          price: item.retail_price,
          qty: item.qty,
          subtotal: item.retail_price * item.qty
        })),
        subtotal,
        discount,
        total,
        received: paymentMethod === 'cash' ? receivedAmount : total,
        change,
        paymentMethod: paymentMethod === 'cash' ? 'เงินสด' : 'โอนเงิน/QR', // เก็บลง snapshot
        date: new Date().toLocaleString('th-TH'),
        receiptNo: currentReceiptNo
      };

      const { data: saleData, error: saleError } = await supabase
        .from('sales')
        .insert([{
          receipt_no: currentReceiptNo,
          total_amount: total,
          received_amount: snapshot.received,
          change_amount: snapshot.change,
          payment_method: paymentMethod, // อย่าลืมเพิ่มคอลัมน์นี้ใน DB
          receipt_snapshot: snapshot,
          discount_amount: discount
        }])
        .select().single();

      if (saleError) throw saleError;

      // บันทึกรายละเอียดสินค้าและตัดสต็อก (โค้ดส่วนนี้เหมือนเดิมของคุณ)
      const saleItems = cart.map(item => ({
        sale_id: saleData.id,
        product_id: item.id,
        quantity: item.qty,
        price_at_sale: item.retail_price
      }))
      await supabase.from('sale_items').insert(saleItems)
      for (const item of cart) {
        await supabase.rpc('decrement_stock', { row_id: item.id, amount: item.qty })
      }

      setReceiptDetail(snapshot);
      setCart([]);
      setDiscount(0);
      setShowPayModal(false);
      setReceivedAmount(0);
      setShouldPrint(true);

    } catch (error: any) {
      alert("เกิดข้อผิดพลาด: " + error.message)
    }
  }

  return (
    <div className="flex flex-col md:flex-row h-auto md:h-screen bg-gray-100 p-2 md:p-4 gap-4 md:overflow-hidden print:bg-white print:p-0">
      
      {/* ฝั่งซ้าย: ค้นหาและเลือกสินค้า */}
      <div className="flex-1 flex flex-col gap-2 print:hidden min-w-0 overflow-hidden">
        <div className="relative">
          <Search className="absolute left-3 top-3 text-gray-400" size={18} />
          <input 
            className="w-full p-3 pl-10 rounded-xl shadow-sm text-base outline-none focus:ring-2 ring-blue-500" 
            placeholder="ค้นหาหรือยิงบาร์โค้ด..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* แท็บหมวดหมู่ */}
        <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
          {categories.map(cat => (
            <button 
              key={cat}
              onClick={() => setSelectedCat(cat)}
              className={`px-3 py-1.5 rounded-full whitespace-nowrap font-bold text-xs transition-all flex-shrink-0 ${selectedCat === cat ? 'bg-blue-600 text-white shadow-md' : 'bg-white text-gray-500'}`}
            >
              {cat}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 overflow-y-auto pb-4">
          {products
            .filter(p => (selectedCat === 'ทั้งหมด' || p.category === selectedCat) && p.name.includes(search))
            .map(p => (
              <button key={p.id} onClick={() => addToCart(p)} className="bg-white p-2.5 rounded-xl shadow-sm hover:bg-blue-50 active:scale-95 transition-all text-left flex flex-col justify-between h-24 border-2 border-transparent hover:border-blue-200">
                <div>
                  <span className="text-[9px] bg-gray-100 px-1.5 py-0.5 rounded text-gray-400 uppercase font-bold leading-none">{p.category || 'ทั่วไป'}</span>
                  <p className="font-bold text-gray-700 mt-1 text-xs line-clamp-2 leading-tight">{p.name}</p>
                </div>
                <p className="text-blue-600 font-mono text-sm font-bold">฿{p.retail_price}</p>
              </button>
            ))}
        </div>
      </div>

      {/* ฝั่งขวา: ตะกร้าสินค้า */}
      <div className="w-full md:w-72 md:min-w-[288px] bg-white rounded-2xl shadow-xl flex flex-col overflow-hidden print:hidden border border-gray-100">
        <div className="p-6 bg-slate-800 text-white flex justify-between items-center">
          <h2 className="text-xl font-bold flex items-center gap-2"><ShoppingCart /> ตะกร้า</h2>
          <button onClick={() => setCart([])} className="text-gray-400 hover:text-white">ล้าง</button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {cart.map(item => (
            <div key={item.id} className="flex justify-between items-center border-b border-gray-50 pb-2">
              <div className="flex-1 pr-2">
                <p className="font-medium text-sm text-gray-800">{item.name}</p>
                <p className="text-xs text-gray-400">฿{item.retail_price} x {item.qty}</p>
              </div>
              <p className="font-bold text-gray-900">฿{item.retail_price * item.qty}</p>
            </div>
          ))}
        </div>
        <div className="p-6 border-t bg-gray-50">
          <div className="flex justify-between text-gray-500 font-bold">
            <span>รวมเป็นเงิน</span>
            <span>฿{subtotal.toLocaleString()}</span>
          </div>

          <div className="flex items-center justify-between gap-4 py-2 border-y border-gray-200 border-dashed">
            <div className="flex items-center gap-2 text-red-500 font-bold">
              <Tag size={18}/>
              <span>ส่วนลด</span>
            </div>
            <div className="relative w-32">
              <span className="absolute left-2 top-1.5 text-gray-400 text-xs font-bold">฿</span>
              <input 
                type="number"
                value={discount || ''}
                placeholder="0"
                onChange={(e) => setDiscount(Number(e.target.value))}
                className="w-full pl-6 pr-2 py-1 bg-white border border-red-200 rounded-lg text-right font-bold text-red-600 outline-none focus:ring-2 ring-red-500"
              />
            </div>
          </div>

          <div className="flex justify-between text-3xl font-black italic pt-2">
            <span>สุทธิ</span>
            <span className="text-blue-600">฿{total.toLocaleString()}</span>
          </div>
          <button 
            disabled={cart.length === 0}
            onClick={() => { setPaymentMethod('cash'); setShowPayModal(true); }}
            className="w-full bg-green-600 text-white py-6 rounded-2xl text-2xl font-bold shadow-lg disabled:bg-gray-300 active:scale-95 transition-all"
          >
            ชำระเงิน
          </button>
        </div>
      </div>

      {/* Popup ชำระเงิน (ปรับปรุงให้เลือกช่องทางได้) */}
      {showPayModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-lg rounded-[2.5rem] p-8 shadow-2xl">
            <h2 className="text-4xl font-black mb-6 text-center italic tracking-tighter">฿{total.toLocaleString()}</h2>
            
            {/* เลือกช่องทางชำระเงิน */}
            <div className="grid grid-cols-2 gap-4 mb-6">
              <button 
                onClick={() => setPaymentMethod('cash')}
                className={`p-4 rounded-2xl border-2 flex flex-col items-center gap-2 transition-all ${paymentMethod === 'cash' ? 'border-blue-600 bg-blue-50 text-blue-600' : 'border-gray-100 text-gray-400'}`}
              >
                <Banknote size={32} />
                <span className="font-bold">เงินสด</span>
              </button>
              <button 
                onClick={() => setPaymentMethod('transfer')}
                className={`p-4 rounded-2xl border-2 flex flex-col items-center gap-2 transition-all ${paymentMethod === 'transfer' ? 'border-blue-600 bg-blue-50 text-blue-600' : 'border-gray-100 text-gray-400'}`}
              >
                <QrCode size={32} />
                <span className="font-bold">โอนเงิน/QR</span>
              </button>
            </div>

            {paymentMethod === 'cash' ? (
              <div className="animate-in slide-in-from-bottom-2 duration-300">
                <p className="text-gray-500 mb-2 font-bold text-center">เงินที่รับมา:</p>
                <input 
                  autoFocus
                  type="number" 
                  className="w-full p-6 text-5xl text-center border-b-4 border-blue-500 outline-none mb-6 font-mono bg-gray-50 rounded-t-2xl"
                  onChange={(e) => setReceivedAmount(Number(e.target.value))}
                />
                <div className="flex justify-between text-3xl mb-8 font-bold">
                  <span>เงินทอน:</span>
                  <span className={change < 0 ? 'text-red-500' : 'text-green-600'}>
                    ฿{change >= 0 ? change.toLocaleString() : 0}
                  </span>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center p-6 bg-gray-50 rounded-3xl mb-6 animate-in zoom-in duration-300">
                <QRCodeSVG value={`https://promptpay.io/0659834959/${total}.png`} size={180} />
                <p className="mt-4 font-bold text-blue-600">สแกนเพื่อชำระเงิน</p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <button onClick={() => setShowPayModal(false)} className="py-4 bg-gray-100 rounded-2xl font-bold text-xl text-gray-500">ยกเลิก</button>
              <button 
                onClick={handleFinish}
                disabled={paymentMethod === 'cash' && (change < 0 || receivedAmount === 0)}
                className="py-4 bg-blue-600 text-white rounded-2xl font-bold text-xl shadow-lg shadow-blue-200 disabled:bg-gray-300"
              >
                ยืนยัน / พิมพ์
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ส่วนใบเสร็จ */}
      {receiptDetail && (
        <div className="pos-receipt hidden print:block fixed top-0 left-0 bg-white" style={{width:'58mm'}}>
          <div className="text-black text-[11px] font-mono w-full px-[3mm] pt-[3mm] pb-[5mm]">
            <div className="text-center mb-4">
              <h2 className="text-sm font-bold uppercase">บุญชอบเครื่องครัว สามแยก</h2>
              <p className="text-[9px]">351/3 ม.5 ต.ท่าบุญมี อ.เกาะจันทร์ จ.ชลบุรี 20240</p>
              <p className="text-[9px]">โทร : 065-983-4959</p>
            </div>
            
            <div className="border-b border-dashed mb-2 pb-2">
              <p>เลขที่: {receiptDetail.receiptNo}</p>
              <p>วันที่: {receiptDetail.date}</p>
            </div>

            <div className="mb-2">
            {receiptDetail.items?.map((item: any, index: number) => (
             <div key={index} className="mb-2 text-[11px] uppercase border-b border-gray-50 pb-1">
                <div className="font-bold text-gray-800 mb-0.5">
                  {item.name}
                </div>
                <div className="flex justify-between items-end text-gray-600">
                  <div className="pl-2 italic">
                    {/* แสดงราคาปลีก x จำนวน */}
                    {Number(item.price).toLocaleString()} x {item.qty}
                  </div>
                  <div className="font-bold text-black">
                    {/* ราคารวมของสินค้านั้น */}
                    {(item.price * item.qty).toLocaleString()}
                  </div>
                </div>
              </div>
            ))}
          </div>

            <div className="border-t border-dashed pt-2 space-y-1">
              <div className="flex justify-between">
                <span>ยอดรวม:</span>
                <span>{receiptDetail.subtotal?.toLocaleString()}</span>
              </div>
              
              {/* ✅ แสดงส่วนลดในใบเสร็จ */}
              {receiptDetail.discount > 0 && (
                <div className="flex justify-between text-black font-bold">
                  <span>ส่วนลด:</span>
                  <span>-{receiptDetail.discount?.toLocaleString()}</span>
                </div>
              )}

              <div className="flex justify-between font-bold text-sm border-t border-black pt-1">
                <span>สุทธิ:</span>
                <span>฿{receiptDetail.total?.toLocaleString()}</span>
              </div>

              <div className="flex justify-between pt-1">
                <span>รับเงิน ({receiptDetail.paymentMethod}):</span>
                <span>{receiptDetail.received?.toLocaleString()}</span>
              </div>
              
              {receiptDetail.paymentMethod === 'เงินสด' && (
                <div className="flex justify-between font-bold">
                  <span>เงินทอน:</span>
                  <span>{receiptDetail.change?.toLocaleString()}</span>
                </div>
              )}
            </div>

            <div className="text-center mt-6 text-[9px] border-t border-dashed pt-4">
              <p>ชำระด้วย: {receiptDetail.paymentMethod}</p>
              <p className="mt-2">*** ขอบคุณที่ใช้บริการ ***</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}