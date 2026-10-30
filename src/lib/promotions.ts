// Promotion engine. Pure functions only (no React, no database) so the same
// rules are used by the checkout, the editor and the tests.

export type PromoScope = 'product' | 'category' | 'bill'
export type PromoType = 'percent' | 'amount' | 'bundle' | 'buy_get' | 'bill_percent' | 'bill_amount'

export interface Promotion {
  id: string
  name: string
  scope: PromoScope
  product_id: string | null
  category: string | null
  type: PromoType
  value: number | null
  buy_qty: number | null
  get_qty: number | null
  min_spend: number
  members_only: boolean
  starts_at: string | null // YYYY-MM-DD
  ends_at: string | null   // YYYY-MM-DD, inclusive
  is_active: boolean
  created_at?: string
}

export const LINE_TYPES: PromoType[] = ['percent', 'amount', 'bundle', 'buy_get']
export const BILL_TYPES: PromoType[] = ['bill_percent', 'bill_amount']

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
const fmt = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 2 })

// Today in Thailand as YYYY-MM-DD, whatever the device's timezone is.
export function todayBangkok(now: Date = new Date()): string {
  return now.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' })
}

export function isLive(p: Promotion, today: string, isMember: boolean): boolean {
  if (!p.is_active) return false
  if (p.members_only && !isMember) return false
  if (p.starts_at && p.starts_at > today) return false
  if (p.ends_at && p.ends_at < today) return false
  return true
}

// Short Thai description, used in lists, the cart and on receipts.
export function describePromo(p: Pick<Promotion, 'type' | 'value' | 'buy_qty' | 'get_qty' | 'min_spend'>): string {
  const v = Number(p.value ?? 0)
  switch (p.type) {
    case 'percent': return `ลด ${fmt(v)}%`
    case 'amount': return `ลด ฿${fmt(v)}/ชิ้น`
    case 'bundle': return `ซื้อ ${p.buy_qty} ชิ้น ราคา ฿${fmt(v)}`
    case 'buy_get': return `ซื้อ ${p.buy_qty} แถม ${p.get_qty}`
    case 'bill_percent': return `ซื้อครบ ฿${fmt(Number(p.min_spend))} ลด ${fmt(v)}%`
    case 'bill_amount': return `ซื้อครบ ฿${fmt(Number(p.min_spend))} ลด ฿${fmt(v)}`
  }
}

export type PromoInput = Pick<Promotion,
  'name' | 'scope' | 'product_id' | 'category' | 'type' | 'value' | 'buy_qty' | 'get_qty' |
  'min_spend' | 'members_only' | 'starts_at' | 'ends_at'>

// Returns a Thai error message, or null when the promo is valid.
// Mirrors the CHECK constraints in promotions_migration.sql.
export function validatePromo(p: PromoInput): string | null {
  if (!p.name || !p.name.trim()) return 'กรุณาตั้งชื่อโปรโมชั่น'
  if (p.scope === 'product' && !p.product_id) return 'ไม่ได้เลือกสินค้า'
  if (p.scope === 'category' && !p.category) return 'ไม่ได้เลือกหมวดหมู่'
  if (p.scope === 'bill' ? !BILL_TYPES.includes(p.type) : !LINE_TYPES.includes(p.type)) {
    return 'ประเภทโปรโมชั่นไม่ตรงกับขอบเขต'
  }
  const v = p.value
  const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x)
  if (p.type === 'percent' || p.type === 'bill_percent') {
    if (!isNum(v) || v <= 0 || v > 100) return 'เปอร์เซ็นต์ต้องอยู่ระหว่าง 0-100'
  }
  if (p.type === 'amount' || p.type === 'bill_amount') {
    if (!isNum(v) || v <= 0) return 'ใส่จำนวนเงินที่ลด'
  }
  if (p.type === 'bundle') {
    if (!isNum(p.buy_qty) || !Number.isInteger(p.buy_qty) || p.buy_qty < 2) return 'จำนวนชิ้นต้องตั้งแต่ 2 ขึ้นไป'
    if (!isNum(v) || v < 0) return 'ใส่ราคารวมของชุด'
  }
  if (p.type === 'buy_get') {
    if (!isNum(p.buy_qty) || !Number.isInteger(p.buy_qty) || p.buy_qty < 1) return 'จำนวนที่ต้องซื้อไม่ถูกต้อง'
    if (!isNum(p.get_qty) || !Number.isInteger(p.get_qty) || p.get_qty < 1) return 'จำนวนที่แถมไม่ถูกต้อง'
  }
  if (p.scope === 'bill' && (!isNum(p.min_spend) || p.min_spend <= 0)) return 'ใส่ยอดซื้อขั้นต่ำ'
  if (p.starts_at && p.ends_at && p.ends_at < p.starts_at) return 'วันสิ้นสุดต้องไม่ก่อนวันเริ่ม'
  return null
}

// How much one promo saves on one cart line.
export function lineSaving(p: Promotion, unitPrice: number, qty: number): number {
  const gross = unitPrice * qty
  let saving = 0
  switch (p.type) {
    case 'percent':
      saving = gross * Math.min(Math.max(Number(p.value ?? 0), 0), 100) / 100
      break
    case 'amount':
      saving = Math.min(Number(p.value ?? 0), unitPrice) * qty
      break
    case 'bundle': {
      const n = Number(p.buy_qty ?? 0)
      if (n < 2 || p.value == null) break
      const sets = Math.floor(qty / n)
      saving = sets * (n * unitPrice - Number(p.value))
      break
    }
    case 'buy_get': {
      const x = Number(p.buy_qty ?? 0)
      const y = Number(p.get_qty ?? 0)
      if (x < 1 || y < 1) break
      const sets = Math.floor(qty / (x + y))
      saving = sets * y * unitPrice
      break
    }
    default:
      break
  }
  if (!(saving > 0)) return 0
  return round2(Math.min(saving, gross))
}

export interface PromoCartItem {
  id: string
  category: string | null
  price: number
  qty: number
}

export interface LinePromoResult {
  id: string
  saving: number               // baht saved on this line (0 = no promo)
  promoId: string | null
  promoName: string | null
  promoText: string | null     // e.g. "ซื้อ 2 แถม 1"
  total: number                // line total after the promo
  unitPrice: number            // effective price per unit after the promo
}

export interface BillPromoResult {
  promoId: string
  promoName: string
  promoText: string
  saving: number
}

export interface PromoResult {
  lines: LinePromoResult[]
  lineSavings: number
  bill: BillPromoResult | null
  billSavings: number
  totalSavings: number
  subtotalAfterLines: number
}

export function applyPromotions(
  items: PromoCartItem[],
  promos: Promotion[],
  opts: { isMember: boolean; today?: string },
): PromoResult {
  const today = opts.today ?? todayBangkok()
  const live = promos.filter(p => isLive(p, today, opts.isMember))

  // One promo per cart line: whichever saves the customer the most.
  const lines: LinePromoResult[] = items.map(item => {
    let best: { p: Promotion; saving: number } | null = null
    for (const p of live) {
      const applies =
        (p.scope === 'product' && p.product_id === item.id) ||
        (p.scope === 'category' && p.category != null && p.category === item.category)
      if (!applies) continue
      const saving = lineSaving(p, item.price, item.qty)
      if (saving > 0 && (!best || saving > best.saving)) best = { p, saving }
    }
    const gross = item.price * item.qty
    const saving = best ? best.saving : 0
    const total = round2(gross - saving)
    return {
      id: item.id,
      saving,
      promoId: best ? best.p.id : null,
      promoName: best ? best.p.name : null,
      promoText: best ? describePromo(best.p) : null,
      total,
      unitPrice: item.qty > 0 ? total / item.qty : item.price,
    }
  })

  const lineSavings = round2(lines.reduce((s, l) => s + l.saving, 0))
  const gross = items.reduce((s, i) => s + i.price * i.qty, 0)
  const subtotalAfterLines = round2(gross - lineSavings)

  // Bill-level promo works on what's left after the line promos.
  let bill: BillPromoResult | null = null
  for (const p of live) {
    if (p.scope !== 'bill') continue
    if (subtotalAfterLines < Number(p.min_spend ?? 0)) continue
    const v = Number(p.value ?? 0)
    let saving = 0
    if (p.type === 'bill_percent') saving = round2(subtotalAfterLines * Math.min(Math.max(v, 0), 100) / 100)
    else if (p.type === 'bill_amount') saving = round2(Math.min(v, subtotalAfterLines))
    if (saving > 0 && (!bill || saving > bill.saving)) {
      bill = { promoId: p.id, promoName: p.name, promoText: describePromo(p), saving }
    }
  }
  const billSavings = bill ? bill.saving : 0

  return {
    lines,
    lineSavings,
    bill,
    billSavings,
    totalSavings: round2(lineSavings + billSavings),
    subtotalAfterLines,
  }
}