// Wholesale price tiers. Pure functions only (no React, no database), same
// idea as promotions.ts: the checkout, the editor and the API all share these.

export interface PriceTier {
  id?: string
  product_id?: string
  min_qty: number
  unit_price: number
}

// Shown in the cart, on receipts and in reports for any line sold at a tier price.
export const WHOLESALE_NAME = 'ราคาส่ง'

const fmt = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 2 })

export function describeTier(t: Pick<PriceTier, 'min_qty' | 'unit_price'>): string {
  return `${t.min_qty}+ ชิ้น ฿${fmt(Number(t.unit_price))}/ชิ้น`
}

export function groupTiers(rows: PriceTier[]): Map<string, PriceTier[]> {
  const map = new Map<string, PriceTier[]>()
  for (const r of rows) {
    if (!r.product_id) continue
    const list = map.get(r.product_id) ?? []
    list.push({ ...r, min_qty: Number(r.min_qty), unit_price: Number(r.unit_price) })
    map.set(r.product_id, list)
  }
  for (const list of map.values()) list.sort((a, b) => a.min_qty - b.min_qty)
  return map
}

// The best tier this quantity qualifies for (highest min_qty that is <= qty).
export function resolveTier(tiers: PriceTier[] | undefined, qty: number): PriceTier | null {
  if (!tiers || tiers.length === 0) return null
  let best: PriceTier | null = null
  for (const t of tiers) {
    if (qty >= t.min_qty && (!best || t.min_qty > best.min_qty)) best = t
  }
  return best
}

// The next tier up, used for the "add N more" hint in the cart.
export function nextTier(tiers: PriceTier[] | undefined, qty: number): PriceTier | null {
  if (!tiers || tiers.length === 0) return null
  let next: PriceTier | null = null
  for (const t of tiers) {
    if (t.min_qty > qty && (!next || t.min_qty < next.min_qty)) next = t
  }
  return next
}

// Returns a Thai error message, or null when the tiers are valid.
// Rules: whole-number quantities >= 2, no duplicates, every tier cheaper than
// retail, and a bigger quantity must always mean a lower price.
export function validateTiers(tiers: PriceTier[], retailPrice: number): string | null {
  const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x)
  for (const t of tiers) {
    if (!isNum(t.min_qty) || !Number.isInteger(t.min_qty) || t.min_qty < 2) return 'จำนวนขั้นต่ำต้องเป็นจำนวนเต็มตั้งแต่ 2 ขึ้นไป'
    if (!isNum(t.unit_price) || t.unit_price < 0) return 'ใส่ราคาต่อชิ้นให้ถูกต้อง'
    if (t.unit_price >= retailPrice) return `ราคาส่งต้องต่ำกว่าราคาขายปกติ (฿${fmt(retailPrice)})`
  }
  const sorted = [...tiers].sort((a, b) => a.min_qty - b.min_qty)
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].min_qty === sorted[i - 1].min_qty) return 'มีจำนวนขั้นต่ำซ้ำกัน'
    if (sorted[i].unit_price >= sorted[i - 1].unit_price) return 'ซื้อมากขึ้นต้องได้ราคาต่อชิ้นถูกลง'
  }
  return null
}

// Tiers priced below cost. A warning, not an error: the owner may do it on purpose.
export function tiersBelowCost(tiers: PriceTier[], costPrice: number): PriceTier[] {
  return costPrice > 0 ? tiers.filter(t => t.unit_price < costPrice) : []
}
