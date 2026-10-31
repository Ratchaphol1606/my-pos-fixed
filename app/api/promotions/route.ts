import { NextRequest, NextResponse } from 'next/server'
import { validatePromo, type PromoInput } from '@/src/lib/promotions'
import { requireAuth } from '@/src/lib/serverAuth'
import { logAudit } from '@/src/lib/audit'

// Promotions are read by the checkout with the normal browser key, but only a
// logged-in admin who has unlocked with their PIN may create, change or delete
// them. Writes use the service role (the table has no write policy for the
// browser key).

const num = (v: unknown): number | null =>
  v === null || v === undefined || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)
const day = (v: unknown): string | null => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null)

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req, { admin: true, unlock: true })
  if (!auth.ok) return auth.res
  const supabase = auth.admin
  const actor = { id: auth.user.id, username: auth.user.username, role: auth.user.role }
  // The row as it was before this request (null for a brand-new promotion).
  const snapshot = async (promoId: string) =>
    (await supabase.from('promotions').select('*').eq('id', promoId).maybeSingle()).data ?? null

  const body = await req.json().catch(() => null)
  const action = body?.action
  const id = typeof body?.id === 'string' ? body.id : null

  if (action === 'delete') {
    if (!id) return NextResponse.json({ ok: false, error: 'ไม่พบรหัสโปรโมชั่น' }, { status: 400 })
    const before = await snapshot(id)
    const { error } = await supabase.from('promotions').delete().eq('id', id)
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 })
    await logAudit(supabase, actor, {
      action: 'promotion.delete', entity: 'promotions', entityId: id,
      summary: `ลบโปรโมชั่น ${before?.name ?? ''}`.trim(), oldData: before,
    })
    return NextResponse.json({ ok: true })
  }

  if (action === 'toggle') {
    if (!id || typeof body?.is_active !== 'boolean') {
      return NextResponse.json({ ok: false, error: 'ข้อมูลไม่ถูกต้อง' }, { status: 400 })
    }
    const before = await snapshot(id)
    const { error } = await supabase.from('promotions').update({ is_active: body.is_active }).eq('id', id)
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 })
    await logAudit(supabase, actor, {
      action: 'promotion.toggle', entity: 'promotions', entityId: id,
      summary: `${body.is_active ? 'เปิด' : 'ปิด'}โปรโมชั่น ${before?.name ?? ''}`.trim(),
      oldData: { is_active: before?.is_active ?? null }, newData: { is_active: body.is_active },
    })
    return NextResponse.json({ ok: true })
  }

  if (action === 'save') {
    const p = body?.promo ?? {}
    // Only known fields are copied, so nothing else can be written through here.
    const input: PromoInput = {
      name: str(p.name) ?? '',
      scope: p.scope,
      product_id: p.scope === 'product' ? str(p.product_id) : null,
      category: p.scope === 'category' ? str(p.category) : null,
      type: p.type,
      value: num(p.value),
      buy_qty: num(p.buy_qty),
      get_qty: num(p.get_qty),
      min_spend: p.scope === 'bill' ? (num(p.min_spend) ?? 0) : 0,
      members_only: p.members_only === true,
      starts_at: day(p.starts_at),
      ends_at: day(p.ends_at),
    }
    // Fields that don't belong to the chosen type are cleared.
    if (input.type !== 'bundle' && input.type !== 'buy_get') input.buy_qty = null
    if (input.type !== 'buy_get') input.get_qty = null
    if (input.type === 'buy_get') input.value = null

    const problem = validatePromo(input)
    if (problem) return NextResponse.json({ ok: false, error: problem }, { status: 400 })

    const row = { ...input, name: input.name.slice(0, 80) }
    const before = id ? await snapshot(id) : null
    const { error } = id
      ? await supabase.from('promotions').update(row).eq('id', id)
      : await supabase.from('promotions').insert({ ...row, is_active: true })
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 })
    await logAudit(supabase, actor, {
      action: id ? 'promotion.update' : 'promotion.create', entity: 'promotions', entityId: id,
      summary: `${id ? 'แก้ไข' : 'สร้าง'}โปรโมชั่น ${row.name}`,
      oldData: before, newData: row,
    })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ ok: false, error: 'คำสั่งไม่ถูกต้อง' }, { status: 400 })
}