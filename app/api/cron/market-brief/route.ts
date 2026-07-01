import { NextRequest, NextResponse } from 'next/server'
import { isAuthenticatedFromRequest } from '@/lib/auth'
import { generateMarketBrief } from '@/lib/finance/marketBrief'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// 7:00am ET market brief (finance overhaul v2 §6.2). Runs via cron-job.org (America/New_York
// 07:00) — Vercel Hobby can't do sub-daily/specific-time crons. Self-authenticates via
// Authorization: Bearer <CRON_SECRET> (/api/cron is already public in proxy.ts).
//   ?kind=weekly forces the weekly synthesis; otherwise daily, and Sunday also refreshes weekly.
async function run(req: NextRequest) {
  if (!(await isAuthenticatedFromRequest(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const forceWeekly = req.nextUrl.searchParams.get('kind') === 'weekly'
    const daily = forceWeekly ? null : await generateMarketBrief('daily')
    // Sunday (UTC ~ close enough for a weekly rollup) or explicit ?kind=weekly.
    const isSunday = new Date().getUTCDay() === 0
    const weekly = forceWeekly || isSunday ? await generateMarketBrief('weekly') : null
    return NextResponse.json({ ok: true, daily, weekly })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'brief failed' }, { status: 500 })
  }
}

export const GET = run
export const POST = run
