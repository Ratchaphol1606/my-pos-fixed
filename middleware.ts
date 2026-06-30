import { NextRequest, NextResponse } from 'next/server'

// Server-side gate — this is what actually stops a cashier from typing
// /settings into the URL bar. Hiding the nav link alone (client-side)
// is just UX; this is the real enforcement layer.
//
// Paths an 'admin' role can access that a 'cashier' role cannot:
const ADMIN_ONLY_PREFIXES = ['/settings', '/reports', '/taxReports']

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  const isAdminOnly = ADMIN_ONLY_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  )
  if (!isAdminOnly) return NextResponse.next()

  const role = req.cookies.get('pos_role')?.value

  // No session yet — let PinLock (client-side) handle showing the lock
  // screen; don't redirect here or the PIN entry itself would loop.
  if (!role) return NextResponse.next()

  if (role !== 'admin') {
    const url = req.nextUrl.clone()
    url.pathname = '/'
    return NextResponse.redirect(url)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/settings/:path*', '/reports/:path*', '/taxReports/:path*'],
}
