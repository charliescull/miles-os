import { NextRequest, NextResponse } from 'next/server'
import { isAuthenticatedFromRequest } from '@/lib/auth'
import Anthropic from '@anthropic-ai/sdk'

export async function POST(req: NextRequest) {
  if (!await isAuthenticatedFromRequest(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { name, kcal } = await req.json()

  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const msg = await anthropic.messages.create({
      model: process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6',
      output_config: { effort: 'max' },
      max_tokens: 128,
      system: 'You are a nutrition estimator. Given a food name and a calorie target, return only a JSON object with keys: protein (grams), carbs (grams), fat (grams). Distribute macros realistically for that food. No explanation, just JSON.',
      messages: [{ role: 'user', content: `Food: "${name}", Calories: ${kcal}` }],
    })

    const raw = msg.content[0].type === 'text' ? msg.content[0].text : '{}'
    const match = raw.match(/\{[\s\S]*\}/)
    const parsed = match ? JSON.parse(match[0]) : { protein: 0, carbs: 0, fat: 0 }

    return NextResponse.json({
      protein: Number(parsed.protein) || 0,
      carbs: Number(parsed.carbs) || 0,
      fat: Number(parsed.fat) || 0,
    })
  } catch {
    return NextResponse.json({ protein: 0, carbs: 0, fat: 0 })
  }
}
