"use client"
import { useState, useEffect } from 'react'
import { supabase } from '@/src/lib/supabase'
import { 
  TrendingUp, ChevronLeft, ChevronRight, Trophy, 
  DollarSign, Calendar as CalendarIcon, AlertCircle, ShoppingBag,
  Clock, CalendarDays, Wallet, PackageX, ArrowUp, ArrowDown, Minus
} from 'lucide-react'
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  BarChart, Bar, PieChart, Pie, Cell, Legend
} from 'recharts'

import { Product, Settings } from '@/src/types'

const DOW_LABELS_TH = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส']
const PAYMENT_COLORS: Record<string, string> = {
  cash: '#3b82f6', promptpay: '#10b981', transfer: '#f59e0b', เป๋าตัง: '#8b5cf6'
}
const paymentLabelTH = (method: string) => {
  if (method === 'cash') return 'เงินสด'
  if (method === 'transfer') return 'โอนเงิน'
  if (method === 'promptpay') return 'พร้อมเพย์'
  return method || 'อื่นๆ'
}

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

  // --- New: trend, comparisons, peak times, payment mix, slow movers ---
  const [trendRange, setTrendRange] = useState<30 | 90>(30)
  const [trendData, setTrendData] = useState<{ date: string; revenue: number; profit: number }[]>([])
  const [dowData, setDowData] = useState<{ day: string; revenue: number; count: number }[]>([])
  const [hourData, setHourData] = useState<{ hour: string; revenue: number; count: number }[]>([])
  const [paymentMix, setPaymentMix] = useState<{ method: string; revenue: number; count: number }[]>([])
  const [slowMovers, setSlowMovers] = useState<{ name: string; stock: number }[]>([])
  const [comparisons, setComparisons] = useState({ weekChange: 0, monthChange: 0, yearChange: 0 })
  const [margins, setMargins] = useState({ week: 0, month: 0, year: 0 })
  const [bestWorstDay, setBestWorstDay] = useState<{ bestDate: string | null; bestAmt: number; worstDate: string | null; worstAmt: number }>(
    { bestDate: null, bestAmt: 0, worstDate: null, worstAmt: 0 }
  )
  const [allSalesRaw, setAllSalesRaw] = useState<any[]>([])
  const [productCostMap, setProductCostMap] = useState<Record<string, number>>({})

  useEffect(() => {
    fetchFinancialDashboard()
  }, [currentMonth])

  // Trend chart recomputes when the range toggle changes, using data already fetched
  useEffect(() => {
    computeTrend(allSalesRaw, trendRange, productCostMap)
  }, [trendRange, allSalesRaw, productCostMap])

  const fetchFinancialDashboard = async () => {
    setLoading(true)
    setError(null)
    
    try {
      const now = new Date()
      const startOfCurrentYear = new Date(currentMonth.getFullYear(), 0, 1)
      // Fetch back to Jan 1 of last year too, so we can do YoY / prior-month-in-January comparisons
      const startOfPrevYear = new Date(currentMonth.getFullYear() - 1, 0, 1).toISOString()
      const startOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1).toISOString()
      const endOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0, 23, 59, 59).toISOString()
      const sevenDaysAgo = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000)).toISOString()
      const fourteenDaysAgo = new Date(now.getTime() - (14 * 24 * 60 * 60 * 1000)).toISOString()

      // 1. ดึงข้อมูลจาก sales (now spans prev year -> current, for comparisons + trend)
      const { data: salesData, error: salesError } = await supabase
        .from('sales')
        .select(`
          id,
          total_amount,
          created_at,
          payment_method,
          sale_items (
            product_id,
            quantity,
            price_at_sale
          )
        `)
        .gte('created_at', startOfPrevYear)

      if (salesError) throw salesError
      setAllSalesRaw(salesData || [])

      // 2. ดึงข้อมูลสินค้า (include is_active + stock for slow-mover detection)
      const { data: products } = await supabase.from('products').select('id, name, cost_price, is_active, stock')
      const productMap = products?.reduce((acc: any, p) => { acc[p.id] = p; return acc }, {}) || {}
      setProductCostMap(products?.reduce((acc: any, p: any) => { acc[p.id] = Number(p.cost_price) || 0; return acc }, {}) || {})

      const thisYearSales = (salesData || []).filter(s => s.created_at >= startOfCurrentYear.toISOString())

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
        const weekSales = thisYearSales.filter(s => s.created_at >= sevenDaysAgo)
        const prevWeekSales = (salesData || []).filter(s => s.created_at >= fourteenDaysAgo && s.created_at < sevenDaysAgo)
        const monthSales = thisYearSales.filter(s => s.created_at >= startOfMonth && s.created_at <= endOfMonth)
        const prevMonthDate = new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1)
        const prevMonthStart = new Date(prevMonthDate.getFullYear(), prevMonthDate.getMonth(), 1).toISOString()
        const prevMonthEnd = new Date(prevMonthDate.getFullYear(), prevMonthDate.getMonth() + 1, 0, 23, 59, 59).toISOString()
        const prevMonthSales = (salesData || []).filter(s => s.created_at >= prevMonthStart && s.created_at <= prevMonthEnd)

        // Same elapsed-days-into-year range, but last year, for apples-to-apples YoY on YTD figure
        const daysIntoYear = Math.floor((now.getTime() - startOfCurrentYear.getTime()) / 86400000)
        const cutoffLastYear = new Date(startOfPrevYear)
        cutoffLastYear.setDate(cutoffLastYear.getDate() + daysIntoYear)
        const prevYearComparableSales = (salesData || []).filter(
          s => s.created_at >= startOfPrevYear && s.created_at <= cutoffLastYear.toISOString()
        )

        const w = calculateStats(weekSales)
        const pw = calculateStats(prevWeekSales)
        const m = calculateStats(monthSales)
        const pm = calculateStats(prevMonthSales)
        const y = calculateStats(thisYearSales)
        const py = calculateStats(prevYearComparableSales)

        const pctChange = (curr: number, prev: number) => prev === 0 ? (curr > 0 ? 100 : 0) : ((curr - prev) / prev) * 100

        setStats({
          weekSale: w.saleTotal, weekProfit: w.profitTotal,
          monthSale: m.saleTotal, monthProfit: m.profitTotal,
          yearSale: y.saleTotal, yearProfit: y.profitTotal
        })

        setComparisons({
          weekChange: pctChange(w.saleTotal, pw.saleTotal),
          monthChange: pctChange(m.saleTotal, pm.saleTotal),
          yearChange: pctChange(y.saleTotal, py.saleTotal)
        })

        setMargins({
          week: w.saleTotal === 0 ? 0 : (w.profitTotal / w.saleTotal) * 100,
          month: m.saleTotal === 0 ? 0 : (m.profitTotal / m.saleTotal) * 100,
          year: y.saleTotal === 0 ? 0 : (y.profitTotal / y.saleTotal) * 100
        })

        // ยอดขายรายวัน (สำหรับปฏิทิน)
        const daily = monthSales.reduce((acc: any, s: any) => {
          const date = s.created_at.split('T')[0]
          acc[date] = (acc[date] || 0) + (Number(s.total_amount) || 0)
          return acc
        }, {})
        setMonthlyStats(daily)

        // วันที่ขายดีที่สุด / แย่ที่สุดในเดือนนี้
        const dailyEntries = Object.entries(daily) as [string, number][]
        if (dailyEntries.length > 0) {
          const sorted = [...dailyEntries].sort((a, b) => b[1] - a[1])
          setBestWorstDay({
            bestDate: sorted[0][0], bestAmt: sorted[0][1],
            worstDate: sorted[sorted.length - 1][0], worstAmt: sorted[sorted.length - 1][1]
          })
        } else {
          setBestWorstDay({ bestDate: null, bestAmt: 0, worstDate: null, worstAmt: 0 })
        }

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

        // Peak times: day-of-week + hour-of-day, based on last 90 days for a current-but-stable sample
        const ninetyDaysAgo = new Date(now.getTime() - (90 * 24 * 60 * 60 * 1000)).toISOString()
        const last90Sales = (salesData || []).filter(s => s.created_at >= ninetyDaysAgo)

        const dowAgg: Record<number, { revenue: number; count: number }> = {}
        const hourAgg: Record<number, { revenue: number; count: number }> = {}
        last90Sales.forEach((s: any) => {
          const d = new Date(s.created_at)
          const dow = d.getDay()
          const hr = d.getHours()
          if (!dowAgg[dow]) dowAgg[dow] = { revenue: 0, count: 0 }
          if (!hourAgg[hr]) hourAgg[hr] = { revenue: 0, count: 0 }
          dowAgg[dow].revenue += Number(s.total_amount) || 0
          dowAgg[dow].count += 1
          hourAgg[hr].revenue += Number(s.total_amount) || 0
          hourAgg[hr].count += 1
        })
        setDowData(DOW_LABELS_TH.map((label, i) => ({
          day: label, revenue: dowAgg[i]?.revenue || 0, count: dowAgg[i]?.count || 0
        })))
        setHourData(Array.from({ length: 24 }, (_, h) => ({
          hour: `${h}:00`, revenue: hourAgg[h]?.revenue || 0, count: hourAgg[h]?.count || 0
        })).filter(h => h.count > 0 || (h.hour >= '07:00' && h.hour <= '22:00')))

        // Payment method mix, this month
        const payAgg: Record<string, { revenue: number; count: number }> = {}
        monthSales.forEach((s: any) => {
          const method = s.payment_method || 'อื่นๆ'
          if (!payAgg[method]) payAgg[method] = { revenue: 0, count: 0 }
          payAgg[method].revenue += Number(s.total_amount) || 0
          payAgg[method].count += 1
        })
        setPaymentMix(Object.entries(payAgg).map(([method, d]) => ({ method, revenue: d.revenue, count: d.count })))

        // Slow movers: active products with zero sales in the last 30 days
        const thirtyDaysAgo = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000)).toISOString()
        const last30Sales = (salesData || []).filter(s => s.created_at >= thirtyDaysAgo)
        const soldProductIds = new Set<string>()
        last30Sales.forEach((s: any) => s.sale_items?.forEach((item: any) => soldProductIds.add(item.product_id)))
        const slow = (products || [])
          .filter((p: any) => p.is_active !== false && !soldProductIds.has(p.id))
          .map((p: any) => ({ name: p.name, stock: Number(p.stock) || 0 }))
        setSlowMovers(slow)

      } else {
        // Reset if no data
        setStats({ weekSale: 0, weekProfit: 0, monthSale: 0, monthProfit: 0, yearSale: 0, yearProfit: 0 })
        setBestSellers([])
        setComparisons({ weekChange: 0, monthChange: 0, yearChange: 0 })
        setMargins({ week: 0, month: 0, year: 0 })
        setDowData([])
        setHourData([])
        setPaymentMix([])
        setSlowMovers((products || []).filter((p: any) => p.is_active !== false).map((p: any) => ({ name: p.name, stock: Number(p.stock) || 0 })))
        setBestWorstDay({ bestDate: null, bestAmt: 0, worstDate: null, worstAmt: 0 })
      }
    } catch (err: any) {
      setError("Database Error: " + err.message)
    } finally {
      setLoading(false)
    }
  }

  // Trend chart data: daily revenue + profit for the last N days, anchored to "today" (not calendar nav)
  const computeTrend = (salesData: any[], days: number, costMap: Record<string, number>) => {
    if (!salesData || salesData.length === 0) { setTrendData([]); return }
    const now = new Date()
    const cutoff = new Date(now.getTime() - (days * 24 * 60 * 60 * 1000))
    const rangeSales = salesData.filter(s => new Date(s.created_at) >= cutoff)

    const byDate: Record<string, { revenue: number; profit: number }> = {}
    rangeSales.forEach((s: any) => {
      const date = s.created_at.split('T')[0]
      if (!byDate[date]) byDate[date] = { revenue: 0, profit: 0 }
      byDate[date].revenue += Number(s.total_amount) || 0
      s.sale_items?.forEach((item: any) => {
        const cost = costMap[item.product_id] || 0
        const sellPrice = Number(item.price_at_sale) || 0
        byDate[date].profit += (sellPrice - cost) * (Number(item.quantity) || 0)
      })
    })

    // Fill in every day in range (even zero-sale days) so the line doesn't skip gaps
    const result: { date: string; revenue: number; profit: number }[] = []
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now.getTime() - (i * 24 * 60 * 60 * 1000))
      const key = d.toISOString().split('T')[0]
      const label = `${d.getDate()}/${d.getMonth() + 1}`
      result.push({ date: label, revenue: byDate[key]?.revenue || 0, profit: byDate[key]?.profit || 0 })
    }
    setTrendData(result)
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
                { label: 'Weekly', sale: stats.weekSale, profit: stats.weekProfit, color: 'blue', change: comparisons.weekChange, changeLabel: 'vs last week', margin: margins.week },
                { label: 'Monthly', sale: stats.monthSale, profit: stats.monthProfit, color: 'emerald', change: comparisons.monthChange, changeLabel: 'vs last month', margin: margins.month },
                { label: 'Annual', sale: stats.yearSale, profit: stats.yearProfit, color: 'indigo', change: comparisons.yearChange, changeLabel: 'vs last year (YTD)', margin: margins.year }
              ].map((card, i) => (
                <div key={i} className="bg-white p-8 rounded-[3rem] shadow-sm border border-slate-100 hover:scale-[1.03] transition-all duration-300 group">
                  <div className="flex justify-between items-start mb-8">
                    <span className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest bg-${card.color}-50 text-${card.color}-600`}>{card.label}</span>
                    <div className={`p-3 rounded-2xl bg-${card.color}-50 text-${card.color}-600`}><DollarSign size={20}/></div>
                  </div>
                  <div className="space-y-6">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-slate-400 text-[10px] font-bold uppercase tracking-wider">Revenue</p>
                        <span className={`flex items-center gap-0.5 text-[10px] font-black ${card.change > 0 ? 'text-emerald-500' : card.change < 0 ? 'text-red-500' : 'text-slate-400'}`}>
                          {card.change > 0 ? <ArrowUp size={10}/> : card.change < 0 ? <ArrowDown size={10}/> : <Minus size={10}/>}
                          {Math.abs(card.change).toFixed(1)}%
                        </span>
                      </div>
                      <p className="text-2xl font-black text-slate-800">฿{card.sale.toLocaleString()}</p>
                      <p className="text-slate-300 text-[9px] font-bold uppercase tracking-wider mt-0.5">{card.changeLabel}</p>
                    </div>
                    <div className="pt-6 border-t border-slate-50">
                      <div className="flex items-center justify-between mb-1">
                        <p className={`text-${card.color}-600 text-[10px] font-black uppercase tracking-wider`}>Net Profit</p>
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider">{card.margin.toFixed(1)}% margin</span>
                      </div>
                      <p className={`text-4xl font-black text-${card.color}-600`}>฿{card.profit.toLocaleString()}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Best / Worst Day this month */}
            {(bestWorstDay.bestDate || bestWorstDay.worstDate) && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {bestWorstDay.bestDate && (
                  <div className="bg-emerald-50 rounded-[2rem] p-6 border border-emerald-100 flex items-center gap-4">
                    <div className="bg-emerald-500 p-3 rounded-2xl text-white"><ArrowUp size={18}/></div>
                    <div>
                      <p className="text-emerald-700 text-[10px] font-black uppercase tracking-widest">Best Day This Month</p>
                      <p className="text-emerald-900 font-black text-lg">{new Date(bestWorstDay.bestDate).toLocaleDateString('th-TH', { day: 'numeric', month: 'long' })} — ฿{bestWorstDay.bestAmt.toLocaleString()}</p>
                    </div>
                  </div>
                )}
                {bestWorstDay.worstDate && (
                  <div className="bg-amber-50 rounded-[2rem] p-6 border border-amber-100 flex items-center gap-4">
                    <div className="bg-amber-500 p-3 rounded-2xl text-white"><ArrowDown size={18}/></div>
                    <div>
                      <p className="text-amber-700 text-[10px] font-black uppercase tracking-widest">Slowest Day This Month</p>
                      <p className="text-amber-900 font-black text-lg">{new Date(bestWorstDay.worstDate).toLocaleDateString('th-TH', { day: 'numeric', month: 'long' })} — ฿{bestWorstDay.worstAmt.toLocaleString()}</p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Trend Chart */}
            <div className="bg-white rounded-[3.5rem] p-10 border border-slate-100 shadow-sm">
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-4">
                  <div className="bg-blue-100 p-4 rounded-3xl text-blue-600 shadow-sm shadow-blue-100"><TrendingUp size={28}/></div>
                  <div>
                    <h2 className="text-2xl font-black text-slate-800 italic uppercase tracking-tighter leading-none">Sales Trend</h2>
                    <p className="text-slate-400 text-xs font-medium mt-1 uppercase tracking-widest">Revenue & Profit Over Time</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  {[30, 90].map(r => (
                    <button key={r} onClick={() => setTrendRange(r as 30 | 90)}
                      className={`px-4 py-2 rounded-xl text-xs font-black transition-colors ${trendRange === r ? 'bg-blue-600 text-white' : 'bg-slate-50 text-slate-400 hover:bg-slate-100'}`}>
                      {r}D
                    </button>
                  ))}
                </div>
              </div>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trendData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94a3b8' }} interval={trendRange === 90 ? 6 : 3} />
                    <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} tickFormatter={(v) => `฿${(v / 1000).toFixed(0)}k`} />
                    <Tooltip formatter={(v: any, name: any) => [`฿${Number(v).toLocaleString()}`, name]} contentStyle={{ borderRadius: 16, border: '1px solid #f1f5f9', fontSize: 12 }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Line type="monotone" dataKey="revenue" name="Revenue" stroke="#3b82f6" strokeWidth={2.5} dot={false} />
                    <Line type="monotone" dataKey="profit" name="Profit" stroke="#10b981" strokeWidth={2.5} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Peak Times: Day of Week + Hour of Day */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-white rounded-[3rem] p-8 border border-slate-100 shadow-sm">
                <div className="flex items-center gap-3 mb-6">
                  <div className="bg-indigo-100 p-3 rounded-2xl text-indigo-600"><CalendarDays size={20}/></div>
                  <div>
                    <h3 className="font-black text-slate-800 text-sm uppercase tracking-tight">Busiest Days</h3>
                    <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest">Last 90 Days</p>
                  </div>
                </div>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={dowData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                      <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                      <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} tickFormatter={(v) => `฿${(v / 1000).toFixed(0)}k`} />
                      <Tooltip formatter={(v: any) => `฿${Number(v).toLocaleString()}` as any} contentStyle={{ borderRadius: 16, border: '1px solid #f1f5f9', fontSize: 12 }} />
                      <Bar dataKey="revenue" fill="#6366f1" radius={[8, 8, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="bg-white rounded-[3rem] p-8 border border-slate-100 shadow-sm">
                <div className="flex items-center gap-3 mb-6">
                  <div className="bg-cyan-100 p-3 rounded-2xl text-cyan-600"><Clock size={20}/></div>
                  <div>
                    <h3 className="font-black text-slate-800 text-sm uppercase tracking-tight">Peak Hours</h3>
                    <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest">Last 90 Days</p>
                  </div>
                </div>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={hourData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                      <XAxis dataKey="hour" tick={{ fontSize: 9, fill: '#94a3b8' }} interval={2} />
                      <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} tickFormatter={(v) => `฿${(v / 1000).toFixed(0)}k`} />
                      <Tooltip formatter={(v: any) => `฿${Number(v).toLocaleString()}` as any} contentStyle={{ borderRadius: 16, border: '1px solid #f1f5f9', fontSize: 12 }} />
                      <Bar dataKey="revenue" fill="#06b6d4" radius={[8, 8, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Payment Mix + Slow Movers */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-white rounded-[3rem] p-8 border border-slate-100 shadow-sm">
                <div className="flex items-center gap-3 mb-6">
                  <div className="bg-purple-100 p-3 rounded-2xl text-purple-600"><Wallet size={20}/></div>
                  <div>
                    <h3 className="font-black text-slate-800 text-sm uppercase tracking-tight">Payment Mix</h3>
                    <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest">This Month</p>
                  </div>
                </div>
                {paymentMix.length > 0 ? (
                  <div className="h-56 flex items-center">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={paymentMix} dataKey="revenue" nameKey="method" cx="50%" cy="50%" innerRadius={45} outerRadius={75} paddingAngle={3}>
                          {paymentMix.map((entry, idx) => (
                            <Cell key={idx} fill={PAYMENT_COLORS[entry.method] || ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'][idx % 5]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={((v: any, n: any, entry: any) => [`฿${Number(v).toLocaleString()} (${entry.payload.count} sales)`, paymentLabelTH(entry.payload.method)]) as any} contentStyle={{ borderRadius: 16, border: '1px solid #f1f5f9', fontSize: 12 }} />
                        <Legend formatter={(value) => paymentLabelTH(value)} wrapperStyle={{ fontSize: 11 }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="text-center py-16 text-slate-300 italic font-medium text-sm">ยังไม่มีข้อมูลเดือนนี้</div>
                )}
              </div>

              <div className="bg-white rounded-[3rem] p-8 border border-slate-100 shadow-sm">
                <div className="flex items-center gap-3 mb-6">
                  <div className="bg-red-100 p-3 rounded-2xl text-red-500"><PackageX size={20}/></div>
                  <div>
                    <h3 className="font-black text-slate-800 text-sm uppercase tracking-tight">Slow Movers</h3>
                    <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest">No Sales in 30 Days</p>
                  </div>
                </div>
                <div className="h-56 overflow-y-auto space-y-2 pr-1">
                  {slowMovers.length > 0 ? slowMovers.slice(0, 12).map((p, idx) => (
                    <div key={idx} className="flex items-center justify-between px-4 py-2.5 rounded-xl bg-slate-50 text-sm">
                      <span className="font-bold text-slate-600 truncate">{p.name}</span>
                      <span className="text-slate-400 text-[10px] font-black uppercase shrink-0 ml-2">stock: {p.stock}</span>
                    </div>
                  )) : (
                    <div className="text-center py-16 text-slate-300 italic font-medium text-sm">สินค้าทุกชิ้นขายได้ในช่วง 30 วัน 🎉</div>
                  )}
                  {slowMovers.length > 12 && (
                    <p className="text-center text-slate-300 text-[10px] font-bold uppercase pt-2">+{slowMovers.length - 12} more</p>
                  )}
                </div>
              </div>
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