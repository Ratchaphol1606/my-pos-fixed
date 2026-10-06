"use client"
import { useState, useRef } from 'react'
import { X, Download } from 'lucide-react'
import { Sale, Settings } from '@/src/types'

interface TaxInvoiceModalProps {
  sale: Sale
  settings: Settings | null
  onClose: () => void
}

const paymentLabel = (method: string) => {
  if (method === 'cash') return 'เงินสด'
  if (method === 'transfer') return 'โอนเงิน'
  if (method === 'promptpay') return 'พร้อมเพย์'
  return method
}

// วันที่แบบไทย พ.ศ. เช่น 10 กันยายน 2569
const thaiMonths = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
]
const formatThaiDate = (d: Date) =>
  `${d.getDate()} ${thaiMonths[d.getMonth()]} ${d.getFullYear() + 543}`

export default function TaxInvoiceModal({ sale, settings, onClose }: TaxInvoiceModalProps) {
  const [useCurrentDate, setUseCurrentDate] = useState(true)
  const [downloading, setDownloading] = useState(false)
  const printRef = useRef<HTMLDivElement>(null)

  const snap = sale.receipt_snapshot
  if (!snap) return null

  const vatEnabled = !!settings?.vat_enabled
  const total = Number(snap.total) || 0
  // ราคารวม VAT แล้ว (วิธีคิดแบบ Thai retail ทั่วไป) — ถอดภาษีออกจากยอดสุทธิ
  const productValue = vatEnabled ? total / 1.07 : total
  const vatAmount = vatEnabled ? total - productValue : 0

  const dateText = useCurrentDate ? formatThaiDate(new Date()) : ''

  const handleDownloadPdf = async () => {
    if (!printRef.current) return
    setDownloading(true)
    try {
      const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
        import('html2canvas-pro'),
        import('jspdf'),
      ])

      const canvas = await html2canvas(printRef.current, {
        scale: 2,
        backgroundColor: '#ffffff',
        useCORS: true,
      })
      const imgData = canvas.toDataURL('image/png')

      // A4 ขนาด 210x297mm — สเกลความสูงของภาพให้พอดีความกว้างหน้ากระดาษ
      const pdf = new jsPDF('p', 'mm', 'a4')
      const pageWidth = pdf.internal.pageSize.getWidth()
      const imgHeight = (canvas.height * pageWidth) / canvas.width
      pdf.addImage(imgData, 'PNG', 0, 0, pageWidth, imgHeight)
      pdf.save(`invoice-${snap.receiptNo}.pdf`)
    } catch (err: any) {
      alert('สร้าง PDF ไม่สำเร็จ: ' + err.message)
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-3xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b">
          <h2 className="text-lg font-bold">ใบเสร็จรับเงิน / ใบกำกับภาษี</h2>
          <button
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-slate-100 text-slate-500"
          >
            <X size={20} />
          </button>
        </div>

        {/* ตัวเลือกวันที่ */}
        <div className="px-5 pt-4">
          <label className="flex items-center gap-3 p-3 bg-slate-50 rounded-2xl cursor-pointer select-none text-sm">
            <input
              type="checkbox"
              className="w-4 h-4 accent-blue-500"
              checked={useCurrentDate}
              onChange={e => setUseCurrentDate(e.target.checked)}
            />
            <span className="font-bold text-black">
              ใส่วันที่ปัจจุบันอัตโนมัติ
            </span>
            <span className="text-slate-400">
              (ไม่ติ๊ก = เว้นว่างให้ลูกค้าเขียนเอง)
            </span>
          </label>
        </div>

        {/* เอกสาร A4 สำหรับแปลงเป็น PDF */}
        <div className="p-5">
          <div
            ref={printRef}
            className="bg-white text-black p-8 border border-slate-200"
            style={{ fontFamily: 'sans-serif', width: '100%' }}
          >
            {/* หัวเอกสาร */}
            <div className="flex justify-between items-start mb-6">
              <div>
                <p className="text-xl font-bold">{settings?.shop_name || ''}</p>
                {settings?.shop_address && <p className="text-xs text-slate-600 max-w-[260px]">{settings.shop_address}</p>}
                {settings?.shop_phone && <p className="text-xs text-slate-600">โทร {settings.shop_phone}</p>}
              </div>
              <div className="text-right">
                <p className="text-lg font-bold">ใบเสร็จรับเงิน / ใบกำกับภาษี</p>
                <p className="text-xs text-slate-500 mt-1">เลขที่ {snap.receiptNo}</p>
                <p className="text-xs text-slate-500">
                  วันที่ {dateText || '........................................'}
                </p>
              </div>
            </div>

            {/* กล่องลูกค้า */}
            <div className="border border-slate-300 rounded-xl p-3 mb-5">
              <p className="text-[10px] text-slate-400">ลูกค้า</p>
              <p className="font-bold">{snap.customerName || 'ลูกค้าทั่วไป'}</p>
            </div>

            {/* ตารางรายการ */}
            <table className="w-full text-sm mb-5">
              <thead>
                <tr className="bg-slate-100 text-slate-600 text-xs">
                  <th className="p-2 text-left">#</th>
                  <th className="p-2 text-left">รายการ</th>
                  <th className="p-2 text-right">จำนวน</th>
                  <th className="p-2 text-right">ราคา/หน่วย</th>
                  <th className="p-2 text-right">จำนวนเงิน</th>
                </tr>
              </thead>
              <tbody>
                {snap.items.map((item, idx) => (
                  <tr key={idx} className="border-b border-slate-100">
                    <td className="p-2 text-slate-400">{idx + 1}</td>
                    <td className="p-2">{item.name}</td>
                    <td className="p-2 text-right">{item.qty}</td>
                    <td className="p-2 text-right">{item.price.toLocaleString()}</td>
                    <td className="p-2 text-right">{item.subtotal.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* ชำระเงิน + ยอดรวม */}
            <div className="flex justify-between items-start">
              <div className="text-sm">
                <p className="text-slate-500 text-xs mb-1">ชำระโดย</p>
                <p className="font-bold">{paymentLabel(snap.paymentMethod)}</p>
              </div>
              <div className="w-64 text-sm space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-500">รวมเป็นเงิน</span>
                  <span>{total.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                </div>
                {vatEnabled && (
                  <>
                    <div className="flex justify-between">
                      <span className="text-slate-500">มูลค่าสินค้า/บริการ</span>
                      <span>{productValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">ภาษีมูลค่าเพิ่ม 7.00%</span>
                      <span>{vatAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                    </div>
                  </>
                )}
                <div className="flex justify-between font-bold text-base border-t border-slate-300 pt-1 mt-1">
                  <span>ยอดสุทธิ</span>
                  <span>{total.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                </div>
              </div>
            </div>

            {vatEnabled && (
              <p className="text-[10px] text-slate-400 mt-2">ราคาดังกล่าวได้รวมภาษีมูลค่าเพิ่มแล้ว</p>
            )}

            {/* ลายเซ็น */}
            <div className="grid grid-cols-2 gap-8 mt-16 text-center text-xs">
              <div>
                <div className="border-t border-slate-400 pt-2">ผู้รับสินค้า / วันที่</div>
              </div>
              <div>
                <div className="border-t border-slate-400 pt-2">ผู้รับเงิน</div>
              </div>
            </div>
          </div>
        </div>

        <div className="p-5 border-t flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-3 rounded-2xl bg-slate-100 text-slate-600 font-bold hover:bg-slate-200"
          >
            ปิด
          </button>
          <button
            onClick={handleDownloadPdf}
            disabled={downloading}
            className="flex-1 py-3 rounded-2xl bg-green-500 text-white font-bold hover:bg-green-600 disabled:opacity-40 flex items-center justify-center gap-2"
          >
            <Download size={18} />
            {downloading ? 'กำลังสร้าง PDF...' : 'ดาวน์โหลด PDF'}
          </button>
        </div>
      </div>
    </div>
  )
}
