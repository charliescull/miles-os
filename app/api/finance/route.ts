import { NextRequest, NextResponse } from 'next/server'
import { isAuthenticatedFromRequest } from '@/lib/auth'
import { getOrRefresh } from '@/lib/finance/refresh'
import { assembleView } from '@/lib/finance/view'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Render the finance view. Serves the 12h cache; refreshes when stale/missing (or ?refresh=1).
// Also the daily cron target (vercel.json) — the 05:00 hit will be >12h stale and warm the cache.
export async function GET(req: NextRequest) {
  if (!(await isAuthenticatedFromRequest(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const force = req.nextUrl.searchParams.get('refresh') === '1'
  try {
    const blob = await getOrRefresh(force)
    const view = await assembleView(blob)
    return NextResponse.json(view)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Finance refresh failed' }, { status: 500 })
  }
}
