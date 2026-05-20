"use client"
import { useState, useEffect } from 'react'
import { supabase } from '@/src/lib/supabase'
import * as XLSX from 'xlsx'
import { 
  TrendingUp, Trophy, DollarSign, AlertCircle, 
  FileSpreadsheet, Calendar as CalendarIcon, Filter, Banknote, CreditCard
} from 'lucide-react'
import { Product } from '@/src/types'

export default function ReportsPage() {
  // เริ่มต้นที่วันที่ 1 ของเดือนปัจจุบัน ถึง วันนี้
  const [dateRange, setDateRange] = useState({
    start: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0]
  })
  
  const [stats, setStats] = useState({ saleTotal: 0, profitTotal: 0, count: 0 })
  const [paymentStats, setPaymentStats] = useState({ cash: 0, transfer: 0 })
  const [bestSellers, setBestSellers] = useState<any[]>([])
  const [rawSales, setRawSales] = useState<any[]>([]) // เก็บข้อมูลดิบสำหรับ Export
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchFinancialData()
  }, [dateRange])

  const fetchFinancialData = async () => {
    setLoading(true)
    setError(null)
    try {
      // 1. ดึงยอดขายในช่วงวันที่เลือก
      const { data: salesData, error: salesError } = await supabase
        .from('sales')
        .select(`
          id, total_amount, payment_method, created_at, receipt_no,
          sale_items (product_id, quantity, price_at_sale)
        `)
        .gte('created_at', `${dateRange.start}T00:00:00`)
        .lte('created_at', `${dateRange.end}T23:59:59`)
        .order('created_at', { ascending: true })

      if (salesError) throw salesError

      // 2. ดึงข้อมูลสินค้าเพื่อหาต้นทุน
      const { data: products } = await supabase.from('products').select('id, name, cost_price, category')
      const productMap = products?.reduce((acc: any, p: Product) => { acc[p.id] = p; return acc }, {}) || {}

      if (salesData) {
        setRawSales(salesData)
        let total = 0; let profit = 0; let cash = 0; let transfer = 0;
        const topProductMap: any = {}

        salesData.forEach(sale => {
          const amount = Number(sale.total_amount) || 0
          total += amount
          if (sale.payment_method === 'cash') cash += amount
          else transfer += amount

          sale.sale_items?.forEach((item: any) => {
            const pInfo = productMap[item.product_id]
            const sPrice = Number(item.price_at_sale) || 0
            const cPrice = Number(pInfo?.cost_price) || 0
            const qty = Number(item.quantity) || 0
            
            profit += (sPrice - cPrice) * qty

            // จัดอันดับสินค้า
            const name = pInfo?.name || 'Unknown'
            if (!topProductMap[name]) topProductMap[name] = { profit: 0, qty: 0 }
            topProductMap[name].profit += (sPrice - cPrice) * qty
            topProductMap[name].qty += qty
          })
        })

        setStats({ saleTotal: total, profitTotal: profit, count: salesData.length })
        setPaymentStats({ cash, transfer })
        setBestSellers(
          Object.entries(topProductMap)
            .map(([name, d]: any) => ({ name, profit: d.profit, qty: d.qty }))
            .sort((a, b) => b.profit - a.profit).slice(0, 5)
        )
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // ✅ ฟังก์ชัน Export Excel สำหรับยื่นภาษี
  const handleExportExcel = () => {
    if (rawSales.length === 0) return alert("ไม่มีข้อมูลในช่วงวันที่เลือก")

    const excelData = rawSales.map((s) => ({
      "วันที่-เวลา": new Date(s.created_at).toLocaleString('th-TH'),
      "เลขที่ใบเสร็จ": s.receipt_no || s.id.slice(0,8),
      "ยอดขายรวม (บาท)": Number(s.total_amount),
      "ช่องทางชำระ": s.payment_method === 'cash' ? 'เงินสด' : 'เงินโอน',
      "หมายเหตุ": ""
    }))

    const worksheet = XLSX.utils.json_to_sheet(excelData)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, "Sales_Tax_Report")
    
    // ตั้งชื่อไฟล์ตามช่วงวันที่
    XLSX.writeFile(workbook, `Report_${dateRange.start}_to_${dateRange.end}.xlsx`)
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] p-4 md:p-8 font-sans">
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* Header & Date Filter */}
        <div className="bg-white p-8 rounded-[3rem] shadow-sm border border-slate-100 flex flex-col md:flex-row justify-between items-center gap-6">
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
                onChange={(e) => setDateRange({...dateRange, start: e.target.value})}
                className="bg-transparent text-sm font-bold outline-none"
              />
              <span className="text-slate-300 px-2">-</span>
              <input 
                type="date" 
                value={dateRange.end}
                onChange={(e) => setDateRange({...dateRange, end: e.target.value})}
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
             </div>
          </div>
        </div>

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