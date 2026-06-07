import { NextRequest, NextResponse } from 'next/server'
import { isAuthenticatedFromRequest } from '@/lib/auth'
import { detectCompletionIntent, completeTaskByQuery } from '@/lib/tasks/taskIntent'

export const dynamic = 'force-dynamic'

// Check off a task by description. POST { text } (a full message → intent detected) or
// { query } (direct). Used by the Telegram bot and for testing. Returns the matched task.
export async function POST(req: NextRequest) {
  if (!(await isAuthenticatedFromRequest(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const body = await req.json().catch(() => ({}))

  let query: string = typeof body.query === 'string' ? body.query.trim() : ''
  let isCompletion = !!query
  if (!query && typeof body.text === 'string') {
    const det = detectCompletionIntent(body.text)
    isCompletion = det.isCompletion
    query = det.query
  }

  if (!isCompletion || !query) {
    return NextResponse.json({ isCompletion: false, matched: null })
  }

  const { matched, score } = await completeTaskByQuery(query)
  return NextResponse.json({ isCompletion: true, query, matched, score })
}
