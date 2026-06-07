import { NextRequest, NextResponse } from 'next/server'
import { isAuthenticatedFromRequest } from '@/lib/auth'
import { ensureWeekAndRollover, logSpend } from '@/lib/finance/food'

export const dynamic = 'force-dynamic'

// GET → current week status. POST { amount, note? } → log a food spend.
export async function GET(req: NextRequest) {
  if (!(await isAuthenticatedFromRequest(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const week = await ensureWeekAndRollover()
  return NextResponse.json({ ...week, remaining: week.budget - week.spent })
}

export async function POST(req: NextRequest) {
  if (!(await isAuthenticatedFromRequest(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const body = await req.json().catch(() => ({}))
  const amount = Number(body.amount)
  if (!Number.isFinite(amount) || amount === 0) {
    return NextResponse.json({ error: 'amount must be a non-zero number' }, { status: 400 })
  }
  const week = await logSpend(amount, typeof body.note === 'string' ? body.note : undefined)
  return NextResponse.json({ ...week, remaining: week.budget - week.spent })
}
