import { NextRequest, NextResponse } from 'next/server'
import { isAuthenticatedFromRequest } from '@/lib/auth'
import { refreshAll } from '@/lib/finance/refresh'
import { assembleView } from '@/lib/finance/view'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Manual force-refresh (the refresh button on /finance).
export async function POST(req: NextRequest) {
  if (!(await isAuthenticatedFromRequest(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const blob = await refreshAll()
    const view = await assembleView(blob)
    return NextResponse.json(view)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Finance refresh failed' }, { status: 500 })
  }
}
