import { classifyCapture } from '@/lib/router/classifyCapture'
import { classifyTelegramIntent } from '@/lib/router/telegramIntent'
import { getServiceClient, USER_ID } from '@/lib/supabase'
import { embedAndStore } from '@/lib/memory'
import { logStandardFood, type Macros, type LoggedMeal } from '@/lib/nutrition/foodLog'
import { analyzeAndSaveRecipe } from '@/lib/nutrition/recipe'
import { detectCompletionIntent, completeTaskByQuery } from '@/lib/tasks/taskIntent'
import { parseEventFromText, createCalendarEvent } from '@/lib/calendar/calendarWrite'
import { parseCommand } from '@/lib/router/commandParse'
import { createAppointmentFromText, changeAppointmentTime, cancelAppointment } from '@/lib/calendar/appointments'
import { applyTrade, getOpenShares } from '@/lib/finance/holdings'
import { getQuote } from '@/lib/finance/finnhub'
import { addSpend } from '@/lib/finance/spend'
import { localDateKey } from '@/lib/localDateKey'
import { randomUUID } from 'node:crypto'

// Single source of truth for routing a free-form TEXT message into the right place. Used by BOTH
// the Telegram webhook (text + transcribed voice) and the /api/quick endpoint (iOS Action Button
// dictation) so the two stay perfectly in sync. Photos are handled separately (vision) by the
// webhook. Returns a structured result + a Telegram-Markdown confirmation string; non-Telegram
// callers can strip the `*`/`_`.

export type RoutedTo =
  | 'task_done' | 'calendar' | 'food' | 'recipe'
  | 'task' | 'blocker' | 'content' | 'decision' | 'note' | 'habit'

export interface RouteResult {
  routedTo: RoutedTo
  confirmation: string
  /** true when it went through the capture pipeline (Telegram shows the urgency keyboard then). */
  isCapture: boolean
  /** Present when an idempotency key prevented new work from being performed. */
  idempotency?: 'processed' | 'in_progress'
}

const CAPTURE_KINDS = ['task', 'blocker', 'content', 'decision', 'note', 'habit'] as const

// Best-effort: record a handled message into raw_captures + memory embeddings so semantic search
// covers every branch, not just the capture pipeline.
async function assertCaptureClaim(source: string, idempotencyKey: string | null, processingToken: string | null) {
  if (!idempotencyKey) return
  const { data, error } = await getServiceClient()
    .from('capture_requests')
    .update({ updated_at: new Date().toISOString() })
    .eq('user_id', USER_ID)
    .eq('source', source)
    .eq('idempotency_key', idempotencyKey)
    .eq('status', 'processing')
    .eq('processing_token', processingToken)
    .select('id')
    .maybeSingle()
  if (error) throw error
  if (!data) throw new Error('Capture claim lost; retry with the same idempotency key')
}

async function updateCaptureClaim(
  source: string,
  idempotencyKey: string,
  processingToken: string,
  values: Record<string, string | null>,
) {
  const { data, error } = await getServiceClient()
    .from('capture_requests')
    .update(values)
    .eq('user_id', USER_ID)
    .eq('source', source)
    .eq('idempotency_key', idempotencyKey)
    .eq('status', 'processing')
    .eq('processing_token', processingToken)
    .select('id')
    .maybeSingle()
  if (error) throw error
  if (!data) throw new Error('Capture claim lost; retry with the same idempotency key')
}

async function insertOrGetCapture(values: Record<string, unknown>, source: string, idempotencyKey: string | null) {
  const db = getServiceClient()
  const { data, error } = await db.from('raw_captures').insert(values).select().maybeSingle()
  if (!error) return data
  if (!idempotencyKey) throw error

  // A worker can crash after this insert but before the rest of the pipeline.
  // Replays must reuse that capture row so embedding/audit can still finish.
  const { data: existing, error: lookupError } = await db.from('raw_captures')
    .select('*').eq('user_id', USER_ID).eq('source', source).eq('idempotency_key', idempotencyKey).maybeSingle()
  if (lookupError) throw lookupError
  if (!existing) throw error
  return existing
}

async function recordCapture(text: string, routedTo: string, source: string, routedId: string | null = null, idempotencyKey: string | null = null, processingToken: string | null = null) {
  try {
    await assertCaptureClaim(source, idempotencyKey, processingToken)
    const data = await insertOrGetCapture({
      user_id: USER_ID,
      source,
      raw_text: text,
      classification: { kind: routedTo },
      llm_source: 'anthropic',
      routed_to: routedTo,
      routed_id: routedId,
      idempotency_key: idempotencyKey,
    }, source, idempotencyKey)
    embedAndStore(text, 'capture', data?.id ?? null)
  } catch (err) {
    // Claim loss is a fencing signal, not a best-effort telemetry failure. Do
    // not let a worker that has been replaced report success to its caller.
    if (err instanceof Error && err.message.startsWith('Capture claim lost')) throw err
    console.error('recordCapture failed:', err)
  }
}

function foodConfirm(meal: LoggedMeal, totals: Macros): string {
  return `🍽️ *Logged:* ${meal.name}\n${meal.kcal} kcal · ${meal.protein}P / ${meal.carbs}C / ${meal.fat}F\n\n_Today:_ ${totals.kcal} kcal · ${totals.protein}P / ${totals.carbs}C / ${totals.fat}F`
}

export async function routeTextMessage(text: string, source = 'web', idempotencyKey: string | null = null, requestHash: string | null = null): Promise<RouteResult> {
  const processingToken = idempotencyKey ? randomUUID() : null
  if (idempotencyKey) {
    const db = getServiceClient()
    const { data, error } = await db.rpc('claim_capture_request', {
      p_user_id: USER_ID,
      p_source: source,
      p_idempotency_key: idempotencyKey,
      p_request_hash: requestHash,
      p_processing_token: processingToken,
      p_lease_seconds: 900,
    })
    if (error) throw error
    const claim = Array.isArray(data) ? data[0] : data
    if (!claim?.claimed) {
      return {
        routedTo: 'note',
        confirmation: claim?.status === 'completed' ? 'Already processed.' : 'Still processing; retry shortly.',
        isCapture: false,
        idempotency: claim?.status === 'completed' ? 'processed' : 'in_progress',
      }
    }
  }
  let heartbeatError: Error | null = null
  const heartbeat = idempotencyKey ? setInterval(() => {
    void assertCaptureClaim(source, idempotencyKey, processingToken).catch((error: unknown) => {
      heartbeatError = error instanceof Error ? error : new Error('Capture heartbeat failed')
    })
  }, 30_000) : null
  try {
    const result = await routeTextMessageOnce(text, source, idempotencyKey, processingToken)
    if (heartbeatError) throw heartbeatError
    await assertCaptureClaim(source, idempotencyKey, processingToken)
    if (idempotencyKey && processingToken) {
      await updateCaptureClaim(source, idempotencyKey, processingToken, {
        status: 'completed',
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        last_error: null,
      })
    }
    return result
  } catch (error) {
    if (idempotencyKey && processingToken) {
      try {
        await updateCaptureClaim(source, idempotencyKey, processingToken, {
          status: 'failed',
          updated_at: new Date().toISOString(),
          last_error: error instanceof Error ? error.message.slice(0, 500) : 'Capture failed',
        })
      } catch (finalizationError) {
        console.error('Capture failure state update failed:', finalizationError)
        throw new Error('Capture failed and its retry state could not be persisted', { cause: finalizationError })
      }
    }
    throw error
  } finally {
    if (heartbeat) clearInterval(heartbeat)
  }
}

async function routeTextMessageOnce(text: string, source: string, idempotencyKey: string | null, processingToken: string | null): Promise<RouteResult> {
  // Every mutating branch checks the fencing token immediately before its work. A
  // reclaimed request can therefore not continue using the old worker's claim.
  const assertClaim = () => assertCaptureClaim(source, idempotencyKey, processingToken)
  // 0. Explicit command grammar (deterministic, runs before the LLM router).
  const cmd = parseCommand(text)
  if (cmd) {
    if (cmd.kind === 'note') {
      await assertClaim()
      const db = getServiceClient()
      const today = localDateKey()
      const { data, error } = await db.from('notes').upsert({
        user_id: USER_ID, note_date: today, text: cmd.text,
        idempotency_key: idempotencyKey,
      }, { onConflict: 'user_id,idempotency_key', ignoreDuplicates: true }).select().maybeSingle()
      if (error) throw error
      await recordCapture(text, 'note', source, data?.id ?? null, idempotencyKey, processingToken)
      return { routedTo: 'note', confirmation: `🗒️ *Noted:* ${cmd.text}`, isCapture: false }
    }

    if (cmd.kind === 'set_appointment') {
      await assertClaim()
      const appt = await createAppointmentFromText(cmd.summary, cmd.when, cmd.freq, idempotencyKey)
      if (appt) {
        await recordCapture(text, 'calendar', source, appt.id, idempotencyKey, processingToken)
        const when = appt.all_day ? appt.start_local : appt.start_local.replace('T', ' ').slice(0, 16)
        const rep = appt.recurrence ? `\n_repeats: ${appt.recurrence.replace('FREQ=', '').toLowerCase()}_` : ''
        return { routedTo: 'calendar', confirmation: `📅 *Appointment set:* ${appt.summary}\n${when}${rep}`, isCapture: false }
      }
      // unparseable → fall through to normal routing
    }

    if (cmd.kind === 'change_appointment') {
      await assertClaim()
      const appt = await changeAppointmentTime(cmd.summary, cmd.newWhen)
      if (appt) {
        await recordCapture(text, 'calendar', source, appt.id, idempotencyKey, processingToken)
        const when = appt.all_day ? appt.start_local : appt.start_local.replace('T', ' ').slice(0, 16)
        return { routedTo: 'calendar', confirmation: `🔁 *Appointment moved:* ${appt.summary}\nnow ${when}`, isCapture: false }
      }
      return { routedTo: 'calendar', confirmation: `⚠️ Couldn't find an appointment matching "${cmd.summary}" to move.`, isCapture: false }
    }

    if (cmd.kind === 'cancel_appointment') {
      await assertClaim()
      const appt = await cancelAppointment(cmd.summary, cmd.when)
      if (appt) {
        await recordCapture(text, 'calendar', source, appt.id, idempotencyKey, processingToken)
        const when = appt.all_day ? appt.start_local : appt.start_local.replace('T', ' ').slice(0, 16)
        return { routedTo: 'calendar', confirmation: `🗑️ *Appointment canceled:* ${appt.summary}\n${when}`, isCapture: false }
      }
      return { routedTo: 'calendar', confirmation: `⚠️ Couldn't find an appointment matching "${cmd.summary}" to cancel.`, isCapture: false }
    }

    if (cmd.kind === 'trade') {
      await assertClaim()
      try {
        // Resolve "sold all" → current share count; resolve missing price → live quote.
        const shares = cmd.shares === 'all' ? await getOpenShares(cmd.ticker) : cmd.shares
        if (!(shares > 0)) {
          return { routedTo: 'calendar', confirmation: `⚠️ No ${cmd.ticker} shares to ${cmd.side}.`, isCapture: false }
        }
        let price = cmd.price
        if (price === null) {
          const q = await getQuote(cmd.ticker)
          price = q?.c ?? null
        }
        if (price === null) {
          return { routedTo: 'calendar', confirmation: `⚠️ Couldn't get a price for ${cmd.ticker}. Add one: "${cmd.side === 'buy' ? 'bought' : 'sold'} ${cmd.shares} ${cmd.ticker} @ <price>".`, isCapture: false }
        }
        await assertClaim()
        const res = await applyTrade({ ticker: cmd.ticker, side: cmd.side, shares, price, note: 'via telegram' })
        await recordCapture(text, 'calendar', source, res.holding.id, idempotencyKey, processingToken)
        const verb = cmd.side === 'buy' ? '🟢 *Bought*' : '🔴 *Sold*'
        const tail = res.closed ? '\n_position closed_' : `\n_now ${res.netShares} sh @ avg ${res.holding.avg_cost != null ? '$' + Number(res.holding.avg_cost).toFixed(2) : '—'}_`
        return { routedTo: 'calendar', confirmation: `${verb} ${shares} ${cmd.ticker} @ $${price.toFixed(2)}${tail}`, isCapture: false }
      } catch (e) {
        return { routedTo: 'calendar', confirmation: `⚠️ Trade failed: ${e instanceof Error ? e.message : 'error'}`, isCapture: false }
      }
    }

    if (cmd.kind === 'spend') {
      await assertClaim()
      const row = await addSpend({ amount: cmd.amount, merchant: cmd.merchant ?? undefined, category: cmd.category, source: 'telegram' })
      await recordCapture(text, 'note', source, row.id, idempotencyKey, processingToken)
      return { routedTo: 'note', confirmation: `💸 *Spent* $${cmd.amount.toFixed(2)}${cmd.merchant ? ` on ${cmd.merchant}` : ''} _(${cmd.category})_`, isCapture: false }
    }
  }

  // 1. Task check-off (regex; cheap & specific).
  const det = detectCompletionIntent(text)
  if (det.isCompletion) {
    await assertClaim()
    const { matched } = await completeTaskByQuery(det.query)
    if (matched) {
      await recordCapture(text, 'task_done', source, matched.id, idempotencyKey, processingToken)
      return { routedTo: 'task_done', confirmation: `✅ Checked off: *${matched.title}*`, isCapture: false }
    }
    // phrased like completion but nothing matched → fall through so it's still captured
  }

  // 2. Intent route.
  const intent = await classifyTelegramIntent(text)

  if (intent === 'calendar') {
    const event = await parseEventFromText(text)
    if (event) {
      await assertClaim()
      const created = await createCalendarEvent(event, idempotencyKey)
      await recordCapture(text, 'calendar', source, null, idempotencyKey, processingToken)
      const when = created.allDay ? created.start : created.start.replace('T', ' ').slice(0, 16)
      return { routedTo: 'calendar', confirmation: `📅 *Event created:* ${created.summary}\n${when}\n${created.htmlLink}`, isCapture: false }
    }
    // not actually schedulable → fall through to capture
  }

  if (intent === 'food') {
    await assertClaim()
    const { meal, totals } = await logStandardFood(text, undefined, idempotencyKey)
    await recordCapture(text, 'food', source, null, idempotencyKey, processingToken)
    return { routedTo: 'food', confirmation: foodConfirm(meal, totals), isCapture: false }
  }

  if (intent === 'recipe') {
    try {
      await assertClaim()
      const r = await analyzeAndSaveRecipe(text, idempotencyKey)
      await recordCapture(text, 'recipe', source, r.id, idempotencyKey, processingToken)
      return {
        routedTo: 'recipe',
        confirmation: `📖 *Recipe saved:* ${r.dish_name}\n${r.calories_kcal} kcal · ${r.protein_g}P / ${r.carbs_g}C / ${r.fat_g}F\nScore: *${r.food_score}* — ${r.score_tag}`,
        isCapture: false,
      }
    } catch (err) {
      console.error('Recipe save failed, falling back to capture:', err)
      // fall through
    }
  }

  // 3. Default: capture pipeline (classify → tasks OR daily_logs notes → embed → audit).
  return captureText(text, source, idempotencyKey, processingToken)
}

async function captureText(text: string, source: string, idempotencyKey: string | null, processingToken: string | null): Promise<RouteResult> {
  const db = getServiceClient()
  await assertCaptureClaim(source, idempotencyKey, processingToken)
  const classification = await classifyCapture(text)

  const capture = await insertOrGetCapture({
    user_id: USER_ID,
    source,
    raw_text: text,
    classification,
    llm_source: 'anthropic',
    routed_to: classification.kind,
      idempotency_key: idempotencyKey,
  }, source, idempotencyKey)

  let routedId: string | null = null
  if (['task', 'blocker', 'content', 'decision'].includes(classification.kind)) {
    await assertCaptureClaim(source, idempotencyKey, processingToken)
  const { data: task, error: taskError } = await db.from('tasks').upsert({
      user_id: USER_ID,
      title: classification.summary,
      urgency: classification.urgency,
      is_key: classification.is_key,
      tags: classification.tags,
      owner: classification.owner,
      kind: classification.kind,
      status: classification.kind === 'blocker' ? 'blocked' : 'open',
      priority_score: classification.is_key ? 100 : 50,
      idempotency_key: idempotencyKey,
    }, { onConflict: 'user_id,idempotency_key', ignoreDuplicates: true }).select().maybeSingle()
    if (taskError) throw taskError
    if (task) routedId = task.id
  } else {
    // note / habit → today's daily_logs.notes.captures
    const today = localDateKey()
    const { data: existing } = await db
      .from('daily_logs').select('notes').eq('user_id', USER_ID).eq('log_date', today).single()
    const notes = existing?.notes
      ? (typeof existing.notes === 'string' ? JSON.parse(existing.notes) : existing.notes)
      : {}
    const capturesList = notes.captures ?? []
    capturesList.push({ id: capture?.id, text, ts: new Date().toISOString() })
    await assertCaptureClaim(source, idempotencyKey, processingToken)
    await db.from('daily_logs').upsert({
      user_id: USER_ID,
      log_date: today,
      notes: JSON.stringify({ ...notes, captures: capturesList }),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,log_date' })
  }

  if (capture?.id && routedId) {
    await db.from('raw_captures').update({ routed_id: routedId }).eq('id', capture.id)
  }

  await assertCaptureClaim(source, idempotencyKey, processingToken)
  embedAndStore(text, 'capture', capture?.id ?? null)

  await db.from('audit_log').insert({
    user_id: USER_ID,
    action: 'capture',
    resource_type: 'raw_captures',
    resource_id: capture?.id,
    metadata: { kind: classification.kind, urgency: classification.urgency, source },
  })

  const emoji = { task: '✅', blocker: '🚧', decision: '🤔', content: '📝', note: '📌', habit: '💪' }[classification.kind] ?? '📌'
  const confirmation = `${emoji} *${classification.kind.toUpperCase()}* captured\n\n_${classification.summary}_\n\nUrgency: *${classification.urgency.replace('_', ' ')}*`
  return {
    routedTo: classification.kind as RoutedTo,
    confirmation,
    isCapture: CAPTURE_KINDS.includes(classification.kind as typeof CAPTURE_KINDS[number]),
  }
}
