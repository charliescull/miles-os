import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient, USER_ID } from '@/lib/supabase'
import { isAuthenticatedFromRequest } from '@/lib/auth'
import { classifyCapture } from '@/lib/router/classifyCapture'
import { embedAndStore } from '@/lib/memory'
import { localDateKey } from '@/lib/localDateKey'

export async function POST(req: NextRequest) {
  if (!await isAuthenticatedFromRequest(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { text, source = 'web', audio_url } = await req.json()
  if (!text?.trim()) return NextResponse.json({ error: 'Empty text' }, { status: 400 })

  const db = getServiceClient()
  const classification = await classifyCapture(text)

  // Write raw capture
  const { data: capture, error: capErr } = await db.from('raw_captures').insert({
    user_id: USER_ID,
    source,
    raw_text: text,
    audio_url,
    classification,
    llm_source: 'anthropic',
    routed_to: classification.kind,
  }).select().single()

  if (capErr) console.error('raw_captures insert error:', capErr)

  // Route to downstream table
  let routedId: string | null = null

  if (classification.kind === 'task' || classification.kind === 'blocker' || classification.kind === 'content' || classification.kind === 'decision') {
    const { data: task } = await db.from('tasks').insert({
      user_id: USER_ID,
      title: classification.summary,
      urgency: classification.urgency,
      is_key: classification.is_key,
      tags: classification.tags,
      owner: classification.owner,
      kind: classification.kind,
      status: classification.kind === 'blocker' ? 'blocked' : 'open',
      priority_score: classification.is_key ? 100 : 50,
    }).select().single()

    if (task) routedId = task.id
  } else {
    // note / habit — write to daily_log notes
    const today = localDateKey()
    const { data: existing } = await db
      .from('daily_logs')
      .select('notes')
      .eq('user_id', USER_ID)
      .eq('log_date', today)
      .single()

    const notes = existing?.notes
      ? (typeof existing.notes === 'string' ? JSON.parse(existing.notes) : existing.notes)
      : {}

    const capturesList = notes.captures ?? []
    capturesList.push({ id: capture?.id, text, ts: new Date().toISOString() })

    await db.from('daily_logs').upsert({
      user_id: USER_ID,
      log_date: today,
      notes: JSON.stringify({ ...notes, captures: capturesList }),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,log_date' })
  }

  // Update routed_id on raw capture
  if (capture?.id && routedId) {
    await db.from('raw_captures').update({ routed_id: routedId }).eq('id', capture.id)
  }

  // Embed to memory (fire and forget)
  embedAndStore(text, 'capture', capture?.id ?? null)

  // Audit log
  await db.from('audit_log').insert({
    user_id: USER_ID,
    action: 'capture',
    resource_type: 'raw_captures',
    resource_id: capture?.id,
    metadata: { kind: classification.kind, urgency: classification.urgency },
  })

  return NextResponse.json({
    ok: true,
    classification,
    routed_to: classification.kind,
    routed_id: routedId,
  })
}
