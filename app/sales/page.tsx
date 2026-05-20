"use client"
import { useState, useEffect } from 'react'
import { supabase } from '@/src/lib/supabase'
import { Calendar, Search, FileText, Printer, TrendingUp, DollarSign } from 'lucide-react'
import Receipt from '../component/Receipt'
import { Sale, ReceiptDetail, Settings } from '@/src/types'

export default function SalesPage() {
  const [sales, setSales] = useState<Sale[]>([])
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0])
  const [searchTerm, setSearchTerm] = useState('')
  const [receiptDetail, setReceiptDetail] = useState<ReceiptDetail | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [settings, setSettings] = useState<Settings | null>(null)

  useEffect(() => {
    fetchSales()
    fetchSettings()
  }, [selectedDate])

  const fetchSettings = async () => {
    const { data } = await supabase.from('settings').select('*').eq('id', 1).single()
    if (data) setSettings(data)
  }

  const fetchSales = async () => {
    const { data } = await supabase
      .from('sales')
      .select('*')
      .gte('created_at', `${selectedDate}T00:00:00`)
      .lte('created_at', `${selectedDate}T23:59:59`)
      .order('created_at', { ascending: false })

    if (data) setSales(data)
  }

  const handleLoadReceipt = (sale: Sale, autoPrint: boolean = false) => {
    setIsLoading(true);

    if (sale.receipt_snapshot) {
      setReceiptDetail(sale.receipt_snapshot);
      
      if (autoPrint) {
        setTimeout(() => {
          window.print();
          setIsLoading(false);
        }, 500);
      } else {
        setIsLoading(false);
      }
    } else {
      setIsLoading(false);
      alert("บิลนี้ไม่มีข้อมูล Snapshot ย้อนหลัง");
    }
  };

  const dailyTotal = sales.reduce((sum, item) => sum + Number(item.total_amount), 0)
  const estimatedProfit = dailyTotal * 0.3

  return (
    <div className="p-4 md:p-8 bg-slate-50 min-h-screen">
      <style jsx global>{`
        @media print {
          body * { visibility: hidden; }
          .receipt-container, .receipt-container * { visibility: visible !important; }
          .receipt-container { 
            position: absolute; 
            left: 0; 
            top: 0; 
            width: 58mm; 
            display: block !important;
            background: white;
          }
          .print-hidden { display: none !important; }
          @page { margin: 0; size: auto; }
        }
      `}</style>

      <div className="print-hidden">
        <h1 className="text-3xl font-bold mb-6 flex items-center gap-2">
          <TrendingUp className="text-green-600" /> สรุปยอดขาย
        </h1>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <div className="bg-white p-6 rounded-3xl shadow-sm border-l-8 border-blue-500">
            <p className="text-black-500 text-sm">ยอดขายประจำวัน</p>
            <p className="text-4xl font-black text-blue-500">฿{dailyTotal.toLocaleString()}</p>
          </div>
          <div className="bg-white p-6 rounded-3xl shadow-sm border-l-8 border-green-500">
            <p className="text-black-500 text-sm">กำไรโดยประมาณ</p>
            <p className="text-4xl font-black text-green-600">฿{estimatedProfit.toLocaleString()}</p>
          </div>
        </div>

        <div className="flex flex-col md:flex-row gap-4 mb-6">
          <input 
            type="text" 
            placeholder="ค้นหาเลขใบเสร็จ..." 
            className="flex-1 p-4 rounded-2xl border-none shadow-sm text-black-500"
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <input 
            type="date" 
            className="p-4 rounded-2xl shadow-sm font-bold text-black-500" 
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
          />
        </div>

        <div className="bg-white rounded-3xl shadow-sm overflow-hidden">
          <table className="w-full">
            <thead className="bg-slate-100 text-slate-600">
              <tr>
                <th className="p-5 text-left">เลขใบเสร็จ</th>
                <th className="p-5 text-right">ยอดชำระ</th>
                <th className="p-5 text-center">จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {sales.filter(s => s.receipt_no.toString().includes(searchTerm)).map((sale) => (
                <tr key={sale.id} className="border-b hover:bg-slate-50">
                  <td className="p-5 font-bold text-black-500">{sale.receipt_no}</td>
                  <td className="p-5 text-right font-bold text-xl text-blue-600">
                    ฿{sale.total_amount.toLocaleString()}
                  </td>
                  <td className="p-5 flex justify-center gap-2">
                    <button onClick={() => handleLoadReceipt(sale, true)} className="p-3 bg-green-50 text-green-600 rounded-xl">
                      <Printer size={20} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* --- ส่วนใบเสร็จจาก Snapshot --- */}
      {receiptDetail && (
        <div className="fixed top-0 left-0 bg-white w-full h-full z-[-1] print:z-[100] print:block hidden">
          <div className="receipt-container mx-auto">
            <Receipt detail={receiptDetail} settings={settings} />
          </div>
        </div>
      )}
    </div>
  )
}