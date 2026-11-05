// fetch() for our own /api routes: attaches the logged-in user's access token and,
// if the PIN has been entered (or the password typed) since the last Lock, the unlock token.
//
// The unlock token is kept in localStorage so a page refresh or reopening the app keeps
// the cashier unlocked. It dies at the daily cutoff (its own `exp`) and is wiped by
// Lock and Logout, so the PIN screen only comes back after Lock or a new login.
import { supabase } from './supabase'

const UNLOCK_KEY = 'pos_unlock'

type Stored = { token: string; userId: string }

function decodeClaims(token: string): { u?: string; exp?: number } | null {
  try {
    const body = token.split('.')[0]
    const b64 = body.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (body.length % 4)) % 4)
    return JSON.parse(atob(b64))
  } catch {
    return null
  }
}

// Only a convenience check (is it expired, is it for this user). The server still
// verifies the signature on every request that needs it.
export function readStoredUnlock(userId: string): string | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(UNLOCK_KEY)
    if (!raw) return null
    const stored = JSON.parse(raw) as Stored
    const claims = decodeClaims(stored.token)
    if (!claims || claims.u !== userId || typeof claims.exp !== 'number' || claims.exp <= Date.now()) return null
    return stored.token
  } catch {
    return null
  }
}

let unlockToken: string | null = null
export const setUnlockToken = (token: string | null) => {
  unlockToken = token
  if (typeof window === 'undefined') return
  try {
    if (!token) {
      window.localStorage.removeItem(UNLOCK_KEY)
      return
    }
    const userId = decodeClaims(token)?.u
    if (userId) window.localStorage.setItem(UNLOCK_KEY, JSON.stringify({ token, userId } satisfies Stored))
  } catch {
    // Storage blocked: the token still works for this page load.
  }
}

export async function apiFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers)
  const { data } = await supabase.auth.getSession()
  if (data.session?.access_token) headers.set('Authorization', `Bearer ${data.session.access_token}`)
  if (unlockToken) headers.set('x-pos-unlock', unlockToken)
  return fetch(input, { ...init, headers })
}
