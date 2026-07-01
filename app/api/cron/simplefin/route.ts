import { NextRequest, NextResponse } from 'next/server'
import { isAuthenticatedFromRequest } from '@/lib/auth'
import { syncSimplefin } from '@/lib/finance/simplefin'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Daily SimpleFIN → fin_spend sync (finance overhaul v2 §10.3). cron-job.org, 06:30 America/
// New_York (before the 7am brief). Self-authenticates via Authorization: Bearer <CRON_SECRET>
// (/api/cron is public in proxy.ts). Fails soft when SIMPLEFIN_ACCESS_URL is absent.
async function run(req: NextRequest) {
  if (!(await isAuthenticatedFromRequest(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const result = await syncSimplefin()
  return NextResponse.json(result)
}

export const GET = run
export const POST = run
