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
}

const CAPTURE_KINDS = ['task', 'blocker', 'content', 'decision', 'note', 'habit'] as const

// Best-effort: record a handled message into raw_captures + memory embeddings so semantic search
// covers every branch, not just the capture pipeline.
async function recordCapture(text: string, routedTo: string, source: string, routedId: string | null = null) {
  try {
    const db = getServiceClient()
    const { data } = await db.from('raw_captures').insert({
      user_id: USER_ID,
      source,
      raw_text: text,
      classification: { kind: routedTo },
      llm_source: 'anthropic',
      routed_to: routedTo,
      routed_id: routedId,
    }).select().single()
    embedAndStore(text, 'capture', data?.id ?? null)
  } catch (err) {
    console.error('recordCapture failed:', err)
  }
}

function foodConfirm(meal: LoggedMeal, totals: Macros): string {
  return `🍽️ *Logged:* ${meal.name}\n${meal.kcal} kcal · ${meal.protein}P / ${meal.carbs}C / ${meal.fat}F\n\n_Today:_ ${totals.kcal} kcal · ${totals.protein}P / ${totals.carbs}C / ${totals.fat}F`
}

export async function routeTextMessage(text: string, source = 'web'): Promise<RouteResult> {
  // 0. Explicit command grammar (deterministic, runs before the LLM router).
  const cmd = parseCommand(text)
  if (cmd) {
    if (cmd.kind === 'note') {
      const db = getServiceClient()
      const today = localDateKey()
      const { data } = await db.from('notes').insert({
        user_id: USER_ID, note_date: today, text: cmd.text,
      }).select().single()
      await recordCapture(text, 'note', source, data?.id ?? null)
      return { routedTo: 'note', confirmation: `🗒️ *Noted:* ${cmd.text}`, isCapture: false }
    }

    if (cmd.kind === 'set_appointment') {
      const appt = await createAppointmentFromText(cmd.summary, cmd.when, cmd.freq)
      if (appt) {
        await recordCapture(text, 'calendar', source, appt.id)
        const when = appt.all_day ? appt.start_local : appt.start_local.replace('T', ' ').slice(0, 16)
        const rep = appt.recurrence ? `\n_repeats: ${appt.recurrence.replace('FREQ=', '').toLowerCase()}_` : ''
        return { routedTo: 'calendar', confirmation: `📅 *Appointment set:* ${appt.summary}\n${when}${rep}`, isCapture: false }
      }
      // unparseable → fall through to normal routing
    }

    if (cmd.kind === 'change_appointment') {
      const appt = await changeAppointmentTime(cmd.summary, cmd.newWhen)
      if (appt) {
        await recordCapture(text, 'calendar', source, appt.id)
        const when = appt.all_day ? appt.start_local : appt.start_local.replace('T', ' ').slice(0, 16)
        return { routedTo: 'calendar', confirmation: `🔁 *Appointment moved:* ${appt.summary}\nnow ${when}`, isCapture: false }
      }
      return { routedTo: 'calendar', confirmation: `⚠️ Couldn't find an appointment matching "${cmd.summary}" to move.`, isCapture: false }
    }

    if (cmd.kind === 'cancel_appointment') {
      const appt = await cancelAppointment(cmd.summary, cmd.when)
      if (appt) {
        await recordCapture(text, 'calendar', source, appt.id)
        const when = appt.all_day ? appt.start_local : appt.start_local.replace('T', ' ').slice(0, 16)
        return { routedTo: 'calendar', confirmation: `🗑️ *Appointment canceled:* ${appt.summary}\n${when}`, isCapture: false }
      }
      return { routedTo: 'calendar', confirmation: `⚠️ Couldn't find an appointment matching "${cmd.summary}" to cancel.`, isCapture: false }
    }

    if (cmd.kind === 'trade') {
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
        const res = await applyTrade({ ticker: cmd.ticker, side: cmd.side, shares, price, note: 'via telegram' })
        await recordCapture(text, 'calendar', source, res.holding.id)
        const verb = cmd.side === 'buy' ? '🟢 *Bought*' : '🔴 *Sold*'
        const tail = res.closed ? '\n_position closed_' : `\n_now ${res.netShares} sh @ avg ${res.holding.avg_cost != null ? '$' + Number(res.holding.avg_cost).toFixed(2) : '—'}_`
        return { routedTo: 'calendar', confirmation: `${verb} ${shares} ${cmd.ticker} @ $${price.toFixed(2)}${tail}`, isCapture: false }
      } catch (e) {
        return { routedTo: 'calendar', confirmation: `⚠️ Trade failed: ${e instanceof Error ? e.message : 'error'}`, isCapture: false }
      }
    }

    if (cmd.kind === 'spend') {
      const row = await addSpend({ amount: cmd.amount, merchant: cmd.merchant ?? undefined, category: cmd.category, source: 'telegram' })
      await recordCapture(text, 'note', source, row.id)
      return { routedTo: 'note', confirmation: `💸 *Spent* $${cmd.amount.toFixed(2)}${cmd.merchant ? ` on ${cmd.merchant}` : ''} _(${cmd.category})_`, isCapture: false }
    }
  }

  // 1. Task check-off (regex; cheap & specific).
  const det = detectCompletionIntent(text)
  if (det.isCompletion) {
    const { matched } = await completeTaskByQuery(det.query)
    if (matched) {
      await recordCapture(text, 'task_done', source, matched.id)
      return { routedTo: 'task_done', confirmation: `✅ Checked off: *${matched.title}*`, isCapture: false }
    }
    // phrased like completion but nothing matched → fall through so it's still captured
  }

  // 2. Intent route.
  const intent = await classifyTelegramIntent(text)

  if (intent === 'calendar') {
    const event = await parseEventFromText(text)
    if (event) {
      const created = await createCalendarEvent(event)
      await recordCapture(text, 'calendar', source)
      const when = created.allDay ? created.start : created.start.replace('T', ' ').slice(0, 16)
      return { routedTo: 'calendar', confirmation: `📅 *Event created:* ${created.summary}\n${when}\n${created.htmlLink}`, isCapture: false }
    }
    // not actually schedulable → fall through to capture
  }

  if (intent === 'food') {
    const { meal, totals } = await logStandardFood(text)
    await recordCapture(text, 'food', source)
    return { routedTo: 'food', confirmation: foodConfirm(meal, totals), isCapture: false }
  }

  if (intent === 'recipe') {
    try {
      const r = await analyzeAndSaveRecipe(text)
      await recordCapture(text, 'recipe', source, r.id)
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
  return captureText(text, source)
}

async function captureText(text: string, source: string): Promise<RouteResult> {
  const db = getServiceClient()
  const classification = await classifyCapture(text)

  const { data: capture } = await db.from('raw_captures').insert({
    user_id: USER_ID,
    source,
    raw_text: text,
    classification,
    llm_source: 'anthropic',
    routed_to: classification.kind,
  }).select().single()

  let routedId: string | null = null
  if (['task', 'blocker', 'content', 'decision'].includes(classification.kind)) {
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
    // note / habit → today's daily_logs.notes.captures
    const today = localDateKey()
    const { data: existing } = await db
      .from('daily_logs').select('notes').eq('user_id', USER_ID).eq('log_date', today).single()
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

  if (capture?.id && routedId) {
    await db.from('raw_captures').update({ routed_id: routedId }).eq('id', capture.id)
  }

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
