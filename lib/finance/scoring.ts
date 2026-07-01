import Anthropic from '@anthropic-ai/sdk'
import { getServiceClient } from '@/lib/supabase'
import { readCache } from './refresh'
import { getPortfolioNews, avKey } from './alphavantage'
import { capBucket } from './constants'
import type { EnrichedHolding } from './types'
import type { PortfolioScore } from '@/components/finance/Scores'

// Portfolio scoring (finance overhaul v2 §8). Computed in the 7am job after holdings enrich.
//   • sentiment  — position-weighted per-ticker AV news sentiment, 0..100 (cyan ramp)
//   • diversification — inverse sector concentration (Herfindahl), 0..100 (amber→violet ramp)
//   • risk       — concentration + small/mid weight + single-name max + crypto %, 0..100
// risk_factors + upside come from Claude given the numeric inputs. Everything fails soft.

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n))

// AV per-ticker sentiment (-0.35..0.35) → 0..100.
function normSentiment(s: number): number {
  return clamp(((s + 0.35) / 0.7) * 100)
}

interface ScoreInputs {
  sentiment: number
  sentimentLabel: string
  diversification: number
  diversificationLabel: string
  risk: number
  sectorMix: { label: string; pct: number }[]
  capMix: { label: string; pct: number }[]
  maxNameWeightPct: number
  cryptoPct: number
  smallMidPct: number
}

function computeInputs(enriched: EnrichedHolding[], tickerSentiment: Record<string, number>): ScoreInputs | null {
  const total = enriched.reduce((s, h) => s + (h.positionValue ?? 0), 0)
  if (total <= 0) return null

  // Weights.
  const weights = enriched.map(h => ({ h, w: (h.positionValue ?? 0) / total }))

  // Sentiment — position-weighted, default-neutral (50) for tickers with no news.
  let sentiment = 0, sentWeight = 0
  for (const { h, w } of weights) {
    const s = tickerSentiment[h.ticker]
    sentiment += (s !== undefined ? normSentiment(s) : 50) * w
    sentWeight += w
  }
  sentiment = sentWeight > 0 ? sentiment / sentWeight : 50
  const sentimentLabel = sentiment >= 60 ? 'Bullish' : sentiment >= 40 ? 'Neutral' : 'Bearish'

  // Sector mix + Herfindahl concentration.
  const sectorMap = new Map<string, number>()
  for (const { h, w } of weights) sectorMap.set(h.sector, (sectorMap.get(h.sector) ?? 0) + w)
  const sectorMix = [...sectorMap.entries()].map(([label, w]) => ({ label, pct: w * 100 })).sort((a, b) => b.pct - a.pct)
  const hhi = [...sectorMap.values()].reduce((s, w) => s + w * w, 0) // 1/n..1
  const nSectors = sectorMap.size
  let diversification = clamp((1 - hhi) * 100 + (nSectors >= 4 ? 10 : 0))
  const diversificationLabel = diversification >= 70 ? 'Well-diversified' : diversification >= 40 ? 'Moderate' : 'Concentrated'

  // Cap mix.
  const capMap = new Map<string, number>()
  for (const { h, w } of weights) {
    const bucket = h.instrument === 'crypto' ? 'Crypto' : h.instrument === 'etf' ? 'Commodity' : capBucket(h.marketCap)
    capMap.set(bucket, (capMap.get(bucket) ?? 0) + w)
  }
  const capMix = [...capMap.entries()].map(([label, w]) => ({ label, pct: w * 100 })).sort((a, b) => b.pct - a.pct)

  const maxNameWeight = Math.max(...weights.map(x => x.w))
  const cryptoPct = (capMap.get('Crypto') ?? 0) * 100
  const smallMidPct = ((capMap.get('Small') ?? 0) + (capMap.get('Mid') ?? 0) + (capMap.get('Micro') ?? 0)) * 100

  // Risk blend (higher = riskier).
  const risk = clamp(hhi * 40 + maxNameWeight * 30 + (smallMidPct / 100) * 15 + (cryptoPct / 100) * 15)

  return {
    sentiment: Math.round(sentiment),
    sentimentLabel,
    diversification: Math.round(diversification),
    diversificationLabel,
    risk: Math.round(risk),
    sectorMix,
    capMix,
    maxNameWeightPct: Math.round(maxNameWeight * 100),
    cryptoPct: Math.round(cryptoPct),
    smallMidPct: Math.round(smallMidPct),
  }
}

async function narrateRisk(inputs: ScoreInputs, tickers: string[]): Promise<{ riskFactors: string[]; upside: string }> {
  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const ctx = `Holdings: ${tickers.join(', ')}.
Sector mix: ${inputs.sectorMix.map(s => `${s.label} ${s.pct.toFixed(0)}%`).join(', ')}.
Cap mix: ${inputs.capMix.map(c => `${c.label} ${c.pct.toFixed(0)}%`).join(', ')}.
Largest single position: ${inputs.maxNameWeightPct}%. Crypto: ${inputs.cryptoPct}%. Small/mid: ${inputs.smallMidPct}%.
Scores — sentiment ${inputs.sentiment}/100 (${inputs.sentimentLabel}), diversification ${inputs.diversification}/100 (${inputs.diversificationLabel}), risk ${inputs.risk}/100.`
    const msg = await anthropic.messages.create({
      model: process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6',
      max_tokens: 400,
      system: `Return ONLY JSON { "risk_factors": ["...max 4, concrete + portfolio-specific..."], "upside": "one-sentence upside narrative" }. No fluff, no "not financial advice".`,
      messages: [{ role: 'user', content: ctx }],
    })
    const raw = msg.content[0]?.type === 'text' ? msg.content[0].text : '{}'
    const m = raw.match(/\{[\s\S]*\}/)
    if (m) {
      const p = JSON.parse(m[0])
      return {
        riskFactors: Array.isArray(p.risk_factors) ? p.risk_factors.slice(0, 4).map(String) : [],
        upside: String(p.upside ?? ''),
      }
    }
  } catch { /* fail soft */ }
  return { riskFactors: [], upside: '' }
}

export async function generatePortfolioScore(): Promise<{ ok: boolean } | null> {
  const blob = await readCache()
  if (!blob || !blob.holdings.length) return { ok: false }

  // Per-ticker sentiment (avg across AV portfolio-news articles), when AV is available.
  const tickerSentiment: Record<string, number> = {}
  if (avKey()) {
    const articles = await getPortfolioNews(blob.holdings.map(h => h.ticker))
    const agg: Record<string, { sum: number; n: number }> = {}
    for (const a of articles) for (const [tk, sc] of Object.entries(a.tickerSentiment)) {
      agg[tk] = agg[tk] ?? { sum: 0, n: 0 }
      agg[tk].sum += sc; agg[tk].n++
    }
    for (const [tk, { sum, n }] of Object.entries(agg)) if (n) tickerSentiment[tk] = sum / n
  }

  const inputs = computeInputs(blob.holdings, tickerSentiment)
  if (!inputs) return { ok: false }
  const { riskFactors, upside } = await narrateRisk(inputs, blob.holdings.map(h => h.ticker))

  const db = getServiceClient()
  await db.from('fin_portfolio_score').upsert({
    scored_date: new Date().toISOString().slice(0, 10),
    sentiment_score: inputs.sentiment,
    sentiment_label: inputs.sentimentLabel,
    diversification_score: inputs.diversification,
    diversification_label: inputs.diversificationLabel,
    risk_score: inputs.risk,
    risk_factors: riskFactors,
    upside,
    generated_at: new Date().toISOString(),
  }, { onConflict: 'scored_date' })

  return { ok: true }
}

export async function getLatestScore(): Promise<PortfolioScore | null> {
  const db = getServiceClient()
  const { data } = await db
    .from('fin_portfolio_score').select('*').order('scored_date', { ascending: false }).limit(1).maybeSingle()
  if (!data) return null
  return {
    sentiment: data.sentiment_score ?? null,
    sentimentLabel: data.sentiment_label ?? null,
    diversification: data.diversification_score ?? null,
    diversificationLabel: data.diversification_label ?? null,
    risk: data.risk_score ?? null,
    riskFactors: (data.risk_factors as string[] | null) ?? [],
    upside: data.upside ?? null,
  }
}
