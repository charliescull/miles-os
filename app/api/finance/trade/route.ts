import { NextRequest, NextResponse } from 'next/server'
import { isAuthenticatedFromRequest } from '@/lib/auth'
import { applyTrade } from '@/lib/finance/holdings'
import { refreshAll } from '@/lib/finance/refresh'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Record a buy/sell → recompute the holding from the ledger → warm the finance cache so the
// dashboard reflects it immediately.
export async function POST(req: NextRequest) {
  if (!(await isAuthenticatedFromRequest(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const body = await req.json()
    const { ticker, side, shares, price, note, rawTicker } = body ?? {}
    if (!ticker || (side !== 'buy' && side !== 'sell')) {
      return NextResponse.json({ error: 'ticker and side (buy|sell) required' }, { status: 400 })
    }
    const result = await applyTrade({
      ticker, side,
      shares: Number(shares),
      price: Number(price),
      note: note ?? null,
      rawTicker,
    })
    await refreshAll() // rebuild the market blob with the new position
    return NextResponse.json({ ok: true, ...result })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'trade failed' }, { status: 400 })
  }
}
