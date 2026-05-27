import { NextRequest, NextResponse } from 'next/server'
import { isAuthenticatedFromRequest } from '@/lib/auth'
import Anthropic from '@anthropic-ai/sdk'

const SYSTEM = `You are a nutrition and health analyst. Given a meal description, return only a JSON object with exactly these keys:
{
  "dish_name": "concise canonical name",
  "ingredients_parsed": ["ingredient 1", "ingredient 2"],
  "calories_kcal": 0,
  "protein_g": 0,
  "carbs_g": 0,
  "fat_g": 0,
  "food_score": 0,
  "score_tag": "2-4 word summary",
  "rationale": "1-2 sentence explanation of the score"
}
food_score is 0-100: higher = healthier and leaner. Score 80+ for lean high-protein whole foods, 50-79 for balanced meals, below 50 for calorie-dense or processed foods. No explanation outside the JSON.`

export async function POST(req: NextRequest) {
  if (!await isAuthenticatedFromRequest(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { text } = await req.json()
  if (!text?.trim()) return NextResponse.json({ error: 'text required' }, { status: 400 })

  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const msg = await anthropic.messages.create({
      model: process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6',
      max_tokens: 600,
      system: SYSTEM,
      messages: [{ role: 'user', content: text }],
    })

    const raw = msg.content[0].type === 'text' ? msg.content[0].text : '{}'
    const match = raw.match(/\{[\s\S]*\}/)
    if (!match) throw new Error('No JSON in response')
    const parsed = JSON.parse(match[0])

    return NextResponse.json({
      dish_name: String(parsed.dish_name ?? text.slice(0, 60)),
      ingredients_parsed: Array.isArray(parsed.ingredients_parsed) ? parsed.ingredients_parsed : [],
      calories_kcal: Number(parsed.calories_kcal) || 0,
      protein_g: Number(parsed.protein_g) || 0,
      carbs_g: Number(parsed.carbs_g) || 0,
      fat_g: Number(parsed.fat_g) || 0,
      food_score: Math.min(100, Math.max(0, Number(parsed.food_score) || 0)),
      score_tag: String(parsed.score_tag ?? ''),
      rationale: String(parsed.rationale ?? ''),
    })
  } catch (err) {
    console.error('Recipe analyze error:', err)
    return NextResponse.json({ error: 'Analysis failed' }, { status: 500 })
  }
}
