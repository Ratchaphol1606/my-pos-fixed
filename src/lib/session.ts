// Signed tokens used by the middleware (edge runtime) and by the API routes (node).
// Web Crypto only: nothing in this file may import 'node:*'.
//
// Two kinds of token, both HMAC-SHA256 signed with a key derived from the
// server-only SUPABASE_SERVICE_ROLE_KEY (so there is no extra env var to manage):
//
//   session  httpOnly cookie `pos_session`. Says "this browser logged in as user U,
//            role R, and that login is good until `exp`". It is a session cookie (gone
//            when the browser closes) and is dead after the daily cutoff.
//
//   unlock   held in page memory only, never in a cookie or localStorage, and sent as the
//            `x-pos-unlock` header. A page refresh loses it, which is what brings the PIN
//            lock screen back. Sensitive API routes require it.

export const SESSION_COOKIE = 'pos_session'
export const UNLOCK_HEADER = 'x-pos-unlock'

export type StaffRole = 'admin' | 'cashier'

export type SessionClaims = { t: 'session'; u: string; r: StaffRole; n: string; exp: number }
export type UnlockClaims = { t: 'unlock'; u: string; exp: number }
type Claims = SessionClaims | UnlockClaims

// No maxAge on purpose: a session cookie, cleared when the browser/app is closed.
export const sessionCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
}

const enc = new TextEncoder()
const dec = new TextDecoder()

function b64urlEncode(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function b64urlDecode(str: string): Uint8Array<ArrayBuffer> {
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (str.length % 4)) % 4)
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
}

let keyPromise: Promise<CryptoKey> | null = null
function getKey(): Promise<CryptoKey> {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!secret) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set')
  keyPromise ??= crypto.subtle
    .digest('SHA-256', enc.encode(`pos-session-v1:${secret}`))
    .then((raw) => crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']))
  return keyPromise
}

export async function signClaims(claims: Claims): Promise<string> {
  const body = b64urlEncode(enc.encode(JSON.stringify(claims)))
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', await getKey(), enc.encode(body)))
  return `${body}.${b64urlEncode(sig)}`
}

export async function verifyClaims(token: string | null | undefined, type: 'session'): Promise<SessionClaims | null>
export async function verifyClaims(token: string | null | undefined, type: 'unlock'): Promise<UnlockClaims | null>
export async function verifyClaims(token: string | null | undefined, type: Claims['t']): Promise<Claims | null> {
  if (!token) return null
  const parts = token.split('.')
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null
  try {
    const ok = await crypto.subtle.verify('HMAC', await getKey(), b64urlDecode(parts[1]), enc.encode(parts[0]))
    if (!ok) return null
    const claims = JSON.parse(dec.decode(b64urlDecode(parts[0]))) as Claims
    if (claims.t !== type) return null
    if (typeof claims.exp !== 'number' || claims.exp <= Date.now()) return null
    return claims
  } catch {
    // Bad encoding, bad JSON, or a missing secret: all fail closed.
    return null
  }
}

// Next 04:00 Thailand time (UTC+7, no daylight saving), as epoch ms. Logins die at
// this moment, so "login again on another day" is enforced by the server and not by
// whatever the browser happens to remember.
const TH_OFFSET_MS = 7 * 3600 * 1000
const DAY_MS = 24 * 3600 * 1000
export function nextCutoff(now: number = Date.now(), hourTH = 4): number {
  const th = new Date(now + TH_OFFSET_MS)
  let cut = Date.UTC(th.getUTCFullYear(), th.getUTCMonth(), th.getUTCDate(), hourTH) - TH_OFFSET_MS
  if (cut <= now) cut += DAY_MS
  return cut
}
