import { NextRequest, NextResponse } from 'next/server'
import { SESSION_COOKIE, verifyClaims } from './src/lib/session'

// Server-side gate — this is what stops a cashier from typing /settings into
// the URL bar. Hiding the nav link alone (client-side) is just UX.
//
// The signed pos_session cookie (set at login, see /api/session) carries the
// role, so this check needs no network call. Data itself is protected by the
// API routes and by the database (RLS), which look the role up fresh each time.
//
// Paths an 'admin' role can access that a 'cashier' role cannot:
const ADMIN_ONLY_PREFIXES = ['/settings', '/reports', '/taxReports', '/promotions', '/users', '/test']

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  const isAdminOnly = ADMIN_ONLY_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  )
  if (!isAdminOnly) return NextResponse.next()

  const session = await verifyClaims(req.cookies.get(SESSION_COOKIE)?.value, 'session')

  // No valid session — let the login screen (client-side) take over; don't
  // redirect here or the login itself would loop.
  if (!session) return NextResponse.next()

  if (session.r !== 'admin') {
    const url = req.nextUrl.clone()
    url.pathname = '/'
    return NextResponse.redirect(url)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/settings/:path*', '/reports/:path*', '/taxReports/:path*', '/promotions/:path*', '/users/:path*', '/test/:path*'],
}
