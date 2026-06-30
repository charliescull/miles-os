import { NextRequest, NextResponse } from 'next/server'
import { isAuthenticatedFromRequest } from '@/lib/auth'
import { expandAppointments, addDays } from '@/lib/calendar/appointments'

export const dynamic = 'force-dynamic'

// Calendar events from the Supabase mirror, shaped like /api/calendar's iCal output
// so the COMMAND calendar can merge both. Recurring rows are expanded in the lib.
export async function GET(req: NextRequest) {
  if (!await isAuthenticatedFromRequest(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const sp = req.nextUrl.searchParams
  const today = new Date().toISOString().slice(0, 10)
  const from = sp.get('from') ?? addDays(today, -1)
  const to = sp.get('to') ?? addDays(today, 30)
  const events = await expandAppointments(from, to)
  return NextResponse.json(events, { headers: { 'cache-control': 'no-store' } })
}
