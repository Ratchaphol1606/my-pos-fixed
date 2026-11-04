import { NextRequest, NextResponse } from 'next/server'
import { validateTiers, type PriceTier } from '@/src/lib/priceTiers'
import { requireAuth } from '@/src/lib/serverAuth'
import { logAudit } from '@/src/lib/audit'

// Wholesale tiers are read by the checkout with the normal browser key, but
// only a logged-in admin who has unlocked with their PIN may change them.
// Writes use the service role (the table has no write policy for the browser key).

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req, { admin: true, unlock: true })
  if (!auth.ok) return auth.res
  const supabase = auth.admin
  const actor = { id: auth.user.id, username: auth.user.username, role: auth.user.role }

  const body = await req.json().catch(() => null)
  const productId = typeof body?.product_id === 'string' ? body.product_id : null
  if (body?.action !== 'save' || !productId || !Array.isArray(body?.tiers)) {
    return NextResponse.json({ ok: false, error: 'ข้อมูลไม่ถูกต้อง' }, { status: 400 })
  }
  if (body.tiers.length > 10) {
    return NextResponse.json({ ok: false, error: 'ตั้งราคาส่งได้ไม่เกิน 10 ขั้น' }, { status: 400 })
  }

  // Only the two known fields are copied from each row.
  const tiers: PriceTier[] = body.tiers.map((t: { min_qty?: unknown; unit_price?: unknown }) => ({
    min_qty: Number(t?.min_qty),
    unit_price: Math.round(Number(t?.unit_price) * 100) / 100,
  }))

  const { data: product } = await supabase
    .from('products').select('id, name, retail_price').eq('id', productId).maybeSingle()
  if (!product) return NextResponse.json({ ok: false, error: 'ไม่พบสินค้า' }, { status: 404 })

  const problem = validateTiers(tiers, Number(product.retail_price))
  if (problem) return NextResponse.json({ ok: false, error: problem }, { status: 400 })

  const { data: before } = await supabase
    .from('product_price_tiers').select('min_qty, unit_price').eq('product_id', productId).order('min_qty')

  // Upsert the new set first, then drop the rows that are no longer wanted, so
  // a failure half way leaves extra tiers behind rather than losing them all.
  if (tiers.length > 0) {
    const rows = tiers.map(t => ({ product_id: productId, min_qty: t.min_qty, unit_price: t.unit_price }))
    const { error } = await supabase.from('product_price_tiers').upsert(rows, { onConflict: 'product_id,min_qty' })
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 })
  }
  let cleanup = supabase.from('product_price_tiers').delete().eq('product_id', productId)
  if (tiers.length > 0) cleanup = cleanup.not('min_qty', 'in', `(${tiers.map(t => t.min_qty).join(',')})`)
  const { error: delError } = await cleanup
  if (delError) return NextResponse.json({ ok: false, error: delError.message }, { status: 400 })

  await logAudit(supabase, actor, {
    action: 'price_tiers.save', entity: 'product_price_tiers', entityId: productId,
    summary: `ตั้งราคาส่ง ${product.name} (${tiers.length} ขั้น)`,
    oldData: { tiers: before ?? [] }, newData: { tiers },
  })
  return NextResponse.json({ ok: true })
}
