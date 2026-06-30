"use client"
import { useState, useEffect } from 'react'
import { supabase } from '@/src/lib/supabase'
import { TrendingUp, Printer, Eye, X } from 'lucide-react'
import { Sale, ReceiptDetail, Settings } from '@/src/types'

export default function SalesPage() {
  const [sales, setSales] = useState<Sale[]>([])
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0])
  const [searchTerm, setSearchTerm] = useState('')
  const [settings, setSettings] = useState<Settings | null>(null)
  const [printingId, setPrintingId] = useState<string | null>(null)
  const [realProfit, setRealProfit] = useState(0)
  const [previewSale, setPreviewSale] = useState<Sale | null>(null)

  const PRINT_SERVER = process.env.NEXT_PUBLIC_PRINT_SERVER_URL

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

    // Real profit: pull each line item for these sales plus the
    // current cost_price of each product, instead of guessing a flat
    // margin. This matches how /reports and /taxReports calculate it.
    if (data && data.length > 0) {
      const saleIds = data.map(s => s.id)
      const { data: items } = await supabase
        .from('sale_items')
        .select('quantity, price_at_sale, product_id')
        .in('sale_id', saleIds)

      const productIds = Array.from(new Set((items || []).map(i => i.product_id)))
      const { data: products } = await supabase
        .from('products')
        .select('id, cost_price')
        .in('id', productIds)

      const costMap: Record<string, number> = (products || []).reduce(
        (acc: Record<string, number>, p: { id: string; cost_price: number }) => {
          acc[p.id] = Number(p.cost_price) || 0
          return acc
        }, {})

      const profit = (items || []).reduce((sum: number, item: { quantity: number; price_at_sale: number; product_id: string }) => {
        const cost = costMap[item.product_id] || 0
        const sellPrice = Number(item.price_at_sale) || 0
        return sum + (sellPrice - cost) * (Number(item.quantity) || 0)
      }, 0)

      setRealProfit(profit)
    } else {
      setRealProfit(0)
    }
  }

  const handlePrint = async (sale: Sale) => {
    if (!sale.receipt_snapshot) {
      alert('บิลนี้ไม่มีข้อมูล Snapshot ย้อนหลัง')
      return
    }

    setPrintingId(sale.id)

    const payload = {
      ...sale.receipt_snapshot,
      shopName:    settings?.shop_name    || '',
      shopAddress: settings?.shop_address || '',
      shopPhone:   settings?.shop_phone   || '',
    }

    try {
      if (PRINT_SERVER) {
        const res = await fetch(`${PRINT_SERVER}/print`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        })
        const result = await res.json()
        if (!result.ok) throw new Error(result.error)
      } else {
        // Fallback: browser print
        window.print()
      }
    } catch (err: any) {
      console.error('Print failed:', err)
      alert('พิมพ์ไม่สำเร็จ: ' + err.message)
    } finally {
      setPrintingId(null)
    }
  }

  const dailyTotal = sales.reduce((sum, s) => sum + Number(s.total_amount), 0)

  const paymentLabel = (method: string) => {
    if (method === 'cash') return 'เงินสด'
    if (method === 'transfer') return 'โอนเงิน'
    if (method === 'promptpay') return 'พร้อมเพย์'
    return method
  }

  return (
    <div className="p-4 md:p-8 bg-slate-50 min-h-screen">
      <h1 className="text-3xl font-bold mb-6 flex items-center gap-2">
        <TrendingUp className="font-black text-green-600" /> สรุปยอดขาย
      </h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <div className="bg-white p-6 rounded-3xl shadow-sm border-l-8 border-blue-500">
          <p className="text-slate-500 text-sm">ยอดขายประจำวัน</p>
          <p className="text-4xl font-black text-blue-500">฿{dailyTotal.toLocaleString()}</p>
        </div>
        <div className="bg-white p-6 rounded-3xl shadow-sm border-l-8 border-green-500">
          <p className="text-slate-500 text-sm">กำไรสุทธิ</p>
          <p className="text-4xl font-black text-green-600">฿{realProfit.toLocaleString()}</p>
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-4 mb-6">
        <input
          type="text"
          placeholder="ค้นหาเลขใบเสร็จ..."
          className="flex-1 p-4 rounded-2xl border-none shadow-sm text-black"
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        <input
          type="date"
          className="p-4 rounded-2xl shadow-sm font-bold"
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
              <th className="p-5 text-center">ดูใบเสร็จ</th>
              <th className="p-5 text-center">พิมพ์</th>
            </tr>
          </thead>
          <tbody>
            {sales
              .filter(s => s.receipt_no.toString().includes(searchTerm))
              .map((sale) => (
                <tr key={sale.id} className="border-b hover:bg-slate-50">
                  <td className="p-5 font-bold text black-80">{sale.receipt_no}</td>
                  <td className="p-5 text-right font-bold text-xl text-blue-600">
                    ฿{sale.total_amount.toLocaleString()}
                  </td>
                  <td className="p-5 text-center">
                    <button
                      onClick={() => setPreviewSale(sale)}
                      className="p-3 bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-100 transition-all"
                      title="ดูใบเสร็จ"
                    >
                      <Eye size={20} />
                    </button>
                  </td>
                  <td className="p-5 text-center">
                    <button
                      onClick={() => handlePrint(sale)}
                      disabled={printingId === sale.id}
                      className="p-3 bg-green-50 text-green-600 rounded-xl hover:bg-green-100 transition-all disabled:opacity-40"
                      title="พิมพ์ใบเสร็จ"
                    >
                      {printingId === sale.id
                        ? <span className="text-xs font-bold">...</span>
                        : <Printer size={20} />
                      }
                    </button>
                  </td>
                </tr>
              ))}
            {sales.length === 0 && (
              <tr>
                <td colSpan={3} className="p-10 text-center text-slate-400 font-bold">
                  ไม่มีรายการขายในวันนี้
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {previewSale && previewSale.receipt_snapshot && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => setPreviewSale(null)}
        >
          <div
            className="bg-white rounded-3xl shadow-xl w-full max-w-sm max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-5 border-b">
              <h2 className="text-lg font-bold">ใบเสร็จ #{previewSale.receipt_snapshot.receiptNo}</h2>
              <button
                onClick={() => setPreviewSale(null)}
                className="p-2 rounded-xl hover:bg-slate-100 text-slate-500"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-5 font-mono text-sm text-slate-700">
              <div className="text-center mb-3">
                <p className="font-bold text-black">{settings?.shop_name}</p>
                {settings?.shop_address && <p className="text-xs">{settings.shop_address}</p>}
                {settings?.shop_phone && <p className="text-xs">โทร {settings.shop_phone}</p>}
              </div>

              <div className="flex justify-between text-xs text-slate-500 mb-3">
                <span>{previewSale.receipt_snapshot.date}</span>
                <span>#{previewSale.receipt_snapshot.receiptNo}</span>
              </div>

              <div className="border-t border-dashed border-slate-300 my-2" />

              {previewSale.receipt_snapshot.items.map((item, idx) => (
                <div key={idx} className="flex justify-between mb-1">
                  <span className="flex-1">
                    {item.name} x{item.qty}
                  </span>
                  <span>฿{item.subtotal.toLocaleString()}</span>
                </div>
              ))}

              <div className="border-t border-dashed border-slate-300 my-2" />

              <div className="flex justify-between">
                <span>ยอดรวม</span>
                <span>฿{previewSale.receipt_snapshot.subtotal.toLocaleString()}</span>
              </div>
              {previewSale.receipt_snapshot.discount > 0 && (
                <div className="flex justify-between">
                  <span>ส่วนลด</span>
                  <span>-฿{previewSale.receipt_snapshot.discount.toLocaleString()}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-black text-base mt-1">
                <span>ยอดสุทธิ</span>
                <span>฿{previewSale.receipt_snapshot.total.toLocaleString()}</span>
              </div>

              <div className="border-t border-dashed border-slate-300 my-2" />

              <div className="flex justify-between">
                <span>ชำระโดย</span>
                <span>{paymentLabel(previewSale.receipt_snapshot.paymentMethod)}</span>
              </div>
              <div className="flex justify-between">
                <span>รับเงิน</span>
                <span>฿{previewSale.receipt_snapshot.received.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span>เงินทอน</span>
                <span>฿{previewSale.receipt_snapshot.change.toLocaleString()}</span>
              </div>

              {previewSale.receipt_snapshot.customerName && (
                <>
                  <div className="border-t border-dashed border-slate-300 my-2" />
                  <div className="flex justify-between">
                    <span>สมาชิก</span>
                    <span>{previewSale.receipt_snapshot.customerName}</span>
                  </div>
                  {previewSale.receipt_snapshot.customerPhoneMasked && (
                    <div className="flex justify-between">
                      <span>เบอร์</span>
                      <span>{previewSale.receipt_snapshot.customerPhoneMasked}</span>
                    </div>
                  )}
                  {!!previewSale.receipt_snapshot.pointsEarned && (
                    <div className="flex justify-between">
                      <span>แต้มที่ได้รับ</span>
                      <span>+{previewSale.receipt_snapshot.pointsEarned}</span>
                    </div>
                  )}
                  {!!previewSale.receipt_snapshot.pointsRedeemed && (
                    <div className="flex justify-between">
                      <span>แต้มที่ใช้</span>
                      <span>-{previewSale.receipt_snapshot.pointsRedeemed}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-bold">
                    <span>แต้มคงเหลือ</span>
                    <span>{previewSale.receipt_snapshot.pointsBalance}</span>
                  </div>
                </>
              )}
            </div>

            <div className="p-5 border-t flex gap-3">
              <button
                onClick={() => setPreviewSale(null)}
                className="flex-1 py-3 rounded-2xl bg-slate-100 text-slate-600 font-bold hover:bg-slate-200"
              >
                ปิด
              </button>
              <button
                onClick={() => handlePrint(previewSale)}
                disabled={printingId === previewSale.id}
                className="flex-1 py-3 rounded-2xl bg-green-500 text-white font-bold hover:bg-green-600 disabled:opacity-40 flex items-center justify-center gap-2"
              >
                <Printer size={18} />
                {printingId === previewSale.id ? 'กำลังพิมพ์...' : 'พิมพ์ใบเสร็จ'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
