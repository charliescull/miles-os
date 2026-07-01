import { NextRequest, NextResponse } from 'next/server'
import { isAuthenticatedFromRequest } from '@/lib/auth'
import { patchHolding } from '@/lib/finance/holdings'
import { refreshAll } from '@/lib/finance/refresh'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Inline correction of a holding's shares / avg cost / sector (the pencil edit on a row).
export async function PATCH(req: NextRequest) {
  if (!(await isAuthenticatedFromRequest(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const body = await req.json()
    const { id, shares, avgCost, sector, companyName } = body ?? {}
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
    const holding = await patchHolding(id, {
      shares: shares === undefined ? undefined : Number(shares),
      avgCost: avgCost === undefined ? undefined : (avgCost === null ? null : Number(avgCost)),
      sector,
      companyName,
    })
    await refreshAll()
    return NextResponse.json({ ok: true, holding })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'patch failed' }, { status: 400 })
  }
}
