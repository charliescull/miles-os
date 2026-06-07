import Anthropic from '@anthropic-ai/sdk'
import { getServiceClient, USER_ID } from '@/lib/supabase'
import { localDateKey } from '@/lib/localDateKey'

// Recipe analysis + save, extracted so the Telegram bot and the web app share one path.
// `analyzeMeal` is the canonical analyzer (app/api/recipes/analyze uses it too).
// `analyzeAndSaveRecipe` analyzes + saves to the recipes library + merges macros into today's
// nutrition log (same merge the /api/recipes POST does for the web UI).

export interface MealAnalysis {
  dish_name: string
  ingredients_parsed: string[]
  calories_kcal: number
  protein_g: number
  carbs_g: number
  fat_g: number
  food_score: number
  score_tag: string
  rationale: string
}

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

export async function analyzeMeal(text: string): Promise<MealAnalysis> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const msg = await anthropic.messages.create({
    model: process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6',
    max_tokens: 600,
    system: SYSTEM,
    messages: [{ role: 'user', content: text }],
  })
  const raw = msg.content[0]?.type === 'text' ? msg.content[0].text : '{}'
  const match = raw.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('No JSON in recipe analysis')
  const parsed = JSON.parse(match[0])
  return {
    dish_name: String(parsed.dish_name ?? text.slice(0, 60)),
    ingredients_parsed: Array.isArray(parsed.ingredients_parsed) ? parsed.ingredients_parsed : [],
    calories_kcal: Number(parsed.calories_kcal) || 0,
    protein_g: Number(parsed.protein_g) || 0,
    carbs_g: Number(parsed.carbs_g) || 0,
    fat_g: Number(parsed.fat_g) || 0,
    food_score: Math.min(100, Math.max(0, Number(parsed.food_score) || 0)),
    score_tag: String(parsed.score_tag ?? ''),
    rationale: String(parsed.rationale ?? ''),
  }
}

function timeLabel(): string {
  const tz = process.env.USER_TIMEZONE ?? 'UTC'
  return new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz })
}

export interface SavedRecipe extends MealAnalysis {
  id: string
}

// Analyze, save to the recipe library, and merge the macros into today's nutrition log.
export async function analyzeAndSaveRecipe(rawInput: string): Promise<SavedRecipe> {
  const analysis = await analyzeMeal(rawInput)
  const db = getServiceClient()

  const { data: recipe, error } = await db
    .from('recipes')
    .insert({
      user_id: USER_ID,
      raw_input: rawInput,
      dish_name: analysis.dish_name,
      ingredients: analysis.ingredients_parsed,
      calories_kcal: analysis.calories_kcal,
      protein_g: analysis.protein_g,
      carbs_g: analysis.carbs_g,
      fat_g: analysis.fat_g,
      food_score: analysis.food_score,
      score_tag: analysis.score_tag,
      rationale: analysis.rationale,
      taste_rating: null,
    })
    .select()
    .single()
  if (error) throw new Error(error.message)

  // Merge into today's nutrition log so NutritionCard picks it up (same as /api/recipes POST).
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
    time: timeLabel(),
    name: analysis.dish_name,
    kcal: analysis.calories_kcal,
    protein: analysis.protein_g,
    carbs: analysis.carbs_g,
    fat: analysis.fat_g,
    estimated: true,
  }
  await db.from('daily_logs').upsert(
    {
      user_id: USER_ID,
      log_date: today,
      notes: JSON.stringify({ ...currentNotes, nutrition: { ...(currentNotes.nutrition ?? {}), meals: [...existingMeals, newMeal] } }),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,log_date' }
  )

  return { id: recipe.id, ...analysis }
}
