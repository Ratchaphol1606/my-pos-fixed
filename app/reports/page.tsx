"use client"
import { useState, useEffect } from 'react'
import { supabase } from '@/src/lib/supabase'
import { 
  TrendingUp, ChevronLeft, ChevronRight, Trophy, 
  DollarSign, Calendar as CalendarIcon, AlertCircle, ShoppingBag
} from 'lucide-react'

import { Product, Settings } from '@/src/types'

export default function ReportsPage() {
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0])
  const [stats, setStats] = useState({
    weekSale: 0, weekProfit: 0,
    monthSale: 0, monthProfit: 0,
    yearSale: 0, yearProfit: 0
  })
  const [monthlyStats, setMonthlyStats] = useState<Record<string, number>>({})
  const [bestSellers, setBestSellers] = useState<any[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchFinancialDashboard()
  }, [currentMonth])

  const fetchFinancialDashboard = async () => {
    setLoading(true)
    setError(null)
    
    try {
      const now = new Date()
      const startOfYear = new Date(currentMonth.getFullYear(), 0, 1).toISOString()
      const startOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1).toISOString()
      const endOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0, 23, 59, 59).toISOString()
      const sevenDaysAgo = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000)).toISOString()

      // 1. ดึงข้อมูลจาก sales
      const { data: salesData, error: salesError } = await supabase
        .from('sales')
        .select(`
          id,
          total_amount,
          created_at,
          sale_items (
            product_id,
            quantity,
            price_at_sale
          )
        `)
        .gte('created_at', startOfYear)

      if (salesError) throw salesError

      // 2. ดึงข้อมูลสินค้า
      const { data: products } = await supabase.from('products').select('id, name, cost_price')
      const productMap = products?.reduce((acc: any, p) => { acc[p.id] = p; return acc }, {}) || {}

      if (salesData && salesData.length > 0) {
        
        const calculateStats = (dataList: any[]) => {
          let saleTotal = 0
          let profitTotal = 0
          dataList.forEach(sale => {
            saleTotal += Number(sale.total_amount) || 0
            sale.sale_items?.forEach((item: any) => {
              const pInfo = productMap[item.product_id]
              const sPrice = Number(item.price_at_sale) || 0
              const cPrice = Number(pInfo?.cost_price) || 0
              profitTotal += (sPrice - cPrice) * (Number(item.quantity) || 0)
            })
          })
          return { saleTotal, profitTotal }
        }

        // กรองช่วงเวลา
        const weekSales = salesData.filter(s => s.created_at >= sevenDaysAgo)
        const monthSales = salesData.filter(s => s.created_at >= startOfMonth && s.created_at <= endOfMonth)

        const w = calculateStats(weekSales)
        const m = calculateStats(monthSales)
        const y = calculateStats(salesData)

        setStats({
          weekSale: w.saleTotal, weekProfit: w.profitTotal,
          monthSale: m.saleTotal, monthProfit: m.profitTotal,
          yearSale: y.saleTotal, yearProfit: y.profitTotal
        })

        // ยอดขายรายวัน (สำหรับปฏิทิน)
        const daily = monthSales.reduce((acc: any, s: any) => {
          const date = s.created_at.split('T')[0]
          acc[date] = (acc[date] || 0) + (Number(s.total_amount) || 0)
          return acc
        }, {})
        setMonthlyStats(daily)

        // สินค้าขายดีที่สุด (อิงตามกำไร)
        const topProductMap = monthSales.reduce((acc: any, s: any) => {
          s.sale_items?.forEach((item: any) => {
            const pInfo = productMap[item.product_id]
            const name = pInfo?.name || 'Unknown Product'
            const profit = (Number(item.price_at_sale) - (Number(pInfo?.cost_price) || 0)) * Number(item.quantity)
            if (!acc[name]) acc[name] = { profit: 0, qty: 0 }
            acc[name].profit += profit
            acc[name].qty += Number(item.quantity)
          })
          return acc
        }, {})

        setBestSellers(
          Object.entries(topProductMap)
            .map(([name, d]: any) => ({ name, profit: d.profit, qty: d.qty }))
            .sort((a, b) => b.profit - a.profit).slice(0, 5)
        )
      } else {
        // Reset if no data
        setStats({ weekSale: 0, weekProfit: 0, monthSale: 0, monthProfit: 0, yearSale: 0, yearProfit: 0 })
        setBestSellers([])
      }
    } catch (err: any) {
      setError("Database Error: " + err.message)
    } finally {
      setLoading(false)
    }
  }

  const renderCalendar = () => {
    const year = currentMonth.getFullYear(); const month = currentMonth.getMonth()
    const firstDay = new Date(year, month, 1).getDay()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const cells = []
    for (let i = 0; i < firstDay; i++) cells.push(<div key={`empty-${i}`} className="h-10 bg-slate-50/50 border border-slate-50"></div>)
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      const isSelected = selectedDate === dateStr
      const hasData = (monthlyStats[dateStr] || 0) > 0
      cells.push(
        <div key={d} onClick={() => setSelectedDate(dateStr)} 
          className={`h-10 border border-slate-50 flex flex-col items-center justify-center cursor-pointer transition-all ${isSelected ? 'bg-blue-600 text-white shadow-inner' : 'bg-white hover:bg-blue-50 text-slate-400'}`}>
          <span className="text-[10px] font-bold">{d}</span>
          {hasData && !isSelected && <div className="w-1 h-1 bg-emerald-500 rounded-full mt-0.5"></div>}
        </div>
      )
    }
    return cells
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] p-4 md:p-8 font-sans">
      <div className="max-w-7xl mx-auto">
        
        {error && (
          <div className="mb-6 p-4 bg-red-50 border-l-4 border-red-500 text-red-700 rounded-r-2xl flex items-center gap-3 font-bold animate-bounce">
            <AlertCircle size={20}/> {error}
          </div>
        )}

        <div className="flex flex-col lg:flex-row gap-8">
          
          {/* Sidebar: Calendar & Selection */}
          <div className="w-full lg:w-[320px] shrink-0 space-y-6">
            <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden">
              <div className="p-5 flex justify-between items-center bg-white border-b border-slate-50">
                <h2 className="font-black text-slate-800 text-xs uppercase tracking-widest">
                  {currentMonth.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' })}
                </h2>
                <div className="flex gap-1">
                  <button onClick={() => setCurrentMonth(new Date(currentMonth.setMonth(currentMonth.getMonth() - 1)))} className="p-2 hover:bg-slate-50 rounded-xl transition-colors"><ChevronLeft size={16}/></button>
                  <button onClick={() => setCurrentMonth(new Date(currentMonth.setMonth(currentMonth.getMonth() + 1)))} className="p-2 hover:bg-slate-50 rounded-xl transition-colors"><ChevronRight size={16}/></button>
                </div>
              </div>
              <div className="grid grid-cols-7 text-center py-2 bg-slate-50 text-[9px] font-black text-slate-400 uppercase tracking-tighter">
                {['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'].map(day => <div key={day}>{day}</div>)}
              </div>
              <div className="grid grid-cols-7">{renderCalendar()}</div>
            </div>

            <div className="bg-cyan-700 rounded-[2.5rem] p-8 text-white shadow-2xl shadow-slate-200 relative overflow-hidden group">
               <div className="relative z-10">
                 <p className="text-white-500 text-[10px] font-black uppercase tracking-[0.2em] mb-1">ยอดขายวันที่เลือก</p>
                 <p className="text-4xl font-black italic">฿{(monthlyStats[selectedDate] || 0).toLocaleString()}</p>
                 <p className="mt-3 text-blue-400 text-xs font-bold flex items-center gap-2">
                   <CalendarIcon size={14}/> {new Date(selectedDate).toLocaleDateString('th-TH', { day: 'numeric', month: 'long' })}
                 </p>
               </div>
               <div className="absolute -right-4 -bottom-4 text-white/5 group-hover:rotate-12 transition-transform">
                 <ShoppingBag size={120} />
               </div>
            </div>
          </div>

          {/* Main Dashboard */}
          <div className="flex-1 space-y-8">
            <header className="flex justify-between items-end">
              <div>
                <h1 className="text-5xl font-black text-slate-900 tracking-tighter italic">FINANCIAL REPORT</h1>
                <p className="text-slate-500 font-medium">สรุปรายได้และผลกำไรสุทธิ</p>
              </div>
              {loading && <div className="text-blue-600 text-xs font-black animate-pulse italic">UPDATING...</div>}
            </header>

            {/* Profit Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[
                { label: 'Weekly', sale: stats.weekSale, profit: stats.weekProfit, color: 'blue' },
                { label: 'Monthly', sale: stats.monthSale, profit: stats.monthProfit, color: 'emerald' },
                { label: 'Annual', sale: stats.yearSale, profit: stats.yearProfit, color: 'indigo' }
              ].map((card, i) => (
                <div key={i} className="bg-white p-8 rounded-[3rem] shadow-sm border border-slate-100 hover:scale-[1.03] transition-all duration-300 group">
                  <div className="flex justify-between items-start mb-8">
                    <span className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest bg-${card.color}-50 text-${card.color}-600`}>{card.label}</span>
                    <div className={`p-3 rounded-2xl bg-${card.color}-50 text-${card.color}-600`}><DollarSign size={20}/></div>
                  </div>
                  <div className="space-y-6">
                    <div>
                      <p className="text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-1">Revenue</p>
                      <p className="text-2xl font-black text-slate-800">฿{card.sale.toLocaleString()}</p>
                    </div>
                    <div className="pt-6 border-t border-slate-50">
                      <p className={`text-${card.color}-600 text-[10px] font-black uppercase tracking-wider mb-1`}>Net Profit</p>
                      <p className={`text-4xl font-black text-${card.color}-600`}>฿{card.profit.toLocaleString()}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Best Sellers */}
            <div className="bg-white rounded-[3.5rem] p-10 border border-slate-100 shadow-sm relative overflow-hidden">
              <div className="flex items-center gap-4 mb-10">
                <div className="bg-amber-100 p-4 rounded-3xl text-amber-600 shadow-sm shadow-amber-100"><Trophy size={28}/></div>
                <div>
                  <h2 className="text-2xl font-black text-slate-800 italic uppercase tracking-tighter leading-none">Top Performers</h2>
                  <p className="text-slate-400 text-xs font-medium mt-1 uppercase tracking-widest">Monthly Profit Ranking</p>
                </div>
              </div>
              
              <div className="grid grid-cols-1 gap-4">
                {bestSellers.length > 0 ? bestSellers.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between p-6 rounded-[2.5rem] bg-slate-50 border border-slate-100 hover:bg-slate-900 group transition-all duration-300">
                    <div className="flex items-center gap-6">
                      <span className="text-5xl font-black text-slate-200 group-hover:text-white/10 italic transition-colors">0{idx+1}</span>
                      <div>
                        <p className="text-xl font-black text-slate-700 group-hover:text-white transition-colors">{item.name}</p>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest group-hover:text-slate-500 transition-colors">Total Sales: {item.qty}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-[9px] font-black text-emerald-500 uppercase tracking-[0.2em] mb-1 group-hover:text-emerald-400 transition-colors">Profit</p>
                      <p className="text-3xl font-black text-slate-800 group-hover:text-white transition-colors">฿{item.profit.toLocaleString()}</p>
                    </div>
                  </div>
                )) : (
                  <div className="text-center py-20 text-slate-300 italic font-medium">ยังไม่มีข้อมูลการขายในรอบเดือนนี้</div>
                )}
              </div>
              <div className="absolute -bottom-12 -right-12 w-48 h-48 bg-blue-500 rounded-full blur-[100px] opacity-10"></div>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}