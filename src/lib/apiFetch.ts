// fetch() for our own /api routes: attaches the logged-in user's access token and,
// if the PIN has been entered since the last page load, the unlock token.
//
// The unlock token lives in this module-level variable ON PURPOSE. It is never
// written to a cookie or storage, so a page refresh wipes it and the PIN screen
// comes back.
import { supabase } from './supabase'

let unlockToken: string | null = null
export const setUnlockToken = (token: string | null) => {
  unlockToken = token
}

export async function apiFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers)
  const { data } = await supabase.auth.getSession()
  if (data.session?.access_token) headers.set('Authorization', `Bearer ${data.session.access_token}`)
  if (unlockToken) headers.set('x-pos-unlock', unlockToken)
  return fetch(input, { ...init, headers })
}
