"use client"
import { useState, useRef, useLayoutEffect } from 'react'
import { X, Download } from 'lucide-react'
import { Sale, Settings } from '@/src/types'

interface TaxInvoiceModalProps {
  sale: Sale
  settings: Settings | null
  onClose: () => void
}

// A4 ที่ 96dpi = 794 x 1123 px — ใช้ขนาดคงที่เสมอ ไม่ขึ้นกับหน้าจออุปกรณ์
const A4_W = 794
const A4_H = 1123

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

const money = (n: number) =>
  n.toLocaleString(undefined, { minimumFractionDigits: 2 })

export default function TaxInvoiceModal({ sale, settings, onClose }: TaxInvoiceModalProps) {
  const [useCurrentDate, setUseCurrentDate] = useState(true)
  const [downloading, setDownloading] = useState(false)
  const [scale, setScale] = useState(1)
  const [sheetH, setSheetH] = useState(A4_H)
  const previewRef = useRef<HTMLDivElement>(null) // กรอบพรีวิว (ใช้วัดความกว้างเพื่อย่อ)
  const printRef = useRef<HTMLDivElement>(null)   // ใบ A4 ขนาดจริง (นอกจอ) สำหรับแปลงเป็น PDF

  // ย่อพรีวิวให้พอดีความกว้างจอ แต่ตัวใบจริงยังเป็น A4 เต็มขนาด
  useLayoutEffect(() => {
    const box = previewRef.current
    const sheet = printRef.current
    if (!box) return
    const updateScale = () => setScale(Math.min(1, box.clientWidth / A4_W))
    updateScale()
    const ro = new ResizeObserver(updateScale)
    ro.observe(box)
    let ro2: ResizeObserver | null = null
    if (sheet) {
      setSheetH(sheet.offsetHeight || A4_H)
      ro2 = new ResizeObserver(() => setSheetH(sheet.offsetHeight || A4_H))
      ro2.observe(sheet)
    }
    return () => {
      ro.disconnect()
      ro2?.disconnect()
    }
  }, [])

  const snap = sale.receipt_snapshot
  if (!snap) return null

  const vatEnabled = !!settings?.vat_enabled
  const total = Number(snap.total) || 0
  // ยอดก่อนลด / ส่วนลดรวม (โปรโมชั่น + ส่วนลดมือ + แต้มที่ใช้) — บิลเก่าที่ไม่มีค่าให้คำนวณย้อนจากรายการ
  const itemsSum = snap.items.reduce((s, it) => s + (Number(it.subtotal) || 0), 0)
  const subtotal = Number(snap.subtotal) || itemsSum
  const discount = Number(snap.discount) || Math.max(0, subtotal - total)
  const promoLines = (snap.promos ?? []).filter(p => p.saving > 0)
  const promoSum = promoLines.reduce((s, p) => s + p.saving, 0)
  const otherDiscount = Math.max(0, discount - promoSum)
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
        width: A4_W,
        windowWidth: A4_W,
        onclone: (_doc, cloned) => {
          // ตัวจริงถูกซ่อนไว้นอกจอ — ดึงกลับมาที่ 0,0 ในสำเนาที่ใช้แคปเท่านั้น
          const wrap = cloned.parentElement
          if (wrap) {
            wrap.style.position = 'absolute'
            wrap.style.left = '0px'
            wrap.style.top = '0px'
          }
        },
      })

      // A4 210x297mm — ตัดภาพเป็นหน้าละ 297mm (ปกติ 1 หน้า, รายการยาวจะต่อหน้า 2, 3...)
      const pdf = new jsPDF('p', 'mm', 'a4')
      const pageW = pdf.internal.pageSize.getWidth()
      const pageH = pdf.internal.pageSize.getHeight()
      const pagePx = Math.floor((canvas.width * pageH) / pageW)
      const pages = Math.max(1, Math.ceil((canvas.height - 2) / pagePx))

      for (let i = 0; i < pages; i++) {
        const sliceH = Math.min(pagePx, canvas.height - i * pagePx)
        const slice = document.createElement('canvas')
        slice.width = canvas.width
        slice.height = sliceH
        const ctx = slice.getContext('2d')
        if (!ctx) throw new Error('canvas ไม่พร้อมใช้งาน')
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, slice.width, slice.height)
        ctx.drawImage(canvas, 0, i * pagePx, canvas.width, sliceH, 0, 0, canvas.width, sliceH)
        if (i > 0) pdf.addPage()
        pdf.addImage(slice.toDataURL('image/png'), 'PNG', 0, 0, pageW, (sliceH * pageW) / canvas.width)
      }

      // ดาวน์โหลดผ่านลิงก์ blob (ใช้ได้บน iPad/iPhone Safari ที่ pdf.save() บางทีเงียบ)
      const blob = pdf.output('blob')
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `invoice-${snap.receiptNo}.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 60000)
    } catch (err: any) {
      alert('สร้าง PDF ไม่สำเร็จ: ' + err.message)
    } finally {
      setDownloading(false)
    }
  }

  // ใบ A4 เต็มหน้า — ขนาดคงที่ (px) ทั้งหมด เพื่อให้หน้าตาเหมือนกันทุกอุปกรณ์
  const sheet = (
    <div
      style={{
        width: A4_W,
        minHeight: A4_H,
        boxSizing: 'border-box',
        padding: '56px 56px 64px',
        background: '#ffffff',
        color: '#000000',
        fontFamily: 'sans-serif',
        fontSize: 14,
        lineHeight: 1.5,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* หัวเอกสาร */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ maxWidth: 360 }}>
          <div style={{ fontSize: 26, fontWeight: 700 }}>{settings?.shop_name || ''}</div>
          {settings?.shop_address && (
            <div style={{ fontSize: 13, color: '#475569', marginTop: 4 }}>{settings.shop_address}</div>
          )}
          {settings?.shop_phone && (
            <div style={{ fontSize: 13, color: '#475569' }}>โทร {settings.shop_phone}</div>
          )}
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 22, fontWeight: 700 }}>ใบเสร็จรับเงิน / ใบกำกับภาษี</div>
          <div style={{ fontSize: 14, color: '#64748b', marginTop: 6 }}>เลขที่ {snap.receiptNo}</div>
          <div style={{ fontSize: 14, color: '#64748b' }}>
            วันที่ {dateText || '........................................'}
          </div>
        </div>
      </div>

      {/* กล่องลูกค้า */}
      <div
        style={{
          border: '1px solid #cbd5e1',
          borderRadius: 8,
          padding: '12px 16px',
          margin: '32px 0 28px',
        }}
      >
        <div style={{ fontSize: 12, color: '#94a3b8' }}>ลูกค้า</div>
        <div style={{ fontSize: 16, fontWeight: 700 }}>{snap.customerName || 'ลูกค้าทั่วไป'}</div>
      </div>

      {/* ตารางรายการ */}
      <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', fontSize: 14 }}>
        <colgroup>
          <col style={{ width: 44 }} />
          <col />
          <col style={{ width: 80 }} />
          <col style={{ width: 120 }} />
          <col style={{ width: 130 }} />
        </colgroup>
        <thead>
          <tr style={{ background: '#f1f5f9', color: '#475569', fontSize: 13 }}>
            <th style={{ padding: '10px 12px', textAlign: 'left' }}>#</th>
            <th style={{ padding: '10px 12px', textAlign: 'left' }}>รายการ</th>
            <th style={{ padding: '10px 12px', textAlign: 'right' }}>จำนวน</th>
            <th style={{ padding: '10px 12px', textAlign: 'right' }}>ราคา/หน่วย</th>
            <th style={{ padding: '10px 12px', textAlign: 'right' }}>จำนวนเงิน</th>
          </tr>
        </thead>
        <tbody>
          {snap.items.map((item, idx) => (
            <tr key={idx} style={{ borderBottom: '1px solid #e2e8f0' }}>
              <td style={{ padding: '10px 12px', color: '#94a3b8', verticalAlign: 'top' }}>{idx + 1}</td>
              <td style={{ padding: '10px 12px', verticalAlign: 'top', wordBreak: 'break-word' }}>{item.name}</td>
              <td style={{ padding: '10px 12px', textAlign: 'right', verticalAlign: 'top' }}>{item.qty}</td>
              <td style={{ padding: '10px 12px', textAlign: 'right', verticalAlign: 'top' }}>{item.price.toLocaleString()}</td>
              <td style={{ padding: '10px 12px', textAlign: 'right', verticalAlign: 'top' }}>{item.subtotal.toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* ชำระเงิน + ยอดรวม */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginTop: 28 }}>
        <div>
          <div style={{ fontSize: 13, color: '#64748b', marginBottom: 2 }}>ชำระโดย</div>
          <div style={{ fontSize: 15, fontWeight: 700 }}>{paymentLabel(snap.paymentMethod)}</div>
        </div>
        <div style={{ width: 320, fontSize: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
            <span style={{ color: '#64748b' }}>รวมเป็นเงิน</span>
            <span>{money(subtotal)}</span>
          </div>
          {discount > 0.004 && (
            <>
              {promoLines.map((p, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', gap: 12 }}>
                  <span style={{ color: '#64748b' }}>โปรโมชั่น: {p.name}{p.text ? ` (${p.text})` : ''}</span>
                  <span style={{ color: '#dc2626', whiteSpace: 'nowrap' }}>-{money(p.saving)}</span>
                </div>
              ))}
              {otherDiscount > 0.004 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
                  <span style={{ color: '#64748b' }}>
                    {promoLines.length > 0 ? 'ส่วนลดอื่น ๆ / แต้มสะสม' : 'ส่วนลด'}
                  </span>
                  <span style={{ color: '#dc2626' }}>-{money(otherDiscount)}</span>
                </div>
              )}
            </>
          )}
          {vatEnabled && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
                <span style={{ color: '#64748b' }}>มูลค่าสินค้า/บริการ</span>
                <span>{money(productValue)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
                <span style={{ color: '#64748b' }}>ภาษีมูลค่าเพิ่ม 7.00%</span>
                <span>{money(vatAmount)}</span>
              </div>
            </>
          )}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: 18,
              fontWeight: 700,
              borderTop: '1px solid #cbd5e1',
              paddingTop: 8,
              marginTop: 6,
            }}
          >
            <span>ยอดสุทธิ</span>
            <span>{money(total)}</span>
          </div>
        </div>
      </div>

      {vatEnabled && (
        <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 10 }}>
          ราคาดังกล่าวได้รวมภาษีมูลค่าเพิ่มแล้ว
        </div>
      )}

      {/* ดันลายเซ็นลงล่างหน้ากระดาษ */}
      <div style={{ flex: 1, minHeight: 80 }} />

      {/* ลายเซ็น */}
      <div style={{ display: 'flex', gap: 64, textAlign: 'center', fontSize: 13 }}>
        <div style={{ flex: 1 }}>
          <div style={{ borderTop: '1px solid #94a3b8', paddingTop: 8 }}>ผู้รับสินค้า / วันที่</div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ borderTop: '1px solid #94a3b8', paddingTop: 8 }}>ผู้รับเงิน</div>
        </div>
      </div>
    </div>
  )

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

        {/* พรีวิว A4 (ย่อตามความกว้างจอ) */}
        <div className="px-3 py-4 sm:p-5">
          <div
            ref={previewRef}
            style={{
              width: '100%',
              height: sheetH * scale,
              overflow: 'hidden',
              border: '1px solid #e2e8f0',
              background: '#ffffff',
            }}
          >
            <div style={{ width: A4_W, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
              {sheet}
            </div>
          </div>
        </div>

        {/* ใบ A4 ขนาดจริงซ่อนนอกจอ — ใช้แคปเป็น PDF เท่านั้น */}
        <div
          aria-hidden="true"
          style={{ position: 'fixed', left: -10000, top: 0, pointerEvents: 'none' }}
        >
          <div ref={printRef} style={{ width: A4_W }}>
            {sheet}
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
