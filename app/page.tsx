"use client"
import { useState, useEffect } from 'react'
import { supabase } from '@/src/lib/supabase'
import { Search, ShoppingCart, Printer, X, Banknote, QrCode, Tag } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import Receipt from './component/Receipt'
import { Product, CartItem, ReceiptDetail, Settings } from '@/src/types'

export default function POSPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<string[]>(['ทั้งหมด'])
  const [selectedCat, setSelectedCat] = useState('ทั้งหมด')
  const [cart, setCart] = useState<CartItem[]>([])
  const [search, setSearch] = useState('')
  const [showPayModal, setShowPayModal] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'transfer' | 'wallet'>('cash')
  const [receivedAmount, setReceivedAmount] = useState<number>(0)
  const [receiptDetail, setReceiptDetail] = useState<ReceiptDetail | null>(null)
  const [discount, setDiscount] = useState<number>(0)
  const [shouldPrint, setShouldPrint] = useState(false)
  const [settings, setSettings] = useState<Settings | null>(null)
  const [dailySubsidyUsed, setDailySubsidyUsed] = useState<number>(0)

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const pageSize = 10
  // เป๋าตัง Co-payment Constants
  const GOVERNMENT_SHARE_RATE = 0.60
  const USER_SHARE_RATE = 0.40
  const MAX_GOVERNMENT_DAILY_CAP = 200.00

  function calculatePaoTang(totalPrice: number, dailySubsidyAlreadyUsed: number = 0) {
    const rawGovShare = totalPrice * GOVERNMENT_SHARE_RATE
    const availableCap = MAX_GOVERNMENT_DAILY_CAP - dailySubsidyAlreadyUsed
    const actualGovShare = Math.min(rawGovShare, availableCap)
    const actualUserShare = totalPrice - actualGovShare
    return {
      govShare: Math.max(0, actualGovShare),
      userShare: Math.max(0, actualUserShare),
      isCapped: rawGovShare > availableCap
    }
  }


  useEffect(() => {
    const fetchInitialData = async () => {
      // Fetch Categories from products
      const { data: catData } = await supabase.from('products').select('category')
      if (catData) {
        const cats = ['ทั้งหมด', ...Array.from(new Set(catData.map((p: any) => p.category || 'ทั่วไป')))]
        setCategories(cats)
      }

      // Fetch Settings
      const { data: settsData } = await supabase.from('settings').select('*').eq('id', 1).single()
      if (settsData) setSettings(settsData)
    }
    fetchInitialData()
  }, [])

  useEffect(() => {
    fetchProducts()
  }, [currentPage, selectedCat, search])

  const fetchProducts = async () => {
    let query = supabase.from('products').select('*', { count: 'exact' })
    
    if (selectedCat !== 'ทั้งหมด') {
      query = query.eq('category', selectedCat)
    }
    
    if (search) {
      query = query.ilike('name', `%${search}%`)
    }
    
    const from = (currentPage - 1) * pageSize
    const to = from + pageSize - 1
    
    const { data, count } = await query
      .order('name', { ascending: true })
      .range(from, to)
      
    if (data) setProducts(data)
    if (count !== null) setTotalCount(count)
  }

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value)
    setCurrentPage(1)
  }

  const handleCategoryChange = (cat: string) => {
    setSelectedCat(cat)
    setCurrentPage(1)
  }

  const totalPages = Math.ceil(totalCount / pageSize)

  // Print via Raspberry Pi print server
  const PRINT_SERVER = process.env.NEXT_PUBLIC_PRINT_SERVER_URL

  useEffect(() => {
    if (!shouldPrint || !receiptDetail) return
    const timer = setTimeout(async () => {
      if (PRINT_SERVER) {
        try {
          const res = await fetch(`${PRINT_SERVER}/print`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ...receiptDetail,
              shopName: settings?.shop_name || '',
              shopAddress: settings?.shop_address || '',
              shopPhone: settings?.shop_phone || ''
            })
          })
          const result = await res.json()
          if (!result.ok) throw new Error(result.error)
        } catch (err: any) {
          console.error('Pi print failed:', err)
          window.print()
        }
      } else {
        window.print()
      }
      setShouldPrint(false)
    }, 300)
    return () => clearTimeout(timer)
  }, [shouldPrint, receiptDetail, PRINT_SERVER])

  const addToCart = (product: Product) => {
    const existing = cart.find(item => item.id === product.id)
    if (existing) {
      setCart(cart.map(item => item.id === product.id ? { ...item, qty: item.qty + 1 } : item))
    } else {
      setCart([...cart, { ...product, qty: 1 }])
    }
  }

  const updateCartQty = (id: string, delta: number) => {
    setCart(cart.map(item => {
      if (item.id === id) {
        const newQty = item.qty + delta
        return newQty > 0 ? { ...item, qty: newQty } : item
      }
      return item
    }))
  }

  const removeFromCart = (id: string) => {
    setCart(cart.filter(item => item.id !== id))
  }

  const generateReceiptNo = async () => {
    const now = new Date();
    const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    const { count } = await supabase.from('sales').select('*', { count: 'exact', head: true })
      .gte('created_at', `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}T00:00:00`);
    return `INV${dateStr}${String((count || 0) + 1).padStart(2, '0')}`;
  };

  const subtotal = cart.reduce((sum, item) => sum + (item.retail_price * item.qty), 0)
  const total = Math.max(0, subtotal - discount)
  const change = paymentMethod === 'cash' ? receivedAmount - total : 0

  const handleFinish = async () => {
    try {
      const currentReceiptNo = await generateReceiptNo();
      const snapshot: ReceiptDetail = {
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
        paymentMethod: paymentMethod === 'cash' ? 'เงินสด' 
       : paymentMethod === 'transfer' ? 'โอนเงิน/QR' 
        : 'เป๋าตัง'  ,
        date: new Date().toLocaleString('th-TH'),
        receiptNo: currentReceiptNo
      };

      // Single atomic call: inserts the sale, the line items, and
      // decrements stock all in one DB transaction. If stock runs out
      // mid-checkout (e.g. another cashier just sold the last unit),
      // the whole thing rolls back and nothing is half-written.
      const { error: saleError } = await supabase.rpc('process_sale', {
        p_receipt_no: currentReceiptNo,
        p_total_amount: total,
        p_received_amount: snapshot.received,
        p_change_amount: snapshot.change,
        p_discount_amount: discount,
        p_payment_method: paymentMethod,
        p_receipt_snapshot: snapshot,
        p_items: cart.map(item => ({
          product_id: item.id,
          quantity: item.qty,
          price_at_sale: item.retail_price
        }))
      })

      if (saleError) throw saleError;

      setReceiptDetail(snapshot);
      setCart([]);
      setDiscount(0);
      setShowPayModal(false);
      setReceivedAmount(0);
      setShouldPrint(true);
      fetchProducts(); // refresh stock numbers shown on the product grid

    } catch (error: any) {
      alert("เกิดข้อผิดพลาด: " + error.message)
    }
  }
  

  return (
    <div className="flex flex-col md:flex-row h-auto md:h-screen bg-gray-100 p-2 md:p-4 gap-4 md:overflow-hidden print:bg-white print:p-0">
      
      {/* ฝั่งซ้าย: ค้นหาและเลือกสินค้า */}
      <div className="flex-1 flex flex-col gap-2 print:hidden min-w-0 overflow-hidden">
        <div className="relative">
          <Search className="absolute left-3 top-3 text-black-400" size={18} />
          <input 
            className="w-full p-3 pl-10 rounded-xl shadow-sm text-base text-black outline-none focus:ring-2 ring-blue-500" 
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
              onClick={() => handleCategoryChange(cat)}
              className={`px-3 py-1.5 rounded-full whitespace-nowrap font-bold text-xs transition-all flex-shrink-0 ${selectedCat === cat ? 'bg-blue-600 text-white shadow-md' : 'bg-white text-gray-500'}`}
            >
              {cat}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto pb-4">
          <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
            {products.map(p => (
              <button key={p.id} onClick={() => addToCart(p)} className="bg-white p-2.5 rounded-xl shadow-sm hover:bg-blue-50 active:scale-95 transition-all text-left flex flex-col justify-between h-24 border-2 border-transparent hover:border-blue-200">
                <div>
                  <div className="flex justify-between items-start">
                    <span className="text-[9px] bg-gray-100 px-1.5 py-0.5 rounded text-gray-400 uppercase font-bold leading-none">{p.category || 'ทั่วไป'}</span>
                    {p.stock <= (settings?.low_stock_threshold || 5) && <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>}
                  </div>
                  <p className="font-bold text-gray-700 mt-1 text-xs line-clamp-2 leading-tight">{p.name}</p>
                </div>
                <p className="text-blue-600 font-mono text-sm font-bold">฿{p.retail_price}</p>
              </button>
            ))}
          </div>
          
          {/* Pagination Controls */}
          <div className="mt-4 flex justify-between items-center bg-white p-3 rounded-2xl shadow-sm">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              หน้า {currentPage} / {totalPages || 1}
            </div>
            <div className="flex gap-2">
              <button 
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(p => p - 1)}
                className="px-3 py-1 bg-slate-100 rounded-lg text-xs font-bold disabled:opacity-30 hover:bg-blue-100 transition-colors"
              >
                ก่อนหน้า
              </button>
              <button 
                disabled={currentPage === totalPages || totalPages === 0}
                onClick={() => setCurrentPage(p => p + 1)}
                className="px-3 py-1 bg-blue-600 text-white rounded-lg text-xs font-bold disabled:opacity-30 hover:bg-blue-700 transition-colors"
              >
                ถัดไป
              </button>
            </div>
          </div>
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
            <div key={item.id} className="flex justify-between items-center border-b border-gray-50 pb-3 group relative">
              <div className="flex-1 pr-2">
                <p className="font-medium text-sm text-gray-800 line-clamp-1">{item.name}</p>
                <div className="flex items-center gap-3 mt-1">
                  <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden">
                    <button onClick={() => updateCartQty(item.id, -1)} className="px-2 py-0.5 bg-gray-50 hover:bg-gray-100 text-xs font-bold border-r">-</button>
                    <span className="px-3 py-0.5 text-xs font-mono font-bold bg-white">{item.qty}</span>
                    <button onClick={() => updateCartQty(item.id, 1)} className="px-2 py-0.5 bg-gray-50 hover:bg-gray-100 text-xs font-bold border-l">+</button>
                  </div>
                  <span className="text-[10px] text-gray-400 font-mono">฿{item.retail_price.toLocaleString()}</span>
                </div>
              </div>
              <div className="flex flex-col items-end gap-1">
                <p className="font-bold text-gray-900 text-sm">฿{(item.retail_price * item.qty).toLocaleString()}</p>
                <button 
                  onClick={() => removeFromCart(item.id)}
                  className="p-1 text-red-300 hover:text-red-500 transition-colors"
                  title="ลบรายการนี้"
                >
                  <X size={14} />
                </button>
              </div>
            </div>
          ))}
          {cart.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-gray-300 py-20">
              <ShoppingCart size={48} className="opacity-20 mb-2" />
              <p className="text-sm font-bold uppercase tracking-widest opacity-50">ว่างเปล่า</p>
            </div>
          )}
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

          <div className="flex justify-between text-3xl font-black italic pt-2 text-black-100">
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

      {/* Popup ชำระเงิน */}
      {showPayModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-lg rounded-[2.5rem] p-8 shadow-2xl">
            <h2 className="text-4xl font-black mb-6 text-center italic tracking-tighter">฿{total.toLocaleString()}</h2>
            
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
              <button 
                onClick={() => setPaymentMethod('wallet')}
                className={`p-4 rounded-2xl border-2 flex flex-col items-center gap-2 transition-all ${paymentMethod === 'wallet' ? 'border-blue-600 bg-blue-50 text-blue-600' : 'border-gray-100 text-gray-400'}`}
              >
                <Banknote size={32} />
                <span className="font-bold">เป๋าตัง</span>
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
            ) : paymentMethod === 'transfer' ? (
              <div className="flex flex-col items-center p-6 bg-gray-50 rounded-3xl mb-6 animate-in zoom-in duration-300">
                {settings?.qr_code_url ? (
                  <div className="relative w-48 h-48">
                    <img src={settings.qr_code_url} alt="Shop QR" className="w-full h-full object-contain" />
                    <div className="absolute inset-0 border-4 border-blue-500/20 rounded-xl"></div>
                  </div>
                ) : (
                  <QRCodeSVG value={`https://promptpay.io/${settings?.promptpay_id || '0000000000'}/${total}.png`} size={180} />
                )}
                <p className="mt-4 font-bold text-blue-600 uppercase tracking-widest text-sm">สแกนเพื่อชำระเงิน</p>
              </div>
            ) : paymentMethod === 'wallet' ? (
              (() => {
                const { govShare, userShare } = calculatePaoTang(total, dailySubsidyUsed)
                return (
                  <div className="animate-in slide-in-from-bottom-2 duration-300 mb-6">
                    
                    <div className="bg-gray-50 rounded-2xl p-4 space-y-3">
                      <div className="flex justify-between text-lg font-bold text-gray-500">
                        <span>ยอดรวมทั้งหมด</span>
                        <span>฿{total.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between text-lg font-bold text-green-600 border-t pt-3">
                        <span>รัฐบาลช่วยจ่าย (60%)</span>
                        <span>-฿{govShare.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <label className="text-sm text-gray-400 font-bold">ใช้วงเงินไปแล้ววันนี้</label>
                        <div className="relative w-32">
                          <span className="absolute left-2 top-1.5 text-gray-400 text-xs font-bold">฿</span>
                          <input
                            type="number"
                            value={dailySubsidyUsed || ''}
                            placeholder="0"
                            onChange={(e) => setDailySubsidyUsed(Number(e.target.value))}
                            className="w-full pl-6 pr-2 py-1 bg-white border border-gray-200 rounded-lg text-right font-bold text-gray-600 outline-none focus:ring-2 ring-blue-400 text-sm"
                          />
                        </div>
                      </div>
                    </div>
                    <div className="flex justify-between text-3xl mt-4 font-black text-blue-600">
                      <span>ลูกค้าจ่าย</span>
                      <span>฿{userShare.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                  </div>
                )
              })()
            ) : null }

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
        <div className="hidden print:block fixed top-0 left-0 bg-white">
          <Receipt detail={receiptDetail} settings={settings} />
        </div>
      )}
    </div>
  )
}