import { NextRequest, NextResponse } from 'next/server'
import { isAuthenticatedFromRequest } from '@/lib/auth'
import { addIncome, incomeSummary } from '@/lib/finance/income'

export const dynamic = 'force-dynamic'

// Income / paychecks (raises cash → net worth). GET → summary; POST { amount, source?, note? }.
export async function GET(req: NextRequest) {
  if (!(await isAuthenticatedFromRequest(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json(await incomeSummary())
}

export async function POST(req: NextRequest) {
  if (!(await isAuthenticatedFromRequest(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const body = await req.json()
    if (body?.amount == null || !(Number(body.amount) > 0)) return NextResponse.json({ error: 'amount required' }, { status: 400 })
    await addIncome({ amount: Number(body.amount), source: body.source, note: body.note })
    return NextResponse.json({ ok: true, ...(await incomeSummary()) })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'save failed' }, { status: 400 })
  }
}
