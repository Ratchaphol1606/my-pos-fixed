import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, type AuthOk } from '@/src/lib/serverAuth'
import { logAudit } from '@/src/lib/audit'
import {
  MAX_PASSWORD_BYTES,
  MIN_PASSWORD,
  USERNAME_RE,
  normalizeUsername,
  usernameToEmail,
} from '@/src/lib/staffEmail'

// Staff management for the admin /users page.
//   GET                                   list everyone (admin)
//   POST { action: 'create' | 'update' | 'resetPassword' | 'resetPin' }
//                                         admin AND PIN-unlocked
// Everything runs with the service role; the browser never touches user_pins or
// auth.users. Accounts are never deleted, only disabled, so past sales keep a name.

type Role = 'admin' | 'cashier'

const bad = (error: string, status = 400) => NextResponse.json({ ok: false, error }, { status })
const good = (extra: object = {}) => NextResponse.json({ ok: true, ...extra })

const cleanName = (v: unknown) => (typeof v === 'string' ? v.trim().slice(0, 40) : '')
const validRole = (v: unknown): v is Role => v === 'admin' || v === 'cashier'
const validId = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 64
const validPassword = (v: unknown): v is string =>
  typeof v === 'string' && v.length >= MIN_PASSWORD && new TextEncoder().encode(v).length <= MAX_PASSWORD_BYTES

const PASSWORD_RULE = `รหัสผ่านต้องยาวอย่างน้อย ${MIN_PASSWORD} ตัวอักษร`
const NAME_TAKEN = 'ชื่อผู้ใช้นี้ถูกใช้แล้ว'

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req, { admin: true })
  if (!auth.ok) return auth.res

  const [profiles, pins] = await Promise.all([
    auth.admin
      .from('profiles')
      .select('id, username, display_name, role, is_active, created_at')
      .order('created_at', { ascending: true }),
    auth.admin.from('user_pins').select('user_id, locked_at'),
  ])
  if (profiles.error) return bad('โหลดรายชื่อผู้ใช้ไม่สำเร็จ', 500)

  const pinByUser = new Map<string, { locked_at: string | null }>(
    (pins.data ?? []).map((p: { user_id: string; locked_at: string | null }) => [p.user_id, p]),
  )
  const users = (profiles.data ?? []).map(
    (p: { id: string; username: string; display_name: string; role: Role; is_active: boolean }) => ({
      id: p.id,
      username: p.username,
      displayName: p.display_name,
      role: p.role,
      isActive: p.is_active,
      hasPin: pinByUser.has(p.id),
      pinLocked: !!pinByUser.get(p.id)?.locked_at,
    }),
  )
  return good({ users, me: auth.user.id })
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req, { admin: true, unlock: true })
  if (!auth.ok) return auth.res

  const body = await req.json().catch(() => null)
  switch (body?.action) {
    case 'create':
      return create(auth, body)
    case 'update':
      return update(auth, body)
    case 'resetPassword':
      return resetPassword(auth, body)
    case 'resetPin':
      return resetPin(auth, body)
    default:
      return bad('คำสั่งไม่ถูกต้อง')
  }
}

const actorOf = (a: AuthOk) => ({ id: a.user.id, username: a.user.username, role: a.user.role })

async function create(auth: AuthOk, body: Record<string, unknown>) {
  const { admin } = auth
  const username = normalizeUsername(typeof body.username === 'string' ? body.username : '')
  const displayName = cleanName(body.displayName)
  if (!USERNAME_RE.test(username)) return bad('ชื่อผู้ใช้ใช้ได้เฉพาะ a-z 0-9 . _ - ความยาว 3–30 ตัว')
  if (!displayName) return bad('กรุณาใส่ชื่อที่แสดง')
  if (!validRole(body.role)) return bad('สิทธิ์ไม่ถูกต้อง')
  if (!validPassword(body.password)) return bad(PASSWORD_RULE)

  const { data: taken } = await admin.from('profiles').select('id').eq('username', username).maybeSingle()
  if (taken) return bad(NAME_TAKEN, 409)

  // Email is pre-confirmed so nobody ever has to open a mailbox.
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: usernameToEmail(username),
    password: body.password,
    email_confirm: true,
  })
  if (createError || !created?.user) {
    return bad(/already|registered|exists/i.test(createError?.message ?? '') ? NAME_TAKEN : 'สร้างบัญชีไม่สำเร็จ', 409)
  }

  const { error: profileError } = await admin.from('profiles').insert({
    id: created.user.id,
    username,
    display_name: displayName,
    role: body.role,
    is_active: true,
  })
  if (profileError) {
    // No half-made accounts: a login without a profile can't do anything anyway.
    await admin.auth.admin.deleteUser(created.user.id)
    return profileError.code === '23505' ? bad(NAME_TAKEN, 409) : bad('สร้างบัญชีไม่สำเร็จ', 500)
  }
  await logAudit(admin, actorOf(auth), {
    action: 'user.create', entity: 'profiles', entityId: created.user.id,
    summary: `เพิ่มผู้ใช้ @${username} (${displayName})`,
    newData: { username, display_name: displayName, role: body.role },
  })
  return good({ id: created.user.id })
}

async function update(auth: AuthOk, body: Record<string, unknown>) {
  const { admin, user } = auth
  if (!validId(body.id)) return bad('ไม่พบผู้ใช้')
  const id = body.id

  const { data: target } = await admin
    .from('profiles')
    .select('id, username, display_name, role, is_active')
    .eq('id', id)
    .maybeSingle()
  if (!target) return bad('ไม่พบผู้ใช้', 404)

  const patch: { display_name?: string; role?: Role; is_active?: boolean } = {}
  if (body.displayName !== undefined) {
    const name = cleanName(body.displayName)
    if (!name) return bad('กรุณาใส่ชื่อที่แสดง')
    patch.display_name = name
  }
  if (body.role !== undefined) {
    if (!validRole(body.role)) return bad('สิทธิ์ไม่ถูกต้อง')
    patch.role = body.role
  }
  if (body.isActive !== undefined) {
    if (typeof body.isActive !== 'boolean') return bad('ข้อมูลไม่ถูกต้อง')
    patch.is_active = body.isActive
  }
  if (Object.keys(patch).length === 0) return bad('ไม่มีข้อมูลที่ต้องแก้ไข')

  // Never let the shop end up with nobody who can manage it.
  const newRole = patch.role ?? target.role
  const newActive = patch.is_active ?? target.is_active
  const losesAdmin = target.role === 'admin' && target.is_active && (newRole !== 'admin' || !newActive)
  if (losesAdmin) {
    if (id === user.id) return bad('ไม่สามารถลดสิทธิ์หรือปิดบัญชีของตัวเองได้')
    const { data: admins } = await admin.from('profiles').select('id').eq('role', 'admin').eq('is_active', true)
    if (!(admins ?? []).some((a: { id: string }) => a.id !== id)) {
      return bad('ต้องเหลือผู้ดูแลระบบที่ใช้งานอยู่อย่างน้อย 1 คน')
    }
  }

  const { error } = await admin.from('profiles').update(patch).eq('id', id)
  if (error) return bad('บันทึกไม่สำเร็จ', 500)

  // A disabled account is also banned in Supabase Auth, so it can't sign in or refresh.
  if (patch.is_active !== undefined && patch.is_active !== target.is_active) {
    const { error: banError } = await admin.auth.admin.updateUserById(id, {
      ban_duration: patch.is_active ? 'none' : '876000h',
    })
    if (banError) return bad('บันทึกแล้ว แต่ปรับสถานะการเข้าสู่ระบบไม่สำเร็จ กรุณาลองอีกครั้ง', 500)
  }

  const was: Record<string, unknown> = { display_name: target.display_name, role: target.role, is_active: target.is_active }
  const oldData: Record<string, unknown> = {}
  for (const k of Object.keys(patch)) oldData[k] = was[k]
  const statusChanged = patch.is_active !== undefined && patch.is_active !== target.is_active
  const roleChanged = patch.role !== undefined && patch.role !== target.role
  await logAudit(admin, actorOf(auth), {
    action: statusChanged ? (patch.is_active ? 'user.enable' : 'user.disable') : roleChanged ? 'user.role' : 'user.update',
    entity: 'profiles', entityId: id,
    summary: `${statusChanged ? (patch.is_active ? 'เปิดใช้งาน' : 'ปิดใช้งาน') : 'แก้ไข'}ผู้ใช้ @${target.username}`,
    oldData, newData: patch,
  })
  return good()
}

async function resetPassword(auth: AuthOk, body: Record<string, unknown>) {
  const { admin } = auth
  if (!validId(body.id)) return bad('ไม่พบผู้ใช้')
  if (!validPassword(body.password)) return bad(PASSWORD_RULE)

  const { data: target } = await admin.from('profiles').select('id, username').eq('id', body.id).maybeSingle()
  if (!target) return bad('ไม่พบผู้ใช้', 404)

  const { error } = await admin.auth.admin.updateUserById(body.id, { password: body.password })
  if (error) return bad('เปลี่ยนรหัสผ่านไม่สำเร็จ', 500)
  // The new password itself is never logged.
  await logAudit(admin, actorOf(auth), {
    action: 'user.reset_password', entity: 'profiles', entityId: target.id,
    summary: `รีเซ็ตรหัสผ่านของ @${target.username}`,
  })
  return good()
}

async function resetPin(auth: AuthOk, body: Record<string, unknown>) {
  const { admin } = auth
  if (!validId(body.id)) return bad('ไม่พบผู้ใช้')
  const { data: target } = await admin.from('profiles').select('id, username').eq('id', body.id).maybeSingle()
  if (!target) return bad('ไม่พบผู้ใช้', 404)
  // No PIN row = the person is asked to choose a new one at their next password login.
  const { error } = await admin.from('user_pins').delete().eq('user_id', body.id)
  if (error) return bad('รีเซ็ต PIN ไม่สำเร็จ', 500)
  await logAudit(admin, actorOf(auth), {
    action: 'user.reset_pin', entity: 'profiles', entityId: target.id,
    summary: `รีเซ็ต PIN ของ @${target.username}`,
  })
  return good()
}
