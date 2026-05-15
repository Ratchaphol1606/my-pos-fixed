"use client"
import { useState, useEffect } from 'react'
import { supabase } from '@/src/lib/supabase'
import { Calendar, Search, FileText, Printer, TrendingUp, DollarSign } from 'lucide-react'

// ปรับ Interface ให้ตรงกับ Database
interface Sale {
  id: string;
  receipt_no: string; // เปลี่ยนเป็น string เพราะเราใช้ INV...
  total_amount: number;
  received_amount: number;
  change_amount: number;
  created_at: string;
  receipt_snapshot?: any; // เพิ่มฟิลด์ snapshot
}

export default function SalesPage() {
  const [sales, setSales] = useState<Sale[]>([])
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0])
  const [searchTerm, setSearchTerm] = useState('')
  const [receiptDetail, setReceiptDetail] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    fetchSales()
  }, [selectedDate])

  const fetchSales = async () => {
    const { data } = await supabase
      .from('sales')
      .select('*')
      .gte('created_at', `${selectedDate}T00:00:00`)
      .lte('created_at', `${selectedDate}T23:59:59`)
      .order('created_at', { ascending: false })

    if (data) setSales(data)
  }

  // --- ฟังก์ชันดึงข้อมูลจาก Snapshot (ไม่ต้องโหลด sale_items ใหม่) ---
  const handleLoadReceipt = (sale: Sale, autoPrint: boolean = false) => {
    setIsLoading(true);

    // ถ้ามี snapshot ให้ใช้จาก snapshot เลย
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
      // กรณีบิลเก่าที่ไม่มี snapshot (Optional: คุณอาจจะใส่ logic ดึงจาก sale_items ไว้ตรงนี้)
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
          <div className="p-4 text-black text-[11px] font-mono max-w-[58mm] mx-auto">
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