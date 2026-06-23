import { NextRequest, NextResponse } from 'next/server'

// PIN lives ONLY in server env (POS_PIN, no NEXT_PUBLIC_ prefix) so it
// never ships to the browser bundle. Set it in .env.local and in Vercel's
// Environment Variables — never commit it.
const CORRECT_PIN = process.env.POS_PIN

export async function GET(req: NextRequest) {
  const session = req.cookies.get('pos_session')?.value
  if (session === 'unlocked') {
    return NextResponse.json({ ok: true })
  }
  return NextResponse.json({ ok: false }, { status: 401 })
}

export async function POST(req: NextRequest) {
  if (!CORRECT_PIN) {
    // Fail closed: if the env var isn't set, refuse instead of letting
    // everyone in by accident.
    return NextResponse.json({ ok: false, error: 'POS_PIN ยังไม่ถูกตั้งค่าบนเซิร์ฟเวอร์' }, { status: 500 })
  }

  const { pin } = await req.json().catch(() => ({ pin: '' }))

  if (typeof pin !== 'string' || pin !== CORRECT_PIN) {
    return NextResponse.json({ ok: false, error: 'รหัสไม่ถูกต้อง' }, { status: 401 })
  }

  const res = NextResponse.json({ ok: true })
  // httpOnly: JS on the page can't read this, so it can't be exfiltrated
  // the way sessionStorage could be. 12 hour session.
  res.cookies.set('pos_session', 'unlocked', {
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
  res.cookies.set('pos_session', '', { path: '/', maxAge: 0 })
  return res
}
