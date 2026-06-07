import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { classifyCapture } from '@/lib/router/classifyCapture'
import { classifyTelegramIntent } from '@/lib/router/telegramIntent'
import { getServiceClient, USER_ID } from '@/lib/supabase'
import { embedAndStore } from '@/lib/memory'
import { fetchTelegramImage, analyzeImage } from '@/lib/vision/analyzeImage'
import { saveWorkoutDetail } from '@/lib/workouts/saveWorkout'
import { logStandardFood, type Macros, type LoggedMeal } from '@/lib/nutrition/foodLog'
import { analyzeAndSaveRecipe } from '@/lib/nutrition/recipe'
import { detectCompletionIntent, completeTaskByQuery } from '@/lib/tasks/taskIntent'
import { parseEventFromText, createCalendarEvent } from '@/lib/calendar/calendarWrite'
import { localDateKey } from '@/lib/localDateKey'

async function sendTelegram(chatId: number, text: string, extra?: Record<string, unknown>) {
  await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown', ...extra }),
  })
}

const URGENCY_KEYBOARD = {
  inline_keyboard: [[
    { text: '🔴 Today', callback_data: 'urgency:today' },
    { text: '🟡 This Week', callback_data: 'urgency:this_week' },
    { text: '🔵 This Month', callback_data: 'urgency:this_month' },
  ], [
    { text: '⚪ Someday', callback_data: 'urgency:someday' },
    { text: '🔑 Key', callback_data: 'urgency:key' },
  ]],
}

// Best-effort: record any handled message into raw_captures + memory embeddings so semantic
// search ("what did I eat tuesday?") covers bot input regardless of which branch handled it.
async function recordCapture(text: string, routedTo: string, routedId: string | null = null) {
  try {
    const db = getServiceClient()
    const { data } = await db.from('raw_captures').insert({
      user_id: USER_ID,
      source: 'telegram',
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

async function handlePhoto(chatId: number, fileId: string, caption: string) {
  const image = await fetchTelegramImage(fileId)
  const result = await analyzeImage([image], caption)

  if (result.kind === 'workout') {
    const date = localDateKey()
    const saved = await saveWorkoutDetail(date, result.title, result.exercises)
    await recordCapture(`[workout] ${result.title}`, 'workout')
    const lines = result.exercises.slice(0, 12).map(e => `• ${e.name}${e.raw ? ` — ${e.raw}` : ''}`).join('\n')
    const more = saved.count > 12 ? `\n…+${saved.count - 12} more` : ''
    await sendTelegram(chatId, `💪 *Workout logged:* ${result.title}\n_${saved.count} exercises_\n\n${lines}${more}`)
    return
  }

  if (result.kind === 'meal') {
    // A "recipe" caption upgrades a meal photo to the recipe library; otherwise standard log.
    if (/\brecipe\b/i.test(caption)) {
      const r = await analyzeAndSaveRecipe(result.description)
      await recordCapture(`[recipe] ${r.dish_name}`, 'recipe', r.id)
      await sendTelegram(chatId, `📖 *Recipe saved:* ${r.dish_name}\n${r.calories_kcal} kcal · ${r.protein_g}P / ${r.carbs_g}C / ${r.fat_g}F\nScore: *${r.food_score}* — ${r.score_tag}`)
      return
    }
    const { meal, totals } = await logStandardFood(result.description, result.macros)
    await recordCapture(`[meal] ${result.description}`, 'food')
    await sendTelegram(chatId, foodConfirm(meal, totals))
    return
  }

  await sendTelegram(chatId, "🤔 I couldn't tell if that was a workout or a meal. Try a clearer photo, or describe it in text.")
}

async function transcribeVoice(fileId: string): Promise<string> {
  const fileRes = await fetch(
    `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/getFile?file_id=${fileId}`
  )
  const { result } = await fileRes.json()
  const audioUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${result.file_path}`
  const audioRes = await fetch(audioUrl)
  const audioBlob = await audioRes.blob()
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  const transcription = await openai.audio.transcriptions.create({
    file: new File([audioBlob], 'audio.ogg', { type: 'audio/ogg' }),
    model: 'whisper-1',
  })
  return transcription.text
}

export async function POST(req: NextRequest) {
  // Security boundary — DO NOT weaken.
  const secret = req.headers.get('x-telegram-bot-api-secret-token')
  if (secret !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    return NextResponse.json({ ok: false }, { status: 403 })
  }

  const body = await req.json()
  const message = body.message
  if (!message) return NextResponse.json({ ok: true }) // ignore callbacks/edits/etc.

  // Authorized user only — DO NOT weaken.
  const userId = message.from?.id?.toString()
  if (userId !== process.env.TELEGRAM_USER_ID) {
    return NextResponse.json({ ok: true }) // silently ignore other users
  }

  const chatId: number = message.chat.id

  try {
    // ---- PHOTO → vision (workout / meal / recipe) ----
    if (Array.isArray(message.photo) && message.photo.length) {
      const fileId = message.photo[message.photo.length - 1].file_id // last = highest resolution
      await handlePhoto(chatId, fileId, (message.caption ?? '').trim())
      return NextResponse.json({ ok: true })
    }

    // ---- text or voice ----
    let text = message.text ?? ''
    if (message.voice || message.audio) {
      try {
        text = await transcribeVoice((message.voice ?? message.audio).file_id)
      } catch (err) {
        console.error('Whisper error:', err)
        await sendTelegram(chatId, '❌ Could not transcribe audio. Please try again or send text.')
        return NextResponse.json({ ok: true })
      }
    }
    text = text.trim()
    if (!text) {
      await sendTelegram(chatId, '⚠️ Empty message received.')
      return NextResponse.json({ ok: true })
    }

    // ---- 1. Task check-off (regex; cheap & specific) ----
    const det = detectCompletionIntent(text)
    if (det.isCompletion) {
      const { matched } = await completeTaskByQuery(det.query)
      if (matched) {
        await recordCapture(text, 'task_done', matched.id)
        await sendTelegram(chatId, `✅ Checked off: *${matched.title}*`)
        return NextResponse.json({ ok: true })
      }
      // phrased like completion but no task matched → fall through so it's still captured
    }

    // ---- 2. Intent route (calendar / food / recipe / capture) ----
    const intent = await classifyTelegramIntent(text)

    if (intent === 'calendar') {
      const event = await parseEventFromText(text)
      if (event) {
        const created = await createCalendarEvent(event)
        await recordCapture(text, 'calendar')
        const when = created.allDay ? created.start : created.start.replace('T', ' ').slice(0, 16)
        await sendTelegram(chatId, `📅 *Event created:* ${created.summary}\n${when}\n[Open in Calendar](${created.htmlLink})`)
        return NextResponse.json({ ok: true })
      }
      // not actually schedulable → fall through to capture
    }

    if (intent === 'food') {
      const { meal, totals } = await logStandardFood(text)
      await recordCapture(text, 'food')
      await sendTelegram(chatId, foodConfirm(meal, totals))
      return NextResponse.json({ ok: true })
    }

    if (intent === 'recipe') {
      try {
        const r = await analyzeAndSaveRecipe(text)
        await recordCapture(text, 'recipe', r.id)
        await sendTelegram(chatId, `📖 *Recipe saved:* ${r.dish_name}\n${r.calories_kcal} kcal · ${r.protein_g}P / ${r.carbs_g}C / ${r.fat_g}F\nScore: *${r.food_score}* — ${r.score_tag}`)
        return NextResponse.json({ ok: true })
      } catch (err) {
        console.error('Recipe save failed, falling back to capture:', err)
        // fall through to capture
      }
    }

    // ---- 3. Default: existing capture pipeline (classify → tasks/notes → embed) ----
    const classification = await classifyCapture(text)
    const db = getServiceClient()
    const { data: capture } = await db.from('raw_captures').insert({
      user_id: USER_ID,
      source: 'telegram',
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
    }

    if (capture?.id && routedId) {
      await db.from('raw_captures').update({ routed_id: routedId }).eq('id', capture.id)
    }

    embedAndStore(text, 'capture', capture?.id ?? null)

    const emoji = { task: '✅', blocker: '🚧', decision: '🤔', content: '📝', note: '📌', habit: '💪' }[classification.kind] ?? '📌'
    const reply = `${emoji} *${classification.kind.toUpperCase()}* captured\n\n_${classification.summary}_\n\nUrgency: *${classification.urgency.replace('_', ' ')}*`
    await sendTelegram(chatId, reply, { reply_markup: URGENCY_KEYBOARD })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Telegram webhook error:', err)
    await sendTelegram(chatId, '❌ Something went wrong handling that message.')
    return NextResponse.json({ ok: true }) // always 200 so Telegram does not retry-storm
  }
}
