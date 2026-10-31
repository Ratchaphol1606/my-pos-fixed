import { NextRequest, NextResponse } from 'next/server'
import { signClaims } from '@/src/lib/session'
import { fail, requireAuth } from '@/src/lib/serverAuth'
import { MAX_PIN_ATTEMPTS, checkPin, hashPin, isValidPin } from '@/src/lib/pin'
import { logAudit } from '@/src/lib/audit'

// Per-user 4-digit PIN, the quick re-unlock after a page refresh.
//   { action: 'verify', pin }  -> { ok, unlock }   needs a valid login
//   { action: 'set',    pin }  -> { ok }           needs a valid login AND to be unlocked
//                                                  (first-time setup happens right after the
//                                                  password login, which unlocks)

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (body?.action === 'verify') return verify(req, body?.pin)
  if (body?.action === 'set') return setPin(req, body?.pin)
  return NextResponse.json({ ok: false, error: 'คำสั่งไม่ถูกต้อง' }, { status: 400 })
}

async function verify(req: NextRequest, pin: unknown) {
  if (!isValidPin(pin)) return fail(400, 'bad_pin', 'PIN ต้องเป็นตัวเลข 4 หลัก').res

  const auth = await requireAuth(req)
  if (!auth.ok) return auth.res
  const { admin, user } = auth

  const { data: row } = await admin
    .from('user_pins')
    .select('pin_hash, failed_attempts, locked_at')
    .eq('user_id', user.id)
    .maybeSingle()
  if (!row) return fail(409, 'no_pin', 'ยังไม่ได้ตั้ง PIN').res
  if (row.locked_at || row.failed_attempts >= MAX_PIN_ATTEMPTS) {
    return fail(423, 'pin_locked', 'PIN ถูกล็อก กรุณาเข้าสู่ระบบด้วยรหัสผ่าน').res
  }

  // Use up an attempt BEFORE checking the PIN, with a compare-and-set on the counter.
  // Parallel guesses therefore can't all read "0 failures" and dodge the lockout: only
  // one request wins each step of the counter, the rest are turned away.
  const used = row.failed_attempts + 1
  const { data: reserved, error } = await admin
    .from('user_pins')
    .update({
      failed_attempts: used,
      locked_at: used >= MAX_PIN_ATTEMPTS ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', user.id)
    .eq('failed_attempts', row.failed_attempts)
    .select('user_id')
  if (error) return fail(500, 'db', 'เกิดข้อผิดพลาด ลองใหม่อีกครั้ง').res
  if (!reserved || reserved.length === 0) return fail(429, 'busy', 'กรุณารอสักครู่แล้วลองใหม่').res

  if (!(await checkPin(pin, row.pin_hash))) {
    if (used >= MAX_PIN_ATTEMPTS) {
      await logAudit(admin, { id: user.id, username: user.username, role: user.role }, {
        action: 'pin.locked',
        entity: 'profiles',
        entityId: user.id,
        summary: `PIN ผิดครบ ${MAX_PIN_ATTEMPTS} ครั้ง ถูกล็อก (${user.displayName})`,
      })
      return fail(423, 'pin_locked', 'PIN ถูกล็อก กรุณาเข้าสู่ระบบด้วยรหัสผ่าน').res
    }
    return fail(401, 'bad_pin', 'PIN ไม่ถูกต้อง', { remaining: MAX_PIN_ATTEMPTS - used }).res
  }

  await admin
    .from('user_pins')
    .update({ failed_attempts: 0, locked_at: null, updated_at: new Date().toISOString() })
    .eq('user_id', user.id)

  const unlock = await signClaims({ t: 'unlock', u: user.id, exp: auth.exp })
  return NextResponse.json({ ok: true, unlock })
}

async function setPin(req: NextRequest, pin: unknown) {
  if (!isValidPin(pin)) return fail(400, 'bad_pin', 'PIN ต้องเป็นตัวเลข 4 หลัก').res

  const auth = await requireAuth(req, { unlock: true })
  if (!auth.ok) return auth.res

  const { error } = await auth.admin.from('user_pins').upsert(
    {
      user_id: auth.user.id,
      pin_hash: await hashPin(pin),
      failed_attempts: 0,
      locked_at: null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  )
  if (error) return fail(500, 'db', 'บันทึก PIN ไม่สำเร็จ').res
  await logAudit(auth.admin, { id: auth.user.id, username: auth.user.username, role: auth.user.role }, {
    action: 'pin.set',
    entity: 'profiles',
    entityId: auth.user.id,
    summary: `ตั้ง/เปลี่ยน PIN (${auth.user.displayName})`,
  })
  return NextResponse.json({ ok: true })
}
