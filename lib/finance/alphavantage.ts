import { getServiceClient } from '@/lib/supabase'

// Alpha Vantage client (finance overhaul v2 §6.3) — news sentiment + macro ONLY.
// Free tier: 25 req/day, 5 req/min. The daily brief budgets ~6 calls and caches everything in
// fin_market_cache under av:* keys with per-type TTLs. Everything fails soft (null/[]) so a
// missing key or throttle never breaks the cron. Prices stay on the free Finnhub/Yahoo path.

const AV_BASE = 'https://www.alphavantage.co/query'

export function avKey(): string | null {
  return process.env.ALPHAVANTAGE_API_KEY || null
}

async function cacheGet<T>(key: string, ttlHours: number): Promise<T | null> {
  const db = getServiceClient()
  const { data } = await db.from('fin_market_cache').select('payload, fetched_at').eq('cache_key', key).maybeSingle()
  if (!data) return null
  const ageHours = (Date.now() - new Date(data.fetched_at).getTime()) / 3_600_000
  if (ageHours > ttlHours) return null
  return data.payload as T
}

async function cacheSet(key: string, payload: unknown): Promise<void> {
  const db = getServiceClient()
  await db.from('fin_market_cache').upsert(
    { cache_key: key, payload: payload as object, fetched_at: new Date().toISOString() },
    { onConflict: 'cache_key' }
  )
}

async function avGet(params: Record<string, string>): Promise<Record<string, unknown> | null> {
  const key = avKey()
  if (!key) return null
  const qs = new URLSearchParams({ ...params, apikey: key }).toString()
  try {
    const res = await fetch(`${AV_BASE}?${qs}`)
    if (!res.ok) return null
    const j = (await res.json()) as Record<string, unknown>
    // AV signals throttling with a "Note"/"Information" field and 200 status.
    if (j.Note || j.Information || j['Error Message']) return null
    return j
  } catch {
    return null
  }
}

export interface AvArticle {
  title: string
  url: string
  source: string
  sentimentScore: number
  sentimentLabel: string
  tickerSentiment: Record<string, number> // ticker → sentiment score
}

function parseFeed(j: Record<string, unknown> | null): AvArticle[] {
  const feed = (j?.feed as Record<string, unknown>[] | undefined) ?? []
  return feed.slice(0, 20).map(a => {
    const ts: Record<string, number> = {}
    for (const t of (a.ticker_sentiment as Record<string, string>[] | undefined) ?? []) {
      if (t.ticker) ts[t.ticker] = parseFloat(t.ticker_sentiment_score ?? '0')
    }
    return {
      title: String(a.title ?? ''),
      url: String(a.url ?? ''),
      source: String(a.source ?? ''),
      sentimentScore: parseFloat(String(a.overall_sentiment_score ?? '0')),
      sentimentLabel: String(a.overall_sentiment_label ?? 'Neutral'),
      tickerSentiment: ts,
    }
  })
}

// Portfolio-specific news + per-ticker sentiment (1 call; cached 12h).
export async function getPortfolioNews(tickers: string[]): Promise<AvArticle[]> {
  if (!tickers.length) return []
  const cached = await cacheGet<AvArticle[]>('av:news:portfolio', 12)
  if (cached) return cached
  const j = await avGet({ function: 'NEWS_SENTIMENT', tickers: tickers.slice(0, 10).join(','), sort: 'LATEST', limit: '20' })
  const out = parseFeed(j)
  if (out.length) await cacheSet('av:news:portfolio', out)
  return out
}

// Market-wide news (1 call; cached 12h).
export async function getMarketNews(): Promise<AvArticle[]> {
  const cached = await cacheGet<AvArticle[]>('av:news:market', 12)
  if (cached) return cached
  const j = await avGet({ function: 'NEWS_SENTIMENT', topics: 'financial_markets,economy_macro,earnings', sort: 'LATEST', limit: '20' })
  const out = parseFeed(j)
  if (out.length) await cacheSet('av:news:market', out)
  return out
}

export interface Movers { gainers: { ticker: string; changePct: number }[]; losers: { ticker: string; changePct: number }[] }

// Top gainers/losers (1 call; cached 12h).
export async function getMovers(): Promise<Movers | null> {
  const cached = await cacheGet<Movers>('av:movers', 12)
  if (cached) return cached
  const j = await avGet({ function: 'TOP_GAINERS_LOSERS' })
  if (!j) return null
  const map = (arr: unknown): { ticker: string; changePct: number }[] =>
    ((arr as Record<string, string>[] | undefined) ?? []).slice(0, 5).map(x => ({
      ticker: x.ticker, changePct: parseFloat((x.change_percentage ?? '0').replace('%', '')),
    }))
  const out: Movers = { gainers: map(j.top_gainers), losers: map(j.top_losers) }
  await cacheSet('av:movers', out)
  return out
}

export interface Macro { treasury10y: number | null; cpi: number | null; fedFunds: number | null }

// Macro indicators (3 calls; cached 24h — they move slowly).
export async function getMacro(): Promise<Macro> {
  const cached = await cacheGet<Macro>('av:macro', 24)
  if (cached) return cached
  const latest = (j: Record<string, unknown> | null): number | null => {
    const d = (j?.data as Record<string, string>[] | undefined)?.[0]?.value
    const n = d ? parseFloat(d) : NaN
    return Number.isFinite(n) ? n : null
  }
  const [ty, cpi, ff] = await Promise.all([
    avGet({ function: 'TREASURY_YIELD', interval: 'daily', maturity: '10year' }),
    avGet({ function: 'CPI', interval: 'monthly' }),
    avGet({ function: 'FEDERAL_FUNDS_RATE', interval: 'monthly' }),
  ])
  const out: Macro = { treasury10y: latest(ty), cpi: latest(cpi), fedFunds: latest(ff) }
  if (out.treasury10y !== null || out.cpi !== null || out.fedFunds !== null) await cacheSet('av:macro', out)
  return out
}
