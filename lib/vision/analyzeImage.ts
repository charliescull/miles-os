import Anthropic from '@anthropic-ai/sdk'
import type { ExerciseInput } from '@/lib/workouts/saveWorkout'
import type { Macros } from '@/lib/nutrition/foodLog'

// Shared vision pipeline for the Telegram agent. One Claude vision call classifies an image
// (workout log screenshot vs meal photo vs other) AND extracts structured data, so the webhook
// can route a photo without a caption. Reusable server-side; the /api/vision route and the
// Telegram webhook both import analyzeImage().

export interface VisionImage {
  base64: string
  mediaType: string // e.g. 'image/jpeg', 'image/png'
}

export type VisionResult =
  | { kind: 'workout'; title: string; exercises: ExerciseInput[] }
  | { kind: 'meal'; description: string; macros: Macros }
  | { kind: 'other'; description: string }

// Download a Telegram photo by file_id → base64 + media type, ready for analyzeImage().
export async function fetchTelegramImage(fileId: string): Promise<VisionImage> {
  const token = process.env.TELEGRAM_BOT_TOKEN
  const fileRes = await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${fileId}`)
  const { result } = await fileRes.json()
  if (!result?.file_path) throw new Error('Telegram getFile returned no file_path')

  const url = `https://api.telegram.org/file/bot${token}/${result.file_path}`
  const res = await fetch(url)
  const buf = Buffer.from(await res.arrayBuffer())
  const ext = result.file_path.split('.').pop()?.toLowerCase()
  const mediaType =
    ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : ext === 'gif' ? 'image/gif' : 'image/jpeg'
  return { base64: buf.toString('base64'), mediaType }
}

const SYSTEM = `You parse images for a personal operating system. You receive one or more images and an optional text hint. Classify the image and extract structured data. Return ONLY a JSON object — no prose.

Choose "kind":
- "workout" — a screenshot or photo of a workout log: a title line plus a list of exercises with rep notation (often an iOS Notes screenshot).
- "meal" — a photo of food, a meal, a drink, or a plate.
- "other" — anything else.

If kind == "workout", return exactly:
{ "kind":"workout", "title":"<the workout name verbatim from the top line>", "exercises":[ { "section": <string or null>, "name":"<exercise name>", "raw":"<the verbatim set/rep token, exactly as written>", "sets": <int or null>, "reps": <string or null>, "note": <string or null>, "done": <true|false> } ] }
Workout rules:
- "title": the top line verbatim, free-form (e.g. "Back + triceps + Core", "shoulders arms PT"). Do NOT normalize to PUSH/PULL.
- One exercise per line. "raw" is the EXACT set/rep string — always keep it.
- Rep notation is INCONSISTENT — do not force a sets×reps split. "3x12" = sets×reps; but "Pushups 30x3", "Russian twists 16x 2", "Ankle taps 100 x2" = reps×sets. Fill "sets"/"reps" best-effort; use null when ambiguous.
- ranges ("3x6-8"), to-failure ("2x failure"), time ("30 seconds x 3"), each-side ("2x30e", "2x 8 E" — e/E = each) all stay verbatim in "raw".
- A line ending with ":" starts a sub-section ("Physical therapy:", "Push-up circuit:") that groups the exercises beneath it → set "section" for those; null when there is no section.
- Strikethrough text = planned but skipped → "done": false. Otherwise "done": true.
- If EVERY line ends with a trailing " x" (the owner's done-marker), set "done": true for all.
- Modifiers ("(drop set)", "(descend 5 reps each time)", "25 lbs", "no weight", "Right leg", "HARD", "killer") go in "note".

If kind == "meal", return exactly:
{ "kind":"meal", "description":"<concise description of the food shown>", "macros": { "kcal": <int>, "protein": <int g>, "carbs": <int g>, "fat": <int g> } }
Estimate macros for the entire meal visible.

If kind == "other", return exactly:
{ "kind":"other", "description":"<what the image shows>" }`

function coerce(parsed: Record<string, unknown>): VisionResult {
  if (parsed.kind === 'workout') {
    const exercises = Array.isArray(parsed.exercises) ? parsed.exercises : []
    return {
      kind: 'workout',
      title: typeof parsed.title === 'string' ? parsed.title : 'Workout',
      exercises: exercises.map((e: Record<string, unknown>) => ({
        section: typeof e.section === 'string' && e.section.trim() ? e.section.trim().replace(/:\s*$/, '') : null,
        name: String(e.name ?? '').trim(),
        raw: typeof e.raw === 'string' ? e.raw : null,
        sets: Number.isFinite(Number(e.sets)) && e.sets !== null ? Number(e.sets) : null,
        reps: e.reps == null ? null : String(e.reps),
        note: typeof e.note === 'string' && e.note.trim() ? e.note : null,
        done: e.done !== false,
      })).filter((e: ExerciseInput) => e.name),
    }
  }
  if (parsed.kind === 'meal') {
    const m = (parsed.macros ?? {}) as Record<string, unknown>
    return {
      kind: 'meal',
      description: String(parsed.description ?? 'Meal'),
      macros: {
        kcal: Number(m.kcal) || 0,
        protein: Number(m.protein) || 0,
        carbs: Number(m.carbs) || 0,
        fat: Number(m.fat) || 0,
      },
    }
  }
  return { kind: 'other', description: String(parsed.description ?? 'Unrecognized image') }
}

// Classify + extract from one or more images. `hint` is an optional caption from Telegram.
export async function analyzeImage(images: VisionImage[], hint?: string): Promise<VisionResult> {
  if (!images.length) throw new Error('no images provided')
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const content: Anthropic.MessageParam['content'] = [
    ...images.map((img) => ({
      type: 'image' as const,
      source: { type: 'base64' as const, media_type: img.mediaType as 'image/jpeg', data: img.base64 },
    })),
    { type: 'text' as const, text: hint?.trim() ? `Caption hint: ${hint.trim()}` : 'Parse this image.' },
  ]

  const msg = await anthropic.messages.create({
    model: process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6',
    max_tokens: 1500,
    system: SYSTEM,
    messages: [{ role: 'user', content }],
  })

  const raw = msg.content[0]?.type === 'text' ? msg.content[0].text : '{}'
  const match = raw.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('No JSON in vision response')
  return coerce(JSON.parse(match[0]))
}
