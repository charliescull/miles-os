import { NextRequest, NextResponse } from 'next/server'
import { isAuthenticatedFromRequest } from '@/lib/auth'
import { analyzeMeal } from '@/lib/nutrition/recipe'

export async function POST(req: NextRequest) {
  if (!await isAuthenticatedFromRequest(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { text } = await req.json()
  if (!text?.trim()) return NextResponse.json({ error: 'text required' }, { status: 400 })

  try {
    const analysis = await analyzeMeal(text)
    return NextResponse.json(analysis)
  } catch (err) {
    console.error('Recipe analyze error:', err)
    return NextResponse.json({ error: 'Analysis failed' }, { status: 500 })
  }
}
