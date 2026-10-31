import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { bearerToken, requireAuth } from '@/src/lib/serverAuth'
import { MAX_PASSWORD_BYTES, MIN_PASSWORD } from '@/src/lib/staffEmail'

// Self-service for whoever is logged in (any role, PIN-unlocked).
//   { action: 'changePassword', currentPassword, newPassword }
// The current password is checked with a throwaway Supabase client, so a borrowed
// unlocked tablet can't be used to take over the account. Changing a PIN uses
// /api/pin { action: 'set' }.

const bad = (error: string, status = 400, code?: string) =>
  NextResponse.json({ ok: false, error, ...(code ? { code } : {}) }, { status })

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req, { unlock: true })
  if (!auth.ok) return auth.res

  const body = await req.json().catch(() => null)
  if (body?.action !== 'changePassword') return bad('คำสั่งไม่ถูกต้อง')

  const { currentPassword, newPassword } = body as { currentPassword?: unknown; newPassword?: unknown }
  if (typeof currentPassword !== 'string' || !currentPassword) return bad('กรุณาใส่รหัสผ่านปัจจุบัน')
  if (
    typeof newPassword !== 'string' ||
    newPassword.length < MIN_PASSWORD ||
    new TextEncoder().encode(newPassword).length > MAX_PASSWORD_BYTES
  ) {
    return bad(`รหัสผ่านใหม่ต้องยาวอย่างน้อย ${MIN_PASSWORD} ตัวอักษร`)
  }
  if (newPassword === currentPassword) return bad('รหัสผ่านใหม่ต้องไม่เหมือนรหัสผ่านเดิม')

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) return bad('เซิร์ฟเวอร์ยังไม่ได้ตั้งค่า Supabase', 500)

  const { data: account } = await auth.admin.auth.admin.getUserById(auth.user.id)
  const email = account?.user?.email
  if (!email) return bad('ไม่พบบัญชี', 404)

  const probe = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const { error: wrong } = await probe.auth.signInWithPassword({ email, password: currentPassword })
  if (wrong) return bad('รหัสผ่านปัจจุบันไม่ถูกต้อง', 401, 'bad_password')
  // Best effort: the probe opened a session of its own, close it again.
  await probe.auth.signOut({ scope: 'local' }).catch(() => {})

  const { error } = await auth.admin.auth.admin.updateUserById(auth.user.id, { password: newPassword })
  if (error) return bad('เปลี่ยนรหัสผ่านไม่สำเร็จ', 500)

  // Anyone else who was logged in as this person on another device is signed out.
  const token = bearerToken(req)
  if (token) await auth.admin.auth.admin.signOut(token, 'others').catch(() => {})

  return NextResponse.json({ ok: true })
}
