import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { classifyCapture } from '@/lib/router/classifyCapture'
import { getServiceClient, USER_ID } from '@/lib/supabase'
import { embedAndStore } from '@/lib/memory'

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

export async function POST(req: NextRequest) {
  // Verify webhook secret
  const secret = req.headers.get('x-telegram-bot-api-secret-token')
  if (secret !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    return NextResponse.json({ ok: false }, { status: 403 })
  }

  const body = await req.json()
  const message = body.message
  if (!message) return NextResponse.json({ ok: true })

  // Verify sender is the authorized user
  const userId = message.from?.id?.toString()
  if (userId !== process.env.TELEGRAM_USER_ID) {
    return NextResponse.json({ ok: true }) // Silently ignore other users
  }

  const chatId: number = message.chat.id
  let text = message.text ?? ''

  // Handle voice messages
  if (message.voice || message.audio) {
    const fileId = (message.voice ?? message.audio).file_id
    try {
      const fileRes = await fetch(
        `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/getFile?file_id=${fileId}`
      )
      const { result } = await fileRes.json()
      const audioUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${result.file_path}`

      const audioRes = await fetch(audioUrl)
      const audioBlob = await audioRes.blob()

      const formData = new FormData()
      formData.append('file', audioBlob, 'audio.ogg')
      formData.append('model', 'whisper-1')

      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
      const transcription = await openai.audio.transcriptions.create({
        file: new File([audioBlob], 'audio.ogg', { type: 'audio/ogg' }),
        model: 'whisper-1',
      })
      text = transcription.text
    } catch (err) {
      console.error('Whisper error:', err)
      await sendTelegram(chatId, '❌ Could not transcribe audio. Please try again or send text.')
      return NextResponse.json({ ok: true })
    }
  }

  if (!text.trim()) {
    await sendTelegram(chatId, '⚠️ Empty message received.')
    return NextResponse.json({ ok: true })
  }

  // Classify
  const classification = await classifyCapture(text)

  // Write to DB (same pipeline as /api/capture)
  const db = getServiceClient()
  const { data: capture } = await db.from('raw_captures').insert({
    user_id: USER_ID,
    source: 'telegram',
    raw_text: text,
    classification,
    llm_source: 'anthropic',
    routed_to: classification.kind,
  }).select().single()

  // Route
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

  // Reply with confirmation + urgency keyboard
  const emoji = { task: '✅', blocker: '🚧', decision: '🤔', content: '📝', note: '📌', habit: '💪' }[classification.kind] ?? '📌'
  const reply = `${emoji} *${classification.kind.toUpperCase()}* captured\n\n_${classification.summary}_\n\nUrgency: *${classification.urgency.replace('_', ' ')}*`

  await sendTelegram(chatId, reply, { reply_markup: URGENCY_KEYBOARD })

  return NextResponse.json({ ok: true })
}
