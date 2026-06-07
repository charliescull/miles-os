import { NextRequest, NextResponse } from 'next/server'
import { isAuthenticatedFromRequest } from '@/lib/auth'
import { routeTextMessage } from '@/lib/router/routeText'

export const dynamic = 'force-dynamic'

// Quick capture for the iOS Action Button (Dictate Text → POST here). Runs the SAME routing as
// the Telegram bot (lib/router/routeText) so a spoken line lands in the right place: task / note,
// check-off, calendar event, food log, or recipe. Auth via x-api-secret header.
// Body: { "text": "..." }  (also accepts { "q": "..." }). Returns a short plain-text message
// suitable for a Shortcuts notification (Markdown stripped).
export async function POST(req: NextRequest) {
  if (!(await isAuthenticatedFromRequest(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const text = (typeof body.text === 'string' ? body.text : typeof body.q === 'string' ? body.q : '').trim()
  if (!text) return NextResponse.json({ error: 'text required' }, { status: 400 })

  try {
    const result = await routeTextMessage(text, 'action_button')
    const message = result.confirmation.replace(/[*_`]/g, '') // strip Markdown for plain display
    return NextResponse.json({ ok: true, routedTo: result.routedTo, message }, { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Quick capture failed' }, { status: 500 })
  }
}
