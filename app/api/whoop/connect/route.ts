import { NextRequest, NextResponse } from 'next/server'
import { isAuthenticatedFromRequest } from '@/lib/auth'
import { authorizeUrl, whoopEnv } from '@/lib/whoop'

// Kicks off the OAuth flow. Builds the WHOOP authorize URL server-side (so the
// Client ID never has to be hardcoded in the frontend) and redirects the browser.
export async function GET(req: NextRequest) {
  if (!await isAuthenticatedFromRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { clientId } = whoopEnv()
  if (!clientId) {
    return NextResponse.json({ error: 'WHOOP env not configured' }, { status: 500 })
  }
  // Derive the redirect from the live origin so it always matches the registered
  // URL exactly (no env typo / trailing-slash drift).
  const redirectUri = new URL('/api/whoop/callback', req.url).toString()
  const state = crypto.randomUUID()
  return NextResponse.redirect(authorizeUrl(state, redirectUri))
}
