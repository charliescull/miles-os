import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient, USER_ID } from '@/lib/supabase'
import { isAuthenticatedFromRequest } from '@/lib/auth'
import { localDateKey } from '@/lib/localDateKey'

export async function GET(req: NextRequest) {
  if (!await isAuthenticatedFromRequest(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const date = req.nextUrl.searchParams.get('date') ?? localDateKey()
  const db = getServiceClient()

  const { data } = await db
    .from('daily_logs')
    .select('notes')
    .eq('user_id', USER_ID)
    .eq('log_date', date)
    .single()

  if (!data) return NextResponse.json({ done: [] })

  try {
    const notes = typeof data.notes === 'string' ? JSON.parse(data.notes) : data.notes
    return NextResponse.json(notes?.habits ?? { done: [] })
  } catch {
    return NextResponse.json({ done: [] })
  }
}
