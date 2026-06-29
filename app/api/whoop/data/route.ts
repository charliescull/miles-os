import { NextRequest, NextResponse } from 'next/server'
import { isAuthenticatedFromRequest } from '@/lib/auth'
import { getValidAccessToken, whoopApiFetch } from '@/lib/whoop'

// Live WHOOP snapshot for the HEALTH section. Pulls the last ~14 days of
// recovery / sleep / cycle plus recent workouts and normalizes them into a rich
// shape the WHOOP module renders: hero recovery, recovery drivers, full sleep
// breakdown (stages + need), strain, trend series, and a workout list.
// Returns { connected: false } when no tokens are stored (card shows Connect).

const TREND_DAYS = 14
const WORKOUT_LIMIT = 6

async function fetchJson(path: string, token: string): Promise<Record<string, unknown> | null> {
  try {
    const r = await whoopApiFetch(path, token)
    if (!r.ok) return null
    return await r.json()
  } catch {
    return null
  }
}

function records(payload: Record<string, unknown> | null): Array<Record<string, unknown>> {
  return (payload?.records as Array<Record<string, unknown>>) ?? []
}

function num(v: unknown): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

export async function GET(req: NextRequest) {
  if (!await isAuthenticatedFromRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const token = await getValidAccessToken()
  if (!token) return NextResponse.json({ connected: false })

  const [recPayload, sleepPayload, cyclePayload, workoutPayload] = await Promise.all([
    fetchJson(`/recovery?limit=${TREND_DAYS}`, token),
    fetchJson(`/activity/sleep?limit=${TREND_DAYS}`, token),
    fetchJson(`/cycle?limit=${TREND_DAYS}`, token),
    fetchJson(`/activity/workout?limit=${WORKOUT_LIMIT}`, token),
  ])

  const recRecs = records(recPayload)
  const sleepRecs = records(sleepPayload)
  const cycleRecs = records(cyclePayload)
  const workoutRecs = records(workoutPayload)

  // ── Current recovery (most recent record) ───────────────────────────────────
  let recovery: {
    score: number; hrv: number; rhr: number; spo2: number | null; skinTempC: number | null
  } | null = null
  const rs0 = recRecs[0]?.score as Record<string, unknown> | undefined
  if (rs0) {
    recovery = {
      score: Math.round(num(rs0.recovery_score)),
      hrv: Math.round(num(rs0.hrv_rmssd_milli)),
      rhr: Math.round(num(rs0.resting_heart_rate)),
      spo2: rs0.spo2_percentage != null ? Math.round(num(rs0.spo2_percentage) * 10) / 10 : null,
      skinTempC: rs0.skin_temp_celsius != null ? Math.round(num(rs0.skin_temp_celsius) * 10) / 10 : null,
    }
  }

  // ── Current sleep (most recent record) ──────────────────────────────────────
  let sleep: {
    asleepMs: number; inBedMs: number; performance: number; consistency: number
    efficiency: number; respiratory: number; cycles: number; disturbances: number
    needMs: number; stages: { light: number; sws: number; rem: number; awake: number }
  } | null = null
  const ss0 = sleepRecs[0]?.score as Record<string, unknown> | undefined
  if (ss0) {
    const stage = (ss0.stage_summary as Record<string, unknown>) ?? {}
    const need = (ss0.sleep_needed as Record<string, unknown>) ?? {}
    const inBed = num(stage.total_in_bed_time_milli)
    const awake = num(stage.total_awake_time_milli)
    const light = num(stage.total_light_sleep_time_milli)
    const sws = num(stage.total_slow_wave_sleep_time_milli)
    const rem = num(stage.total_rem_sleep_time_milli)
    sleep = {
      asleepMs: Math.max(0, inBed - awake),
      inBedMs: inBed,
      performance: Math.round(num(ss0.sleep_performance_percentage)),
      consistency: Math.round(num(ss0.sleep_consistency_percentage)),
      efficiency: Math.round(num(ss0.sleep_efficiency_percentage)),
      respiratory: Math.round(num(ss0.respiratory_rate) * 10) / 10,
      cycles: Math.round(num(stage.sleep_cycle_count)),
      disturbances: Math.round(num(stage.disturbance_count)),
      needMs:
        num(need.baseline_milli) +
        num(need.need_from_sleep_debt_milli) +
        num(need.need_from_recent_strain_milli) -
        num(need.need_from_recent_nap_milli),
      stages: { light, sws, rem, awake },
    }
  }

  // ── Current strain (latest cycle, v1) ───────────────────────────────────────
  let strain: number | null = null
  let cycle: { strain: number; avgHr: number; maxHr: number; kilojoule: number } | null = null
  const cs0 = cycleRecs[0]?.score as Record<string, unknown> | undefined
  if (cs0 && cs0.strain != null) {
    strain = Math.round(num(cs0.strain) * 10) / 10
    cycle = {
      strain,
      avgHr: Math.round(num(cs0.average_heart_rate)),
      maxHr: Math.round(num(cs0.max_heart_rate)),
      kilojoule: Math.round(num(cs0.kilojoule)),
    }
  }

  // ── Trends (oldest → newest for left-to-right sparklines) ────────────────────
  const recScore = (r: Record<string, unknown>) => Math.round(num((r.score as Record<string, unknown>)?.recovery_score))
  const recHrv = (r: Record<string, unknown>) => Math.round(num((r.score as Record<string, unknown>)?.hrv_rmssd_milli))
  const recRhr = (r: Record<string, unknown>) => Math.round(num((r.score as Record<string, unknown>)?.resting_heart_rate))
  const cycStrain = (r: Record<string, unknown>) => Math.round(num((r.score as Record<string, unknown>)?.strain) * 10) / 10
  const slpPerf = (r: Record<string, unknown>) => Math.round(num((r.score as Record<string, unknown>)?.sleep_performance_percentage))

  const trends = {
    recovery: recRecs.map(recScore).filter(n => n > 0).reverse(),
    hrv: recRecs.map(recHrv).filter(n => n > 0).reverse(),
    rhr: recRecs.map(recRhr).filter(n => n > 0).reverse(),
    strain: cycleRecs.map(cycStrain).filter(n => n > 0).reverse(),
    sleepPerf: sleepRecs.map(slpPerf).filter(n => n > 0).reverse(),
  }

  // ── Recent workouts ─────────────────────────────────────────────────────────
  const workouts = workoutRecs.map(w => {
    const sc = (w.score as Record<string, unknown>) ?? {}
    const start = String(w.start ?? '')
    const end = String(w.end ?? '')
    const durationMs = start && end ? Math.max(0, new Date(end).getTime() - new Date(start).getTime()) : 0
    return {
      sport: String(w.sport_name ?? w.sport_id ?? 'Activity'),
      strain: Math.round(num(sc.strain) * 10) / 10,
      avgHr: Math.round(num(sc.average_heart_rate)),
      maxHr: Math.round(num(sc.max_heart_rate)),
      kilojoule: Math.round(num(sc.kilojoule)),
      start,
      durationMs,
    }
  })

  return NextResponse.json({
    connected: true,
    recovery,
    sleep,
    strain,
    cycle,
    trends,
    workouts,
  })
}
