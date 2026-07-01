import { NextRequest, NextResponse } from 'next/server'
import { isAuthenticatedFromRequest } from '@/lib/auth'
import { getCreditView, upsertCreditAccount, addCreditScore } from '@/lib/finance/credit'

export const dynamic = 'force-dynamic'

// Credit account + FICO (finance overhaul v2 §10.2). GET → view; POST → upsert account and/or
// append a FICO score ({ account?, score?, scoredOn? }).
export async function GET(req: NextRequest) {
  if (!(await isAuthenticatedFromRequest(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json(await getCreditView())
}

export async function POST(req: NextRequest) {
  if (!(await isAuthenticatedFromRequest(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const body = await req.json()
    if (body.account) await upsertCreditAccount(body.account)
    if (body.score != null) await addCreditScore(Number(body.score), body.scoredOn)
    return NextResponse.json({ ok: true, ...(await getCreditView()) })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'save failed' }, { status: 400 })
  }
}
