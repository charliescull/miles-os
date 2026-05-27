import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient, USER_ID } from '@/lib/supabase'
import { isAuthenticatedFromRequest } from '@/lib/auth'
import { localDateKey } from '@/lib/localDateKey'

export async function GET(req: NextRequest) {
  if (!await isAuthenticatedFromRequest(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const limit = parseInt(req.nextUrl.searchParams.get('limit') ?? '10')
  const before = req.nextUrl.searchParams.get('before')

  const db = getServiceClient()
  let q = db
    .from('recipes')
    .select('*')
    .eq('user_id', USER_ID)
    .order('created_at', { ascending: false })
    .limit(limit + 1)

  if (before) q = q.lt('created_at', before)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = data ?? []
  const hasMore = rows.length > limit
  return NextResponse.json({ recipes: rows.slice(0, limit), hasMore })
}

export async function POST(req: NextRequest) {
  if (!await isAuthenticatedFromRequest(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const db = getServiceClient()

  // Save to recipes table
  const { data: recipe, error } = await db
    .from('recipes')
    .insert({
      user_id: USER_ID,
      raw_input: body.raw_input,
      dish_name: body.dish_name,
      ingredients: body.ingredients_parsed ?? [],
      calories_kcal: body.calories_kcal,
      protein_g: body.protein_g,
      carbs_g: body.carbs_g,
      fat_g: body.fat_g,
      food_score: body.food_score,
      score_tag: body.score_tag,
      rationale: body.rationale,
      taste_rating: body.taste_rating ?? null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Also merge macros into today's nutrition log so NutritionCard picks it up
  const today = localDateKey()
  const { data: existing } = await db
    .from('daily_logs')
    .select('notes')
    .eq('user_id', USER_ID)
    .eq('log_date', today)
    .single()

  const currentNotes = existing?.notes
    ? (typeof existing.notes === 'string' ? JSON.parse(existing.notes) : existing.notes)
    : {}

  const existingMeals = currentNotes?.nutrition?.meals ?? []
  const newMeal = {
    id: recipe.id,
    time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }),
    name: body.dish_name ?? body.raw_input,
    kcal: body.calories_kcal ?? 0,
    protein: body.protein_g ?? 0,
    carbs: body.carbs_g ?? 0,
    fat: body.fat_g ?? 0,
    estimated: true,
  }

  await db.from('daily_logs').upsert({
    user_id: USER_ID,
    log_date: today,
    notes: JSON.stringify({ ...currentNotes, nutrition: { meals: [...existingMeals, newMeal] } }),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id,log_date' })

  return NextResponse.json(recipe, { status: 201 })
}

export async function DELETE(req: NextRequest) {
  if (!await isAuthenticatedFromRequest(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const db = getServiceClient()
  const { error } = await db
    .from('recipes')
    .delete()
    .eq('id', id)
    .eq('user_id', USER_ID)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
