"use client"
import { ReceiptDetail, Settings } from '@/src/types'

interface ReceiptProps {
  detail: ReceiptDetail | null;
  settings: Settings | null;
}

export default function Receipt({ detail, settings }: ReceiptProps) {
  if (!detail) return null;

  // Helper to safely format numbers
  const formatNum = (val: any) => {
    const n = Number(val);
    return isNaN(n) ? '0' : n.toLocaleString();
  };

  return (
    <div className="receipt-container pos-receipt text-black text-[11px] font-mono w-full px-[3mm] pt-[3mm] pb-[5mm] bg-white mx-auto" style={{ width: '48mm' }}>
      <div className="text-center mb-4">
        <h2 className="text-sm font-bold uppercase">{settings?.shop_name || 'บุญชอบเครื่องครัว'}</h2>
        <p className="text-[9px]">{settings?.shop_address || '-'}</p>
        <p className="text-[9px]">โทร : {settings?.shop_phone || '-'}</p>
      </div>

      <div className="border-b border-dashed mb-2 pb-2">
        <p>เลขที่: {detail.receiptNo || '-'}</p>
        <p>วันที่: {detail.date || '-'}</p>
      </div>

      <div className="mb-2">
        {detail.items?.map((item, index) => (
          <div key={index} className="mb-2 text-[11px] uppercase border-b border-gray-50 pb-1">
            <div className="font-bold text-gray-800 mb-0.5">
              {item.name}
            </div>
            <div className="flex justify-between items-end text-gray-600">
              <div className="pl-2 italic">
                {formatNum(item.price)} x {item.qty}
              </div>
              <div className="font-bold text-black">
                {formatNum(item.price * item.qty)}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="border-t border-dashed pt-2 space-y-1">
        <div className="flex justify-between">
          <span>ยอดรวม:</span>
          <span>{formatNum(detail.subtotal)}</span>
        </div>

        {(Number(detail.discount) > 0) && (
          <div className="flex justify-between text-black font-bold">
            <span>ส่วนลด:</span>
            <span>-{formatNum(detail.discount)}</span>
          </div>
        )}

        <div className="flex justify-between font-bold text-sm border-t border-black pt-1">
          <span>สุทธิ:</span>
          <span>฿{formatNum(detail.total)}</span>
        </div>

        <div className="flex justify-between pt-1">
          <span>รับเงิน ({detail.paymentMethod || '-'}):</span>
          <span>{formatNum(detail.received)}</span>
        </div>

        {detail.paymentMethod === 'เงินสด' && (
          <div className="flex justify-between font-bold">
            <span>เงินทอน:</span>
            <span>{formatNum(detail.change)}</span>
          </div>
        )}
      </div>

      <div className="text-center mt-6 text-[9px] border-t border-dashed pt-4">
        <p>ชำระด้วย: {detail.paymentMethod || '-'}</p>
        <p className="mt-2">*** ขอบคุณที่ใช้บริการ ***</p>
      </div>
    </div>
  )
}
