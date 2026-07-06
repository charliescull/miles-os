import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabase'
import { isAuthenticatedFromRequest } from '@/lib/auth'
import { getOrRefresh } from '@/lib/finance/refresh'
import { assembleView } from '@/lib/finance/view'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Unified net-worth snapshot for the dashboard (FinancePulseCard) + FinanceCore. Returns the SAME
// live net worth the /finance page computes — investments + cash (paychecks − daily spend + food
// variance) — so every figure across the site agrees. Deltas/sparkline come from the
// fin_networth_snapshots history written on each market refresh.
export async function GET(req: NextRequest) {
  if (!(await isAuthenticatedFromRequest(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const refresh = req.nextUrl.searchParams.get('refresh') === '1'
    const blob = await getOrRefresh(refresh)
    const view = await assembleView(blob)
    const net = view.netWorth

    // History for deltas + sparkline (oldest→newest).
    const db = getServiceClient()
    const { data: rows } = await db
      .from('fin_networth_snapshots')
      .select('net_worth, taken_at')
      .order('taken_at', { ascending: false })
      .limit(60)
    const hist = (rows ?? []).map(r => ({ nw: Number(r.net_worth), t: new Date(r.taken_at).getTime() }))

    const now = Date.now()
    const DAY = 86400_000
    const nearest = (agoMs: number) => {
      const target = now - agoMs
      let best: number | null = null, bestDiff = Infinity
      for (const h of hist) { const d = Math.abs(h.t - target); if (d < bestDiff) { bestDiff = d; best = h.nw } }
      return best
    }
    const dayAgo = nearest(DAY)
    const monthAgo = nearest(30 * DAY)
    const delta = (past: number | null) => past && past !== 0 ? { abs: net - past, pct: ((net - past) / past) * 100 } : { abs: 0, pct: 0 }
    const d = delta(dayAgo)
    const m = delta(monthAgo)

    const sparkline = hist.slice(0, 30).map(h => h.nw).reverse()

    return NextResponse.json({
      net_worth: net,
      currency: 'USD',
      as_of: new Date().toISOString(),
      daily_delta: d.abs,
      daily_delta_pct: d.pct,
      monthly_delta: m.abs,
      monthly_delta_pct: m.pct,
      change_30d_pct: m.pct,
      sparkline,
    })
  } catch (e) {
    return NextResponse.json({ net_worth: 0, currency: 'USD', as_of: '', error: e instanceof Error ? e.message : 'snapshot failed' })
  }
}
