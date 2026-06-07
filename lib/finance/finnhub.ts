import type { Candle, NewsHeadline } from './types'

// Finnhub primary + Twelve Data / Stooq candle fallback. See spec §9.
// Every function fails soft (returns null / []) so one bad symbol never breaks a refresh.

const FINNHUB_BASE = 'https://finnhub.io/api/v1'

function finnhubKey(): string | null {
  return process.env.FINNHUB_API_KEY || null
}

async function getJson(url: string): Promise<unknown | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

export interface Quote {
  c: number // current
  pc: number // previous close
  d: number | null
  dp: number | null
}

export async function getQuote(symbol: string): Promise<Quote | null> {
  const key = finnhubKey()
  if (!key) return null
  const j = (await getJson(`${FINNHUB_BASE}/quote?symbol=${encodeURIComponent(symbol)}&token=${key}`)) as
    | { c?: number; pc?: number; d?: number; dp?: number }
    | null
  if (!j || typeof j.c !== 'number' || j.c === 0) return null
  return { c: j.c, pc: j.pc ?? j.c, d: j.d ?? null, dp: j.dp ?? null }
}

export interface Profile {
  name: string | null
  marketCap: number | null // USD
  industry: string | null
  logo: string | null
}

export async function getProfile(symbol: string): Promise<Profile | null> {
  const key = finnhubKey()
  if (!key) return null
  const j = (await getJson(`${FINNHUB_BASE}/stock/profile2?symbol=${encodeURIComponent(symbol)}&token=${key}`)) as
    | { name?: string; marketCapitalization?: number; finnhubIndustry?: string; logo?: string }
    | null
  if (!j) return null
  return {
    name: j.name ?? null,
    marketCap: typeof j.marketCapitalization === 'number' ? j.marketCapitalization * 1e6 : null, // millions → USD
    industry: j.finnhubIndustry ?? null,
    logo: j.logo ?? null,
  }
}

export async function getNews(symbol: string, days = 7): Promise<NewsHeadline[]> {
  const key = finnhubKey()
  if (!key) return []
  const to = new Date()
  const from = new Date(to.getTime() - days * 86400_000)
  const fmt = (d: Date) => d.toISOString().slice(0, 10)
  const j = (await getJson(
    `${FINNHUB_BASE}/company-news?symbol=${encodeURIComponent(symbol)}&from=${fmt(from)}&to=${fmt(to)}&token=${key}`
  )) as { headline?: string; datetime?: number; source?: string; url?: string }[] | null
  if (!Array.isArray(j)) return []
  return j
    .filter(n => n.headline)
    .slice(0, 8)
    .map(n => ({ headline: n.headline!, datetime: n.datetime ?? 0, source: n.source ?? '', url: n.url ?? '' }))
}

// ---- Daily candles ----
// Primary: Yahoo Finance chart endpoint (keyless, bulk-friendly — needs a UA header or it 429s).
// Fallback: Twelve Data (free tier is 8 credits/min, so only viable for the occasional miss).
// (Finnhub /stock/candle is gated on the free tier; Stooq now requires a captcha apikey — both dropped.)

function yahooRange(days: number): string {
  if (days <= 25) return '1mo'
  if (days <= 80) return '3mo'
  return '6mo'
}

function parseYahooChart(j: {
  chart?: { result?: { timestamp?: number[]; indicators?: { quote?: { close?: (number | null)[] }[] } }[] }
}): Candle | null {
  const r = j?.chart?.result?.[0]
  const ts = r?.timestamp
  const closes = r?.indicators?.quote?.[0]?.close
  if (!Array.isArray(ts) || !Array.isArray(closes)) return null
  const t: number[] = []
  const c: number[] = []
  for (let i = 0; i < ts.length; i++) {
    if (typeof closes[i] === 'number') {
      t.push(ts[i])
      c.push(closes[i] as number)
    }
  }
  return c.length ? { t, c } : null
}

async function yahooChart(symbol: string, range: string, interval: string): Promise<Candle | null> {
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}`,
      { headers: { 'User-Agent': 'Mozilla/5.0' } }
    )
    if (!res.ok) return null
    return parseYahooChart(await res.json())
  } catch {
    return null
  }
}

async function candlesYahoo(symbol: string, days: number): Promise<Candle | null> {
  return yahooChart(symbol, yahooRange(days), '1d')
}

// Hourly series over ~3 months for the detailed top-3 cards (sliced into 7/30/60 client-side).
// Falls back to daily candles if the intraday request fails.
export async function getHourlySeries(symbol: string): Promise<Candle | null> {
  return (await yahooChart(symbol, '3mo', '1h')) ?? getCandles(symbol, 60)
}

async function candlesTwelveData(symbol: string, days: number): Promise<Candle | null> {
  const key = process.env.TWELVEDATA_API_KEY
  if (!key) return null
  const j = (await getJson(
    `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(symbol)}&interval=1day&outputsize=${days + 5}&apikey=${key}`
  )) as { values?: { datetime: string; close: string }[]; status?: string } | null
  if (!j || !Array.isArray(j.values) || j.values.length === 0) return null
  const rows = [...j.values].reverse() // Twelve Data is newest-first
  return {
    t: rows.map(r => Math.floor(new Date(r.datetime).getTime() / 1000)),
    c: rows.map(r => parseFloat(r.close)),
  }
}

export async function getCandles(symbol: string, days: number): Promise<Candle | null> {
  return (await candlesYahoo(symbol, days)) ?? (await candlesTwelveData(symbol, days))
}

// Keep only the points within the last `days` calendar days (for slicing one fetch into 7/30/60).
export function sliceByDays(candle: Candle | null, days: number): Candle | null {
  if (!candle) return null
  const cutoff = Date.now() / 1000 - days * 86400
  const t: number[] = []
  const c: number[] = []
  for (let i = 0; i < candle.t.length; i++) {
    if (candle.t[i] >= cutoff) {
      t.push(candle.t[i])
      c.push(candle.c[i])
    }
  }
  return c.length ? { t, c } : candle
}

// Close closest to `daysAgo` calendar days before now, from an ascending candle series.
export function closeNDaysAgo(candle: Candle | null, daysAgo: number): number | null {
  if (!candle || candle.c.length === 0) return null
  const target = Date.now() / 1000 - daysAgo * 86400
  let best = 0
  let bestDiff = Infinity
  for (let i = 0; i < candle.t.length; i++) {
    const diff = Math.abs(candle.t[i] - target)
    if (diff < bestDiff) {
      bestDiff = diff
      best = i
    }
  }
  return candle.c[best] ?? null
}
