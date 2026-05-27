import { NextRequest, NextResponse } from 'next/server'
import { isAuthenticatedFromRequest } from '@/lib/auth'
import Anthropic from '@anthropic-ai/sdk'

export async function POST(req: NextRequest) {
  if (!await isAuthenticatedFromRequest(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { text } = await req.json()

  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const msg = await anthropic.messages.create({
      model: process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6',
      max_tokens: 256,
      system: 'You are a nutrition estimator. Given a food description, return only a JSON object with keys: kcal (number), protein (number grams), carbs (number grams), fat (number grams). No explanation, just JSON.',
      messages: [{ role: 'user', content: text }],
    })

    const raw = msg.content[0].type === 'text' ? msg.content[0].text : '{}'
    const match = raw.match(/\{[\s\S]*\}/)
    const parsed = match ? JSON.parse(match[0]) : { kcal: 0, protein: 0, carbs: 0, fat: 0 }

    return NextResponse.json({
      kcal: Number(parsed.kcal) || 0,
      protein: Number(parsed.protein) || 0,
      carbs: Number(parsed.carbs) || 0,
      fat: Number(parsed.fat) || 0,
    })
  } catch (err) {
    console.error('Nutrition estimate error:', err)
    return NextResponse.json({ kcal: 0, protein: 0, carbs: 0, fat: 0 })
  }
}
