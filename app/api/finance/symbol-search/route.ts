import { NextRequest, NextResponse } from 'next/server'
import { isAuthenticatedFromRequest } from '@/lib/auth'
import { searchSymbols } from '@/lib/finance/finnhub'

export const dynamic = 'force-dynamic'

// Ticker autocomplete for the TradeForm (Finnhub /search). Fails soft to [].
export async function GET(req: NextRequest) {
  if (!(await isAuthenticatedFromRequest(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const q = req.nextUrl.searchParams.get('q') ?? ''
  return NextResponse.json({ matches: await searchSymbols(q) })
}
