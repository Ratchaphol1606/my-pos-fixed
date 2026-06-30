import { NextRequest, NextResponse } from 'next/server'

// PINs live ONLY in server env (no NEXT_PUBLIC_ prefix) so they never
// ship to the browser bundle. Set both in .env.local and in Vercel's
// Environment Variables — never commit them.
//   POS_PIN_ADMIN    — full access (settings, reports, tax, sales history, member edits)
//   POS_PIN_CASHIER  — checkout + products only
const ADMIN_PIN   = process.env.POS_PIN_ADMIN
const CASHIER_PIN = process.env.POS_PIN_CASHIER

type Role = 'admin' | 'cashier'

export async function GET(req: NextRequest) {
  const role = req.cookies.get('pos_role')?.value
  if (role === 'admin' || role === 'cashier') {
    return NextResponse.json({ ok: true, role })
  }
  return NextResponse.json({ ok: false }, { status: 401 })
}

export async function POST(req: NextRequest) {
  if (!ADMIN_PIN || !CASHIER_PIN) {
    // Fail closed: if either env var isn't set, refuse instead of letting
    // everyone in by accident.
    return NextResponse.json({ ok: false, error: 'POS_PIN_ADMIN / POS_PIN_CASHIER ยังไม่ถูกตั้งค่าบนเซิร์ฟเวอร์' }, { status: 500 })
  }

  const { pin } = await req.json().catch(() => ({ pin: '' }))

  let role: Role | null = null
  if (typeof pin === 'string') {
    if (pin === ADMIN_PIN) role = 'admin'
    else if (pin === CASHIER_PIN) role = 'cashier'
  }

  if (!role) {
    return NextResponse.json({ ok: false, error: 'รหัสไม่ถูกต้อง' }, { status: 401 })
  }

  const res = NextResponse.json({ ok: true, role })
  // httpOnly: JS on the page can't read this, so it can't be exfiltrated
  // the way sessionStorage could be. 12 hour session.
  res.cookies.set('pos_role', role, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 12,
  })
  return res
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true })
  res.cookies.set('pos_role', '', { path: '/', maxAge: 0 })
  return res
}