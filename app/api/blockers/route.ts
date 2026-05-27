import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient, USER_ID } from '@/lib/supabase'
import { isAuthenticatedFromRequest } from '@/lib/auth'

export async function GET(req: NextRequest) {
  if (!await isAuthenticatedFromRequest(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = getServiceClient()
  const { data, error } = await db
    .from('tasks')
    .select('*')
    .eq('user_id', USER_ID)
    .eq('status', 'blocked')
    .order('created_at', { ascending: true })
    .limit(20)

  if (error) return NextResponse.json([], { status: 200 })

  const blockers = (data ?? []).map(t => {
    const stuckDays = t.created_at
      ? Math.floor((Date.now() - new Date(t.created_at).getTime()) / 86400000)
      : 0
    const temp = stuckDays > 7 ? 'HOT' : stuckDays > 3 ? 'WARM' : 'COOL'
    return {
      id: t.id,
      title: t.title,
      owner: t.owner ?? 'You',
      stuck_days: stuckDays,
      temperature: temp,
    }
  })

  return NextResponse.json(blockers)
}
