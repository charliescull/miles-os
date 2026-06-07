import { NextRequest, NextResponse } from 'next/server'
import { isAuthenticatedFromRequest } from '@/lib/auth'
import { analyzeImage, fetchTelegramImage, type VisionImage } from '@/lib/vision/analyzeImage'
import { saveWorkoutDetail } from '@/lib/workouts/saveWorkout'
import { logStandardFood } from '@/lib/nutrition/foodLog'
import { localDateKey } from '@/lib/localDateKey'

export const dynamic = 'force-dynamic'

// Vision pipeline test route (Phase 3). Accepts an image via any of:
//   { imageBase64, mediaType }  — raw base64
//   { url }                     — a public image URL (fetched server-side)
//   { fileId }                  — a Telegram file_id (downloaded via the bot token)
//   { images: [ <any of the above objects> ] }  — multiple (e.g. multi-screenshot workout)
// Optional: { hint } caption, { route: true } to also save (workout → today, meal → food log).
// Returns the parsed VisionResult plus, when routed, the save outcome.
async function resolveImage(src: Record<string, unknown>): Promise<VisionImage> {
  if (typeof src.fileId === 'string') return fetchTelegramImage(src.fileId)
  if (typeof src.imageBase64 === 'string') {
    return { base64: src.imageBase64, mediaType: (src.mediaType as string) ?? 'image/jpeg' }
  }
  if (typeof src.url === 'string') {
    const res = await fetch(src.url)
    if (!res.ok) throw new Error(`fetch image failed: ${res.status}`)
    const buf = Buffer.from(await res.arrayBuffer())
    const ct = res.headers.get('content-type') ?? 'image/jpeg'
    return { base64: buf.toString('base64'), mediaType: ct.split(';')[0] }
  }
  throw new Error('provide fileId, imageBase64+mediaType, or url')
}

export async function POST(req: NextRequest) {
  if (!(await isAuthenticatedFromRequest(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const body = await req.json().catch(() => ({}))

  try {
    const sources: Record<string, unknown>[] = Array.isArray(body.images)
      ? body.images
      : [body]
    const images = await Promise.all(sources.map(resolveImage))

    const result = await analyzeImage(images, typeof body.hint === 'string' ? body.hint : undefined)

    if (!body.route) {
      return NextResponse.json({ parsed: result, routed: null })
    }

    if (result.kind === 'workout') {
      const date = localDateKey()
      const saved = await saveWorkoutDetail(date, result.title, result.exercises)
      return NextResponse.json({ parsed: result, routed: { to: 'workout', ...saved } })
    }
    if (result.kind === 'meal') {
      const saved = await logStandardFood(result.description, result.macros)
      return NextResponse.json({ parsed: result, routed: { to: 'food', ...saved } })
    }
    return NextResponse.json({ parsed: result, routed: { to: 'other' } })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Vision failed' }, { status: 500 })
  }
}
