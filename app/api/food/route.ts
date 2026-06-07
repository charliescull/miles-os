import { NextRequest, NextResponse } from 'next/server'
import { isAuthenticatedFromRequest } from '@/lib/auth'
import { logStandardFood } from '@/lib/nutrition/foodLog'

export const dynamic = 'force-dynamic'

// Standard food quick-log. POST { description, macros? } → estimates macros (unless supplied)
// and appends a meal to today's nutrition log. Used by the Telegram bot and available for any
// direct quick-log. (Recipe path stays at /api/recipes — analyzed + taste-scored + saved.)
export async function POST(req: NextRequest) {
  if (!(await isAuthenticatedFromRequest(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const body = await req.json().catch(() => ({}))
  const description = typeof body.description === 'string' ? body.description.trim() : ''
  if (!description) return NextResponse.json({ error: 'description required' }, { status: 400 })

  try {
    const result = await logStandardFood(description, body.macros)
    return NextResponse.json({ ok: true, ...result }, { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Food log failed' }, { status: 500 })
  }
}
