import { NextRequest, NextResponse } from 'next/server'
import { isAuthenticatedFromRequest } from '@/lib/auth'
import { getServiceClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// Manual finance config (single row, id=1): buying power (uninvested brokerage cash) and the
// cash baseline. GET → current values; POST { buyingPower?, cashSeed? } → update the provided ones.
export async function GET(req: NextRequest) {
  if (!(await isAuthenticatedFromRequest(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = getServiceClient()
  const { data } = await db.from('fin_config').select('buying_power, cash_seed').eq('id', 1).maybeSingle()
  return NextResponse.json({
    buyingPower: data?.buying_power != null ? Number(data.buying_power) : null,
    cashSeed: data?.cash_seed != null ? Number(data.cash_seed) : null,
  })
}

export async function POST(req: NextRequest) {
  if (!(await isAuthenticatedFromRequest(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const body = await req.json()
    const patch: Record<string, number> = {}
    if (body?.buyingPower != null) {
      const n = Number(body.buyingPower)
      if (!Number.isFinite(n) || n < 0) return NextResponse.json({ error: 'invalid buyingPower' }, { status: 400 })
      patch.buying_power = n
    }
    if (body?.cashSeed != null) {
      const n = Number(body.cashSeed)
      if (!Number.isFinite(n)) return NextResponse.json({ error: 'invalid cashSeed' }, { status: 400 })
      patch.cash_seed = n
    }
    if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'nothing to update' }, { status: 400 })

    const db = getServiceClient()
    // Ensure the single config row exists, then patch it.
    await db.from('fin_config').upsert({ id: 1, ...patch }, { onConflict: 'id' })
    const { data } = await db.from('fin_config').select('buying_power, cash_seed').eq('id', 1).maybeSingle()
    return NextResponse.json({
      ok: true,
      buyingPower: data?.buying_power != null ? Number(data.buying_power) : null,
      cashSeed: data?.cash_seed != null ? Number(data.cash_seed) : null,
    })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'save failed' }, { status: 400 })
  }
}
