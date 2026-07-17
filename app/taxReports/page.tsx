"use client"
import { useState, useEffect } from 'react'
import { supabase } from '@/src/lib/supabase'
import * as XLSX from 'xlsx'
import { 
  TrendingUp, Trophy, DollarSign, AlertCircle, 
  FileSpreadsheet, Calendar as CalendarIcon, Filter, Banknote, CreditCard,
  PackageMinus, Tag, AlertTriangle, CheckCircle2
} from 'lucide-react'
import { Product } from '@/src/types'

type QuickPreset = 'thisMonth' | 'lastMonth' | 'thisYear' | 'lastYear' | 'custom'

export default function ReportsPage() {
  // เริ่มต้นที่วันที่ 1 ของเดือนปัจจุบัน ถึง วันนี้
  const [dateRange, setDateRange] = useState({
    start: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0]
  })
  const [activePreset, setActivePreset] = useState<QuickPreset>('thisMonth')
  
  const [stats, setStats] = useState({ saleTotal: 0, profitTotal: 0, count: 0 })
  const [paymentStats, setPaymentStats] = useState({ cash: 0, transfer: 0, wallet: 0 })
  const [bestSellers, setBestSellers] = useState<any[]>([])
  const [rawSales, setRawSales] = useState<any[]>([]) // เก็บข้อมูลดิบสำหรับ Export
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // --- New: COGS, discounts, monthly summary, receipt gap check ---
  const [cogsTotal, setCogsTotal] = useState(0)
  const [discountTotal, setDiscountTotal] = useState(0)
  const [monthlySummary, setMonthlySummary] = useState<{ month: string; sale: number; cost: number; profit: number; count: number }[]>([])
  const [receiptGaps, setReceiptGaps] = useState<{ date: string; missing: number[] }[]>([])

  useEffect(() => {
    fetchFinancialData()
  }, [dateRange])

  const applyPreset = (preset: QuickPreset) => {
    const now = new Date()
    let start = dateRange.start, end = dateRange.end
    if (preset === 'thisMonth') {
      start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
      end = now.toISOString().split('T')[0]
    } else if (preset === 'lastMonth') {
      const lm = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      start = lm.toISOString().split('T')[0]
      end = new Date(lm.getFullYear(), lm.getMonth() + 1, 0).toISOString().split('T')[0]
    } else if (preset === 'thisYear') {
      start = new Date(now.getFullYear(), 0, 1).toISOString().split('T')[0]
      end = now.toISOString().split('T')[0]
    } else if (preset === 'lastYear') {
      start = new Date(now.getFullYear() - 1, 0, 1).toISOString().split('T')[0]
      end = new Date(now.getFullYear() - 1, 11, 31).toISOString().split('T')[0]
    }
    setActivePreset(preset)
    setDateRange({ start, end })
  }

  const fetchFinancialData = async () => {
    setLoading(true)
    setError(null)
    try {
      // 1. ดึงยอดขายในช่วงวันที่เลือก
      const { data: salesData, error: salesError } = await supabase
        .from('sales')
        .select(`
          id, total_amount, payment_method, created_at, receipt_no, discount_amount,
          sale_items (product_id, quantity, price_at_sale)
        `)
        .gte('created_at', `${dateRange.start}T00:00:00`)
        .lte('created_at', `${dateRange.end}T23:59:59`)
        .order('created_at', { ascending: true })

      if (salesError) throw salesError

      // 2. ดึงข้อมูลสินค้าเพื่อหาต้นทุน
      const { data: products } = await supabase.from('products').select('id, name, cost_price, category')
      const productMap = products?.reduce((acc: any, p) => { acc[p.id] = p; return acc }, {}) || {}

      if (salesData) {
        let total = 0; let profit = 0; let cash = 0; let transfer = 0; let wallet = 0;
        let cogs = 0; let discounts = 0;
        const topProductMap: any = {}
        const monthAgg: Record<string, { sale: number; cost: number; profit: number; count: number }> = {}

        const enrichedSales = salesData.map((sale: any) => {
          const amount = Number(sale.total_amount) || 0
          total += amount
          discounts += Number(sale.discount_amount) || 0
          if (sale.payment_method === 'cash') cash += amount
          else if (sale.payment_method === 'wallet') wallet += amount
          else transfer += amount

          const monthKey = sale.created_at.slice(0, 7) // YYYY-MM
          if (!monthAgg[monthKey]) monthAgg[monthKey] = { sale: 0, cost: 0, profit: 0, count: 0 }
          monthAgg[monthKey].sale += amount
          monthAgg[monthKey].count += 1

          let saleCost = 0
          let saleProfit = 0
          sale.sale_items?.forEach((item: any) => {
            const pInfo = productMap[item.product_id]
            const sPrice = Number(item.price_at_sale) || 0
            const cPrice = Number(pInfo?.cost_price) || 0
            const qty = Number(item.quantity) || 0

            const lineCost = cPrice * qty
            const lineProfit = (sPrice - cPrice) * qty
            saleCost += lineCost
            saleProfit += lineProfit
            profit += lineProfit
            cogs += lineCost
            monthAgg[monthKey].cost += lineCost
            monthAgg[monthKey].profit += lineProfit

            // จัดอันดับสินค้า
            const name = pInfo?.name || 'Unknown'
            if (!topProductMap[name]) topProductMap[name] = { profit: 0, qty: 0 }
            topProductMap[name].profit += lineProfit
            topProductMap[name].qty += qty
          })

          return { ...sale, _cost: saleCost, _profit: saleProfit }
        })

        setRawSales(enrichedSales)
        setStats({ saleTotal: total, profitTotal: profit, count: salesData.length })
        setPaymentStats({ cash, transfer, wallet })
        setCogsTotal(cogs)
        setDiscountTotal(discounts)
        setBestSellers(
          Object.entries(topProductMap)
            .map(([name, d]: any) => ({ name, profit: d.profit, qty: d.qty }))
            .sort((a, b) => b.profit - a.profit).slice(0, 5)
        )
        setMonthlySummary(
          Object.entries(monthAgg)
            .map(([month, d]) => ({ month, sale: d.sale, cost: d.cost, profit: d.profit, count: d.count }))
            .sort((a, b) => a.month.localeCompare(b.month))
        )

        // Receipt number gap check: format is INV + YYYYMMDD + 2-digit daily sequence
        const byDay: Record<string, number[]> = {}
        salesData.forEach((s: any) => {
          const match = /^INV(\d{8})(\d{2})$/.exec(s.receipt_no || '')
          if (!match) return
          const [, dateStr, seqStr] = match
          if (!byDay[dateStr]) byDay[dateStr] = []
          byDay[dateStr].push(Number(seqStr))
        })
        const gaps: { date: string; missing: number[] }[] = []
        Object.entries(byDay).forEach(([dateStr, seqs]) => {
          const sorted = [...seqs].sort((a, b) => a - b)
          const max = sorted[sorted.length - 1]
          const missing: number[] = []
          for (let i = 1; i < max; i++) {
            if (!sorted.includes(i)) missing.push(i)
          }
          if (missing.length > 0) {
            const y = dateStr.slice(0, 4), m = dateStr.slice(4, 6), d = dateStr.slice(6, 8)
            gaps.push({ date: `${d}/${m}/${y}`, missing })
          }
        })
        setReceiptGaps(gaps)
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // ✅ ฟังก์ชัน Export Excel สำหรับยื่นภาษี (multi-sheet: Detail, Monthly Summary, Top Products)
  const handleExportExcel = () => {
    if (rawSales.length === 0) return alert("ไม่มีข้อมูลในช่วงวันที่เลือก")

    // Sheet 1: Detail — one row per sale, with cost + profit computed per sale
    const detailData = rawSales.map((s) => ({
      "วันที่-เวลา": new Date(s.created_at).toLocaleString('th-TH'),
      "เลขที่ใบเสร็จ": s.receipt_no || s.id.slice(0, 8),
      "ยอดขายรวม (บาท)": Number(s.total_amount),
      "ต้นทุน (บาท)": s._cost || 0,
      "กำไร (บาท)": s._profit || 0,
      "ส่วนลด (บาท)": Number(s.discount_amount) || 0,
      "ช่องทางชำระ": s.payment_method === 'cash' ? 'เงินสด' : s.payment_method === 'wallet' ? 'เป๋าตัง' : 'เงินโอน',
      "หมายเหตุ": ""
    }))

    // Sheet 2: Monthly Summary
    const summaryData = monthlySummary.map(m => ({
      "เดือน": m.month,
      "ยอดขาย (บาท)": m.sale,
      "ต้นทุน (บาท)": m.cost,
      "กำไร (บาท)": m.profit,
      "จำนวนบิล": m.count
    }))
    summaryData.push({
      "เดือน": "รวมทั้งหมด",
      "ยอดขาย (บาท)": stats.saleTotal,
      "ต้นทุน (บาท)": cogsTotal,
      "กำไร (บาท)": stats.profitTotal,
      "จำนวนบิล": stats.count
    })

    // Sheet 3: Top Products
    const productsData = bestSellers.map((p, idx) => ({
      "อันดับ": idx + 1,
      "สินค้า": p.name,
      "จำนวนขาย (ชิ้น)": p.qty,
      "กำไรรวม (บาท)": p.profit
    }))

    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(detailData), "Detail")
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(summaryData), "Monthly Summary")
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(productsData), "Top Products")
    
    // ตั้งชื่อไฟล์ตามช่วงวันที่
    XLSX.writeFile(workbook, `Report_${dateRange.start}_to_${dateRange.end}.xlsx`)
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] p-4 md:p-8 font-sans">
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* Header & Date Filter */}
        <div className="bg-white p-8 rounded-[3rem] shadow-sm border border-slate-100 flex flex-col gap-6">
          <div className="flex flex-col md:flex-row justify-between items-center gap-6">
            <div>
              <h1 className="text-4xl font-black text-slate-900 tracking-tighter italic uppercase">Tax Report</h1>
              <p className="text-slate-500 font-medium">สรุปข้อมูลสำคัญสำหรับยื่นสรรพากร</p>
            </div>
            
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2 bg-slate-50 p-2 rounded-2xl border border-slate-100">
                <CalendarIcon size={16} className="text-slate-400 ml-2" />
                <input 
                  type="date" 
                  value={dateRange.start}
                  onChange={(e) => { setActivePreset('custom'); setDateRange({...dateRange, start: e.target.value}) }}
                  className="bg-transparent text-sm font-bold outline-none"
                />
                <span className="text-slate-300 px-2">-</span>
                <input 
                  type="date" 
                  value={dateRange.end}
                  onChange={(e) => { setActivePreset('custom'); setDateRange({...dateRange, end: e.target.value}) }}
                  className="bg-transparent text-sm font-bold outline-none"
                />
              </div>
              
              <button 
                onClick={handleExportExcel}
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-3 rounded-2xl font-black flex items-center gap-2 shadow-lg shadow-emerald-100 transition-all active:scale-95"
              >
                <FileSpreadsheet size={20}/> EXCEL EXPORT
              </button>
            </div>
          </div>

          {/* Quick date presets */}
          <div className="flex flex-wrap gap-2 border-t border-slate-50 pt-5">
            {([
              { key: 'thisMonth', label: 'เดือนนี้' },
              { key: 'lastMonth', label: 'เดือนที่แล้ว' },
              { key: 'thisYear', label: 'ปีนี้' },
              { key: 'lastYear', label: 'ปีที่แล้ว' }
            ] as { key: QuickPreset; label: string }[]).map(p => (
              <button
                key={p.key}
                onClick={() => applyPreset(p.key)}
                className={`px-4 py-2 rounded-xl text-xs font-black transition-colors ${activePreset === p.key ? 'bg-slate-900 text-white' : 'bg-slate-50 text-slate-400 hover:bg-slate-100'}`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div className="p-4 bg-red-50 border-l-4 border-red-500 text-red-700 rounded-r-2xl flex items-center gap-3 font-bold">
            <AlertCircle size={20}/> {error}
          </div>
        )}

        {/* Dashboard Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-slate-900 p-8 rounded-[3rem] text-white shadow-2xl relative overflow-hidden group">
            <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest mb-1">ยอดขายทั้งหมด (สุทธิ)</p>
            <p className="text-4xl font-black italic text-emerald-400">฿{stats.saleTotal.toLocaleString()}</p>
            <div className="mt-4 flex items-center gap-2 text-xs text-slate-400">
              <Filter size={14}/> {stats.count} รายการในช่วงที่เลือก
            </div>
            <DollarSign className="absolute -right-4 -bottom-4 text-white/5" size={120} />
          </div>

          <div className="bg-white p-8 rounded-[3rem] border border-slate-100 shadow-sm">
            <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest mb-1">กำไรโดยประมาณ</p>
            <p className="text-4xl font-black italic text-blue-600">฿{stats.profitTotal.toLocaleString()}</p>
            <div className="mt-4 flex gap-4 text-[10px] font-black uppercase">
              <span className="text-emerald-500">Net Profit Margin: {stats.saleTotal > 0 ? ((stats.profitTotal/stats.saleTotal)*100).toFixed(1) : 0}%</span>
            </div>
          </div>

          <div className="bg-white p-8 rounded-[3rem] border border-slate-100 shadow-sm">
             <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest mb-4">ช่องทางชำระเงิน</p>
             <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="flex items-center gap-2 text-sm font-bold text-slate-600"><Banknote size={16} className="text-emerald-500"/> เงินสด</span>
                  <span className="font-black">฿{paymentStats.cash.toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="flex items-center gap-2 text-sm font-bold text-slate-600"><CreditCard size={16} className="text-blue-500"/> โอนเงิน</span>
                  <span className="font-black">฿{paymentStats.transfer.toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="flex items-center gap-2 text-sm font-bold text-slate-600"><CreditCard size={16} className="text-purple-500"/> เป๋าตัง</span>
                  <span className="font-black">฿{paymentStats.wallet.toLocaleString()}</span>
                </div>
             </div>
          </div>
        </div>

        {/* COGS + Discount (new) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white p-8 rounded-[3rem] border border-slate-100 shadow-sm flex items-center gap-6">
            <div className="bg-orange-50 p-4 rounded-2xl text-orange-500"><PackageMinus size={24}/></div>
            <div>
              <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest mb-1">ต้นทุนขาย (COGS)</p>
              <p className="text-3xl font-black italic text-orange-500">฿{cogsTotal.toLocaleString()}</p>
            </div>
          </div>
          <div className="bg-white p-8 rounded-[3rem] border border-slate-100 shadow-sm flex items-center gap-6">
            <div className="bg-pink-50 p-4 rounded-2xl text-pink-500"><Tag size={24}/></div>
            <div>
              <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest mb-1">ส่วนลดที่ให้ลูกค้ารวม</p>
              <p className="text-3xl font-black italic text-pink-500">฿{discountTotal.toLocaleString()}</p>
            </div>
          </div>
        </div>

        {/* Receipt number gap check (new) */}
        {receiptGaps.length > 0 ? (
          <div className="bg-amber-50 border border-amber-200 rounded-[2.5rem] p-6 flex items-start gap-4">
            <div className="bg-amber-500 p-3 rounded-2xl text-white shrink-0"><AlertTriangle size={20}/></div>
            <div>
              <p className="font-black text-amber-800 text-sm uppercase tracking-wide mb-1">พบเลขที่ใบเสร็จขาดหาย ({receiptGaps.length} วัน)</p>
              <div className="space-y-1">
                {receiptGaps.map((g, i) => (
                  <p key={i} className="text-amber-700 text-xs font-bold">
                    {g.date}: ขาดเลขที่ {g.missing.join(', ')}
                  </p>
                ))}
              </div>
              <p className="text-amber-500 text-[10px] font-medium mt-2">หมายเหตุ: ระบบยังไม่มีการเก็บประวัติบิลที่ถูกยกเลิก จุดนี้อาจเป็นบิลที่ถูกยกเลิกกลางคันหรือข้อมูลขาดหาย ควรตรวจสอบ</p>
            </div>
          </div>
        ) : rawSales.length > 0 && (
          <div className="bg-emerald-50 border border-emerald-100 rounded-[2.5rem] p-5 flex items-center gap-3">
            <CheckCircle2 size={18} className="text-emerald-500 shrink-0"/>
            <p className="text-emerald-700 text-xs font-bold">เลขที่ใบเสร็จต่อเนื่องครบถ้วน ไม่พบช่องว่างในช่วงวันที่เลือก</p>
          </div>
        )}

        {/* Monthly Summary (new) */}
        {monthlySummary.length > 1 && (
          <div className="bg-white rounded-[3.5rem] p-10 border border-slate-100 shadow-sm">
            <div className="flex items-center gap-4 mb-8 text-slate-700">
              <CalendarIcon size={24}/>
              <div>
                <h2 className="text-2xl font-black italic uppercase tracking-tighter">Monthly Summary</h2>
                <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest">สรุปยอดขายรายเดือนในช่วงที่เลือก</p>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-400 text-[10px] font-black uppercase tracking-widest border-b border-slate-100">
                    <th className="py-3 pr-4">เดือน</th>
                    <th className="py-3 pr-4 text-right">ยอดขาย</th>
                    <th className="py-3 pr-4 text-right">ต้นทุน</th>
                    <th className="py-3 pr-4 text-right">กำไร</th>
                    <th className="py-3 text-right">บิล</th>
                  </tr>
                </thead>
                <tbody>
                  {monthlySummary.map((m, i) => (
                    <tr key={i} className="border-b border-slate-50">
                      <td className="py-3 pr-4 font-bold text-slate-700">{m.month}</td>
                      <td className="py-3 pr-4 text-right font-black text-slate-800">฿{m.sale.toLocaleString()}</td>
                      <td className="py-3 pr-4 text-right font-bold text-orange-500">฿{m.cost.toLocaleString()}</td>
                      <td className="py-3 pr-4 text-right font-black text-blue-600">฿{m.profit.toLocaleString()}</td>
                      <td className="py-3 text-right font-bold text-slate-400">{m.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Best Sellers */}
        <div className="bg-white rounded-[3.5rem] p-10 border border-slate-100 shadow-sm">
          <div className="flex items-center gap-4 mb-10 text-amber-600">
            <Trophy size={28}/> 
            <div>
              <h2 className="text-2xl font-black italic uppercase tracking-tighter">Performance Analysis</h2>
              <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest">สินค้าที่ทำกำไรสูงสุดในช่วงวันที่เลือก</p>
            </div>
          </div>
          
          <div className="grid grid-cols-1 gap-4">
            {bestSellers.length > 0 ? bestSellers.map((item, idx) => (
              <div key={idx} className="flex items-center justify-between p-6 rounded-[2.5rem] bg-slate-50 border border-slate-100 hover:bg-slate-900 group transition-all duration-300">
                <div className="flex items-center gap-6">
                  <span className="text-5xl font-black text-slate-200 group-hover:text-white/10 italic transition-colors">0{idx+1}</span>
                  <div>
                    <p className="text-xl font-black text-slate-700 group-hover:text-white transition-colors">{item.name}</p>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest group-hover:text-slate-500 transition-colors">ยอดขาย: {item.qty} ชิ้น</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-[9px] font-black text-emerald-500 uppercase tracking-[0.2em] mb-1 group-hover:text-emerald-400 transition-colors">Total Profit</p>
                  <p className="text-3xl font-black text-slate-800 group-hover:text-white transition-colors">฿{item.profit.toLocaleString()}</p>
                </div>
              </div>
            )) : (
              <div className="text-center py-20 text-slate-300 italic font-medium">ยังไม่มีข้อมูลการขายในช่วงนี้</div>
            )}
          </div>
        </div>

      </div>
    </div>
  )
}