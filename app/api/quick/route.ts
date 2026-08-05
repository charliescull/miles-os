import { NextRequest, NextResponse } from 'next/server'
import { isAuthenticatedFromRequest } from '@/lib/auth'
import { routeTextMessage } from '@/lib/router/routeText'
import { quickCaptureHttpStatus } from '@/lib/quickCaptureResponse'
import { createHash } from 'node:crypto'

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
  const idempotencyKey = req.headers.get('idempotency-key') ?? (typeof body.idempotency_key === 'string' ? body.idempotency_key : null)

  try {
    const requestHash = idempotencyKey ? createHash('sha256').update(text, 'utf8').digest('hex') : null
    const result = await routeTextMessage(text, 'action_button', idempotencyKey, requestHash)
    const message = result.confirmation.replace(/[*_`]/g, '') // strip Markdown for plain display
    const state = result.idempotency ?? 'processed'
    // A completed first submission is created now (201); only a completed
    // replay is an existing resource (200). In-progress replays stay retryable.
    const status = quickCaptureHttpStatus(result.idempotency)
    return NextResponse.json({ ok: true, state, routedTo: result.routedTo, message }, { status })
  } catch (e) {
    if (e instanceof Error && e.message === 'Idempotency key was reused for different content') {
      return NextResponse.json({ error: e.message }, { status: 409 })
    }
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Quick capture failed' }, { status: 500 })
  }
}
