// Server-side gate for API routes (node runtime).
//
// A request must carry ALL of:
//   1. Authorization: Bearer <Supabase access token>   who you are (checked with Supabase Auth)
//   2. the signed `pos_session` cookie                  login still valid (daily cutoff / browser closed)
//   3. x-pos-unlock header (only when opts.unlock)      you typed your PIN since the last page load
// The role always comes from the profiles table, never from the cookie, so disabling or
// demoting someone takes effect on their very next request.
import { NextRequest, NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { SESSION_COOKIE, UNLOCK_HEADER, verifyClaims, type StaffRole } from './session'

export type AuthedUser = { id: string; username: string; displayName: string; role: StaffRole }
export type AuthOk = { ok: true; user: AuthedUser; admin: SupabaseClient; exp: number }
export type AuthFail = { ok: false; res: NextResponse }

export function adminClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

export function fail(status: number, code: string, error: string, extra: object = {}): AuthFail {
  return { ok: false, res: NextResponse.json({ ok: false, code, error, ...extra }, { status }) }
}

export function bearerToken(req: NextRequest): string | null {
  const m = /^Bearer\s+(.+)$/i.exec(req.headers.get('authorization') ?? '')
  return m ? m[1] : null
}

// Reads the profile for a user the caller has ALREADY proven is who they say they are.
export async function loadProfile(admin: SupabaseClient, userId: string): Promise<AuthedUser | null> {
  const { data } = await admin
    .from('profiles')
    .select('username, display_name, role, is_active')
    .eq('id', userId)
    .maybeSingle()
  if (!data || !data.is_active) return null
  if (data.role !== 'admin' && data.role !== 'cashier') return null
  return { id: userId, username: data.username, displayName: data.display_name, role: data.role }
}

export async function requireAuth(
  req: NextRequest,
  opts: { admin?: boolean; unlock?: boolean } = {},
): Promise<AuthOk | AuthFail> {
  const admin = adminClient()
  if (!admin) return fail(500, 'server_config', 'เซิร์ฟเวอร์ยังไม่ได้ตั้งค่า SUPABASE_SERVICE_ROLE_KEY')

  const bearer = bearerToken(req)
  if (!bearer) return fail(401, 'no_login', 'กรุณาเข้าสู่ระบบ')

  const claims = await verifyClaims(req.cookies.get(SESSION_COOKIE)?.value, 'session')
  if (!claims) return fail(401, 'session_expired', 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่')

  const { data, error } = await admin.auth.getUser(bearer)
  if (error || !data.user || data.user.id !== claims.u) {
    return fail(401, 'no_login', 'กรุณาเข้าสู่ระบบใหม่')
  }

  const user = await loadProfile(admin, data.user.id)
  if (!user) return fail(403, 'disabled', 'บัญชีนี้ถูกปิดใช้งาน')

  if (opts.admin && user.role !== 'admin') {
    return fail(403, 'forbidden', 'ต้องใช้สิทธิ์ผู้ดูแลระบบ (Admin)')
  }

  if (opts.unlock) {
    const unlock = await verifyClaims(req.headers.get(UNLOCK_HEADER), 'unlock')
    if (!unlock || unlock.u !== user.id) {
      return fail(423, 'locked', 'กรุณาปลดล็อกด้วย PIN ก่อน')
    }
  }

  return { ok: true, user, admin, exp: claims.exp }
}
