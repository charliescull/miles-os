import { NextRequest, NextResponse } from 'next/server'
import { isAuthenticatedFromRequest } from '@/lib/auth'
import { getValidAccessToken, whoopApiFetch } from '@/lib/whoop'

// Live WHOOP snapshot for the Health card. Fetches the latest recovery, sleep,
// and cycle (strain) and normalizes them into the small shape the card renders.
// Returns { connected: false } when no tokens are stored (card shows Connect).

async function fetchJson(path: string, token: string): Promise<Record<string, unknown> | null> {
  try {
    const r = await whoopApiFetch(path, token)
    if (!r.ok) return null
    return await r.json()
  } catch {
    return null
  }
}

function firstScore(payload: Record<string, unknown> | null): Record<string, unknown> | null {
  const records = (payload?.records as Array<Record<string, unknown>>) ?? []
  const rec = records[0]
  return (rec?.score as Record<string, unknown>) ?? null
}

export async function GET(req: NextRequest) {
  if (!await isAuthenticatedFromRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const token = await getValidAccessToken()
  if (!token) return NextResponse.json({ connected: false })

  const [recPayload, sleepPayload, cyclePayload] = await Promise.all([
    fetchJson('/recovery?limit=1', token),
    fetchJson('/activity/sleep?limit=1', token),
    fetchJson('/cycle?limit=1', token),
  ])

  // Recovery
  let recovery = null
  const rs = firstScore(recPayload)
  if (rs) {
    recovery = {
      score: Math.round(Number(rs.recovery_score ?? 0)),
      hrv: Math.round(Number(rs.hrv_rmssd_milli ?? 0)),
      rhr: Math.round(Number(rs.resting_heart_rate ?? 0)),
    }
  }

  // Sleep
  let sleep = null
  const ss = firstScore(sleepPayload)
  if (ss) {
    const stage = (ss.stage_summary as Record<string, unknown>) ?? {}
    const inBed = Number(stage.total_in_bed_time_milli ?? 0)
    const awake = Number(stage.total_awake_time_milli ?? 0)
    sleep = {
      asleepMs: Math.max(0, inBed - awake),
      performance: Math.round(Number(ss.sleep_performance_percentage ?? 0)),
      respiratory: Number(ss.respiratory_rate ?? 0),
    }
  }

  // Strain (cycle, v1)
  let strain: number | null = null
  const cs = firstScore(cyclePayload)
  if (cs && cs.strain != null) strain = Number(cs.strain)

  return NextResponse.json({ connected: true, recovery, sleep, strain })
}
