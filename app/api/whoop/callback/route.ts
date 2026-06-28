import { NextRequest, NextResponse } from 'next/server'
import { isAuthenticatedFromRequest } from '@/lib/auth'
import { exchangeCode } from '@/lib/whoop'

// WHOOP redirects the browser here after login. The dashboard cookie rides along,
// so we gate it like any other route, exchange the code for tokens (stored
// server-side), then bounce back to the Health page.
export async function GET(req: NextRequest) {
  const home = new URL('/health', req.url)

  if (!await isAuthenticatedFromRequest(req)) {
    return NextResponse.redirect(new URL('/login?from=/health', req.url))
  }

  const error = req.nextUrl.searchParams.get('error')
  if (error) {
    home.searchParams.set('whoop', 'error')
    return NextResponse.redirect(home)
  }

  const code = req.nextUrl.searchParams.get('code')
  if (!code) {
    home.searchParams.set('whoop', 'missing_code')
    return NextResponse.redirect(home)
  }

  try {
    // Must byte-match the redirect_uri used in /connect (derived the same way).
    const redirectUri = new URL('/api/whoop/callback', req.url).toString()
    await exchangeCode(code, redirectUri)
    home.searchParams.set('whoop', 'connected')
  } catch {
    home.searchParams.set('whoop', 'error')
  }
  return NextResponse.redirect(home)
}
