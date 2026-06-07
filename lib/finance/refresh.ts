import { getServiceClient } from '@/lib/supabase'
import { readFinanceSheet } from './sheets'
import { getQuote, getProfile, getCandles, getHourlySeries, getNews, closeNDaysAgo, sliceByDays } from './finnhub'
import {
  enrichAll,
  positionsValue,
  total7d,
  pickTop3,
  sectorPie,
  capPie,
  computeWeeklyProfit,
  completedWeeks,
  bankBalance,
  type MarketData,
} from './calc'
import { getClosedVarianceSum } from './food'
import { generateOutlook } from './gemini'
import { REFRESH_TTL_HOURS } from './constants'
import type { Candle, EnrichedHolding, NewsHeadline, PieSlice } from './types'

const CACHE_KEY = 'finance_data'

export interface FinanceCacheBlob {
  bankSeed: number
  weeklyProfit: number
  buyingPower: number
  positionsValue: number
  total7d: { abs: number; pct: number }
  holdings: EnrichedHolding[]
  top3: string[]
  sectorPie: PieSlice[]
  capPie: PieSlice[]
  charts: Record<string, { d7: Candle | null; d30: Candle | null; d60: Candle | null }>
  sparklines: Record<string, number[]>
  news: Record<string, NewsHeadline[]>
  fetchedAt: string
}

// Fetch everything from Sheets + Finnhub, compute the heavy/market parts, cache the blob,
// and write a silent net-worth snapshot. Date- and food-dependent values are computed at
// render time (see assembleView), so this blob stays valid for the full TTL.
export async function refreshAll(): Promise<FinanceCacheBlob> {
  const parsed = await readFinanceSheet()
  const weeklyProfit = computeWeeklyProfit(parsed)
  const bankSeed = parsed.accounts.bankAccount ?? 0

  const market: MarketData = { prices: {}, prices7d: {}, caps: {}, names: {} }
  const sparklines: Record<string, number[]> = {}

  // Equities/ETFs only — XRP is pinned (no API call). 3 concurrent calls per holding keeps
  // us well under Finnhub's 60/min free limit.
  for (const h of parsed.holdings) {
    if (h.instrument === 'crypto') continue
    const [q, prof, c7] = await Promise.all([getQuote(h.ticker), getProfile(h.ticker), getCandles(h.ticker, 7)])
    if (q) market.prices[h.ticker] = q.c
    if (prof) {
      if (prof.marketCap) market.caps[h.ticker] = prof.marketCap
      if (prof.name) market.names[h.ticker] = prof.name
    }
    const c7ago = closeNDaysAgo(c7, 7)
    if (c7ago !== null) market.prices7d[h.ticker] = c7ago
    if (c7) sparklines[h.ticker] = (sliceByDays(c7, 7) ?? c7).c
  }

  const enriched = enrichAll(parsed.holdings, market)
  const top3 = pickTop3(enriched)

  const db = getServiceClient()
  const charts: FinanceCacheBlob['charts'] = {}
  const news: Record<string, NewsHeadline[]> = {}
  for (const t of top3) {
    const h = enriched.find(e => e.ticker === t)
    if (!h || h.instrument === 'crypto') continue // XRP chart is rendered flat/pinned client-side
    // One hourly 3mo fetch, sliced into 7/30/60 for the toggle (richer than daily; no extra calls).
    const [full, headlines] = await Promise.all([getHourlySeries(t), getNews(t, 7)])
    charts[t] = { d7: sliceByDays(full, 7), d30: sliceByDays(full, 30), d60: sliceByDays(full, 60) }
    news[t] = headlines

    // Gemini outlook (best-effort) → cache for the view assembler to read.
    const outlook = await generateOutlook(t, h.companyName, headlines)
    if (outlook) {
      await db.from('fin_outlook_cache').upsert(
        { ticker: t, summary: outlook.summary, outlook: outlook.outlook, headlines, generated_at: new Date().toISOString() },
        { onConflict: 'ticker' }
      )
    }
  }

  const blob: FinanceCacheBlob = {
    bankSeed,
    weeklyProfit,
    buyingPower: parsed.buyingPower,
    positionsValue: positionsValue(enriched),
    total7d: total7d(enriched),
    holdings: enriched,
    top3,
    sectorPie: sectorPie(enriched),
    capPie: capPie(enriched),
    charts,
    sparklines,
    news,
    fetchedAt: new Date().toISOString(),
  }

  await db
    .from('fin_market_cache')
    .upsert(
      { cache_key: CACHE_KEY, payload: blob, fetched_at: blob.fetchedAt },
      { onConflict: 'cache_key' }
    )

  // Silent snapshot (spec §6 — no UI table).
  const now = new Date()
  const weeks = completedWeeks(now)
  const varianceSum = await getClosedVarianceSum()
  const bank = bankBalance(bankSeed, weeklyProfit, weeks, varianceSum)
  const investmentsSide = blob.positionsValue + blob.buyingPower
  await db.from('fin_networth_snapshots').insert({
    net_worth: investmentsSide + bank,
    investments_side: investmentsSide,
    positions_value: blob.positionsValue,
    buying_power: blob.buyingPower,
    bank_balance: bank,
    weekly_profit: weeklyProfit,
  })

  return blob
}

// Read the cached blob; return null if missing or older than the TTL.
export async function readCache(): Promise<FinanceCacheBlob | null> {
  const db = getServiceClient()
  const { data } = await db
    .from('fin_market_cache')
    .select('payload, fetched_at')
    .eq('cache_key', CACHE_KEY)
    .single()
  if (!data) return null
  const ageHours = (Date.now() - new Date(data.fetched_at).getTime()) / 3_600_000
  if (ageHours > REFRESH_TTL_HOURS) return null
  return data.payload as FinanceCacheBlob
}

export async function getOrRefresh(force: boolean): Promise<FinanceCacheBlob> {
  if (!force) {
    const cached = await readCache()
    if (cached) return cached
  }
  return refreshAll()
}
