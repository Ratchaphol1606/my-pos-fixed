import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/src/lib/serverAuth'
import { logAudit } from '@/src/lib/audit'

// Refunds go through the server so only a logged-in admin who has unlocked with
// their PIN can make one. process_refund is granted to the service role only
// (see returns_migration.sql), so the browser's key can't call it directly.

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req, { admin: true, unlock: true })
  if (!auth.ok) return auth.res

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

  const { data, error } = await auth.admin.rpc('process_refund', {
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
  await logAudit(auth.admin, { id: auth.user.id, username: auth.user.username, role: auth.user.role }, {
    action: 'refund.create',
    entity: 'sales',
    entityId: saleId,
    summary: `คืนสินค้า (${method === 'cash' ? 'เงินสด' : 'โอน'})${reason ? ` — ${reason}` : ''}`,
    newData: { method, reason, items, result: data },
  })
  return NextResponse.json({ ok: true, result: data })
}
