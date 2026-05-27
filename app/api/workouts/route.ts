import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient, USER_ID } from '@/lib/supabase'
import { isAuthenticatedFromRequest } from '@/lib/auth'

export async function GET(req: NextRequest) {
  if (!await isAuthenticatedFromRequest(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const days = parseInt(req.nextUrl.searchParams.get('days') ?? '10')
  const since = new Date()
  since.setDate(since.getDate() - (days - 1))
  const sinceStr = since.toISOString().split('T')[0]

  const db = getServiceClient()
  const { data, error } = await db
    .from('workouts')
    .select('date, workout_type')
    .eq('user_id', USER_ID)
    .gte('date', sinceStr)
    .order('date', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  if (!await isAuthenticatedFromRequest(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { date, workout_type } = await req.json()
  if (!date) return NextResponse.json({ error: 'date required' }, { status: 400 })

  const db = getServiceClient()
  const { data, error } = await db
    .from('workouts')
    .upsert({
      user_id: USER_ID,
      date,
      workout_type: workout_type ?? null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,date' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
