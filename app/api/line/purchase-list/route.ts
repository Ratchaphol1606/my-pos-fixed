import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/src/lib/serverAuth'
import { pushLineMessage } from '@/src/lib/line'

// Sends the "things to buy" list to the owner's LINE (same account as the
// daily closing report). Any logged-in staff may send it. The message text is
// built here from validated rows, not taken from the client, so this route
// cannot be used to push arbitrary text to LINE.

const MAX_ITEMS = 100
const LINE_TEXT_LIMIT = 4500 // LINE allows 5000 chars per text message

const baht = (n: number) =>
  n.toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 2 })

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req)
  if (!auth.ok) return auth.res

  const body = await req.json().catch(() => null)
  if (!Array.isArray(body?.items) || body.items.length === 0 || body.items.length > MAX_ITEMS) {
    return NextResponse.json({ ok: false, error: 'ข้อมูลไม่ถูกต้อง' }, { status: 400 })
  }

  const rows: { name: string; qty: number; cost: number }[] = []
  for (const raw of body.items as { name?: unknown; qty?: unknown; cost?: unknown }[]) {
    const name = typeof raw?.name === 'string' ? raw.name.trim().slice(0, 120) : ''
    const qty = Math.floor(Number(raw?.qty))
    const cost = Number(raw?.cost)
    if (!name || !Number.isFinite(qty) || qty < 1 || qty > 100000 || !Number.isFinite(cost) || cost < 0) {
      return NextResponse.json({ ok: false, error: 'ข้อมูลไม่ถูกต้อง' }, { status: 400 })
    }
    rows.push({ name, qty, cost })
  }

  const date = new Date().toLocaleDateString('th-TH', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Bangkok',
  })
  const total = rows.reduce((s, r) => s + r.cost * r.qty, 0)
  const totalQty = rows.reduce((s, r) => s + r.qty, 0)

  const lines = rows.map((r, i) => `${i + 1}. ${r.name} x${r.qty} = ฿${baht(r.cost * r.qty)}`)
  const header = `🛒 ของที่ต้องซื้อ (${date})`
  const footer = `รวมประมาณ ฿${baht(total)} (${rows.length} รายการ · ${totalQty} ชิ้น)`

  // Pack lines into messages under the LINE limit (the total goes last).
  const messages: string[] = []
  let current = header
  for (const line of lines) {
    if (current.length + line.length + 1 > LINE_TEXT_LIMIT) {
      messages.push(current)
      current = line
    } else {
      current += '\n' + line
    }
  }
  current += '\n' + footer
  messages.push(current)

  try {
    for (const m of messages) await pushLineMessage(m)
  } catch (e) {
    console.error('purchase-list LINE push failed', e)
    return NextResponse.json({ ok: false, error: 'ส่งเข้าไลน์ไม่สำเร็จ' }, { status: 502 })
  }
  return NextResponse.json({ ok: true })
}
