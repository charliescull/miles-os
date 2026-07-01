import { NextRequest, NextResponse } from 'next/server'
import { isAuthenticatedFromRequest } from '@/lib/auth'
import { addSpend, spendSummary } from '@/lib/finance/spend'

export const dynamic = 'force-dynamic'

// Free spend log (finance overhaul v2 §10.3). GET → summary; POST { amount, merchant?, category? }.
export async function GET(req: NextRequest) {
  if (!(await isAuthenticatedFromRequest(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json(await spendSummary())
}

export async function POST(req: NextRequest) {
  if (!(await isAuthenticatedFromRequest(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const body = await req.json()
    if (body?.amount == null || !(Number(body.amount) > 0)) return NextResponse.json({ error: 'amount required' }, { status: 400 })
    await addSpend({ amount: Number(body.amount), merchant: body.merchant, category: body.category, source: body.source ?? 'manual' })
    return NextResponse.json({ ok: true, ...(await spendSummary()) })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'save failed' }, { status: 400 })
  }
}
