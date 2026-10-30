import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Refunds go through the server so only an admin PIN session can make one.
// process_refund is granted to the service role only (see returns_migration.sql),
// so the browser's anon key can't call it directly.

export async function POST(req: NextRequest) {
  if (req.cookies.get('pos_role')?.value !== 'admin') {
    return NextResponse.json({ ok: false, error: 'ต้องใช้รหัสผู้ดูแล (Admin) เพื่อคืนสินค้า' }, { status: 403 })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    return NextResponse.json({ ok: false, error: 'เซิร์ฟเวอร์ยังไม่ได้ตั้งค่า SUPABASE_SERVICE_ROLE_KEY' }, { status: 500 })
  }

  const body = await req.json().catch(() => null)
  const saleId = body?.sale_id
  const method = body?.method
  const reason = typeof body?.reason === 'string' ? body.reason.slice(0, 200) : null
  const items: unknown = body?.items

  const validItems =
    Array.isArray(items) &&
    items.length > 0 &&
    items.every(
      (i: { product_id?: unknown; quantity?: unknown } | null) =>
        !!i && typeof i.product_id === 'string' && Number.isInteger(i.quantity) && (i.quantity as number) > 0,
    )

  if (typeof saleId !== 'string' || (method !== 'cash' && method !== 'transfer') || !validItems) {
    return NextResponse.json({ ok: false, error: 'ข้อมูลการคืนสินค้าไม่ถูกต้อง' }, { status: 400 })
  }

  const supabase = createClient(url, key)
  const { data, error } = await supabase.rpc('process_refund', {
    p_sale_id: saleId,
    p_items: (items as { product_id: string; quantity: number }[]).map(i => ({
      product_id: i.product_id,
      quantity: i.quantity,
    })),
    p_method: method,
    p_reason: reason,
  })

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 })
  }
  return NextResponse.json({ ok: true, result: data })
}