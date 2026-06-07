import type { NewsHeadline } from './types'

// Gemini AI outlook for the top-3 cards (spec §9). Fails soft → null (UI shows the placeholder).
// Defaults to a Flash model: gemini-2.5-pro is not on the Gemini free tier (limit 0), Flash is.
// Override with GEMINI_MODEL if you move to a paid project.

export interface OutlookResult {
  summary: string
  outlook: string
}

export async function generateOutlook(
  ticker: string,
  name: string | null,
  headlines: NewsHeadline[]
): Promise<OutlookResult | null> {
  const key = process.env.GEMINI_API_KEY
  if (!key || headlines.length === 0) return null
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash'

  const prompt =
    `You are summarizing the past week for ${name ?? ticker} (${ticker}). ` +
    `Using ONLY the headlines below, return strict JSON {"summary": "...", "outlook": "..."} where:\n` +
    `- summary: 2-3 sentence factual summary of the week's key developments.\n` +
    `- outlook: a brief, balanced forward view noting one bullish and one bearish consideration.\n` +
    `Do not invent facts not present in the headlines.\n\nHeadlines:\n` +
    headlines.map(h => `- ${h.headline}`).join('\n')

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.2, responseMimeType: 'application/json' },
        }),
      }
    )
    if (!res.ok) return null
    const j = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[]
    }
    const text = j?.candidates?.[0]?.content?.parts?.[0]?.text
    if (!text) return null
    const parsed = JSON.parse(text) as { summary?: string; outlook?: string }
    if (!parsed.summary) return null
    return { summary: String(parsed.summary), outlook: String(parsed.outlook ?? '') }
  } catch {
    return null
  }
}
