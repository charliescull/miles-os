import { NextRequest, NextResponse } from 'next/server'
import { isAuthenticatedFromRequest } from '@/lib/auth'
import { clearTokens } from '@/lib/whoop'

export async function POST(req: NextRequest) {
  if (!await isAuthenticatedFromRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  await clearTokens()
  return NextResponse.json({ ok: true })
}
