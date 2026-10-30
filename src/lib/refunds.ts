import type { SupabaseClient } from '@supabase/supabase-js'
import type { Refund } from '@/src/types'

// Refunds as negative "sales", so the report pages can simply add them to
// the sales they already loop over: revenue goes down by the money refunded,
// and profit goes down by the gross margin of the items that came back
// (the same way profit was added when they were sold).
// Rows carry `_refund: true` so count-based figures (bill count, peak hours,
// slow movers) can skip them.
export function refundsToSales(refunds: Refund[]) {
  return refunds.map(r => ({
    id: `refund-${r.id}`,
    receipt_no: r.refund_no,
    total_amount: -Number(r.refund_amount),
    discount_amount: 0,
    payment_method: r.payment_method,
    created_at: r.created_at,
    sale_items: (r.refund_items ?? []).map(i => ({
      product_id: i.product_id,
      quantity: -Number(i.quantity),
      price_at_sale: Number(i.price_at_sale),
    })),
    _refund: true,
  }))
}

// Refunds made between two timestamps (by refund date, not by the date of the
// original sale, so closed days never change retroactively).
export async function fetchRefunds(
  sb: SupabaseClient,
  fromISO: string,
  toISO?: string,
): Promise<Refund[]> {
  let q = sb
    .from('refunds')
    .select('id, refund_no, sale_id, customer_id, refund_amount, payment_method, reason, points_taken_back, points_restored, created_at, refund_items(product_id, quantity, price_at_sale, net_amount)')
    .gte('created_at', fromISO)
    .order('created_at', { ascending: true })
  if (toISO) q = q.lte('created_at', toISO)
  const { data, error } = await q
  if (error) throw error
  return (data ?? []) as unknown as Refund[]
}
