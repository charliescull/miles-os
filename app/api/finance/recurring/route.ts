import { NextRequest, NextResponse } from 'next/server'
import { isAuthenticatedFromRequest } from '@/lib/auth'
import { listRecurring, upsertRecurring, setRecurringStatus, deleteRecurring, recurringSummary } from '@/lib/finance/recurring'

export const dynamic = 'force-dynamic'

// Recurring/bills CRUD (finance overhaul v2 §9). GET → { items, summary }; POST → upsert;
// PATCH { id, status } → cancel/pause/reactivate; DELETE ?id= → remove.
async function guard(req: NextRequest) {
  return isAuthenticatedFromRequest(req)
}

export async function GET(req: NextRequest) {
  if (!(await guard(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const [items, summary] = await Promise.all([listRecurring(true), recurringSummary()])
  return NextResponse.json({ items, summary })
}

export async function POST(req: NextRequest) {
  if (!(await guard(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const body = await req.json()
    if (!body?.name || !body?.category || !body?.type || body?.amount == null || !body?.cadence) {
      return NextResponse.json({ error: 'name, category, type, amount, cadence required' }, { status: 400 })
    }
    const row = await upsertRecurring({ ...body, amount: Number(body.amount) })
    return NextResponse.json({ ok: true, row })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'save failed' }, { status: 400 })
  }
}

export async function PATCH(req: NextRequest) {
  if (!(await guard(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id, status } = await req.json()
  if (!id || !status) return NextResponse.json({ error: 'id and status required' }, { status: 400 })
  await setRecurringStatus(id, status)
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  if (!(await guard(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  await deleteRecurring(id)
  return NextResponse.json({ ok: true })
}
