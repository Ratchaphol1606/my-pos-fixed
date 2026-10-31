import { NextRequest, NextResponse } from 'next/server'
import { SESSION_COOKIE, nextCutoff, sessionCookieOptions, signClaims } from '@/src/lib/session'
import { adminClient, bearerToken, fail, loadProfile, requireAuth } from '@/src/lib/serverAuth'

// The browser signs in with Supabase directly (username -> hidden email + password).
// These routes turn that into a POS session:
//   POST    right after a password login: issues the signed pos_session cookie and an
//           unlock token (typing the password counts as unlocking), and re-enables a
//           PIN that was locked by too many wrong guesses.
//   GET     page load: is this browser still logged in? (used to show the PIN screen)
//   DELETE  logout.

const FRESH_LOGIN_MS = 2 * 60 * 1000

// POST must only follow a real password login, otherwise anyone at an unlocked-looking
// screen could call it to reset the PIN attempt counter. Supabase stamps the password
// login time into the token's `amr` claim and keeps it across refreshes.
function isFreshPasswordLogin(jwt: string): boolean {
  try {
    const payload = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString('utf8'))
    const now = Date.now()
    const isFresh = (sec: unknown) => typeof sec === 'number' && now - sec * 1000 < FRESH_LOGIN_MS
    if (Array.isArray(payload.amr)) {
      const stamps: unknown[] = payload.amr
        .filter((a: { method?: string }) => a?.method === 'password')
        .map((a: { timestamp?: unknown }) => a.timestamp)
      // The password-login time survives token refreshes, so when it is there it decides.
      if (stamps.some((s) => typeof s === 'number')) return stamps.some(isFresh)
    }
    // No usable amr timestamp (older Supabase, odd token): fall back to when this
    // token was issued, so a missing claim can never lock everybody out.
    return isFresh(payload.iat)
  } catch {
    return false
  }
}

export async function POST(req: NextRequest) {
  const admin = adminClient()
  if (!admin) return fail(500, 'server_config', 'เซิร์ฟเวอร์ยังไม่ได้ตั้งค่า SUPABASE_SERVICE_ROLE_KEY').res

  const bearer = bearerToken(req)
  if (!bearer) return fail(401, 'no_login', 'กรุณาเข้าสู่ระบบ').res

  const { data, error } = await admin.auth.getUser(bearer)
  if (error || !data.user) return fail(401, 'no_login', 'กรุณาเข้าสู่ระบบใหม่').res
  if (!isFreshPasswordLogin(bearer)) return fail(401, 'reauth', 'กรุณาใส่รหัสผ่านอีกครั้ง').res

  const user = await loadProfile(admin, data.user.id)
  if (!user) return fail(403, 'disabled', 'บัญชีนี้ถูกปิดใช้งาน').res

  // A fresh password login re-enables a PIN that was locked by wrong guesses.
  await admin
    .from('user_pins')
    .update({ failed_attempts: 0, locked_at: null, updated_at: new Date().toISOString() })
    .eq('user_id', user.id)
  const { data: pinRow } = await admin.from('user_pins').select('user_id').eq('user_id', user.id).maybeSingle()

  const exp = nextCutoff()
  const session = await signClaims({ t: 'session', u: user.id, r: user.role, n: user.displayName, exp })
  const unlock = await signClaims({ t: 'unlock', u: user.id, exp })

  const res = NextResponse.json({ ok: true, user, exp, hasPin: !!pinRow, unlock })
  res.cookies.set(SESSION_COOKIE, session, sessionCookieOptions)
  return res
}

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req)
  if (!auth.ok) return auth.res
  const { data: pinRow } = await auth.admin.from('user_pins').select('user_id').eq('user_id', auth.user.id).maybeSingle()
  return NextResponse.json({ ok: true, user: auth.user, exp: auth.exp, hasPin: !!pinRow })
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true })
  res.cookies.set(SESSION_COOKIE, '', { ...sessionCookieOptions, maxAge: 0 })
  return res
}
