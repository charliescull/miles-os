import type { Holding, EnrichedHolding, ParsedSheet, PieSlice } from './types'
import { XRP_PINNED_PRICE, TOTAL_WEEKS, WEEK_ANCHOR, GROCERY_WEEKLY, capBucket } from './constants'

// Pure money math (spec §5). No I/O — the refresh route fetches market data and feeds it in,
// which keeps these functions deterministic and unit-testable.

export interface MarketData {
  prices: Record<string, number> // ticker → current price
  prices7d: Record<string, number> // ticker → close ~7 calendar days ago
  caps: Record<string, number> // ticker → market cap (USD)
  names: Record<string, string> // ticker → company name
}

export function computeWeeklyProfit(parsed: ParsedSheet, totalWeeks = TOTAL_WEEKS): number {
  const a = parsed.accounts
  const l = parsed.liabilities
  const takeHome = a.takeHome11wk ?? 0
  const refunds = (a.federalRefund ?? 0) + (a.stateRefund ?? 0)
  const liabNonFood = (l.hertz ?? 0) + (l.rent ?? 0) + (l.evCharging ?? 0) + (l.julyReserve ?? 0)
  const grocery11wk = (l.groceryWeekly ?? GROCERY_WEEKLY) * totalWeeks
  return (takeHome + refunds - liabNonFood - grocery11wk) / totalWeeks
}

export function completedWeeks(today: Date, anchor = WEEK_ANCHOR, totalWeeks = TOTAL_WEEKS): number {
  const a = new Date(`${anchor}T00:00:00Z`)
  const weeks = Math.floor((today.getTime() - a.getTime()) / (7 * 86400_000))
  return Math.max(0, Math.min(totalWeeks, weeks))
}

export function bankBalance(
  bankSeed: number,
  weeklyProfit: number,
  weeksDone: number,
  foodVarianceSum: number
): number {
  return bankSeed + weeklyProfit * weeksDone + foodVarianceSum
}

// Transactional cash model (finance overhaul v2 follow-up). Replaces the weekly-profit projection
// with ACTUAL logged income and expenses so net worth reflects real cash flow:
//   cash = starting cash + paychecks − daily (non-food) spend + food-budget variance.
// Food isn't subtracted here — it runs through the weekly $150 budget, whose closed-week variance
// (leftover positive / overage negative) is `foodVarianceSum`, so food is already accounted for.
export function cashBalance(
  cashSeed: number,
  incomeTotal: number,
  nonFoodSpend: number,
  foodVarianceSum: number
): number {
  return cashSeed + incomeTotal - nonFoodSpend + foodVarianceSum
}

export function enrichHolding(h: Holding, market: MarketData): EnrichedHolding {
  const isXrp = h.instrument === 'crypto'
  const price = isXrp ? XRP_PINNED_PRICE : market.prices[h.ticker] ?? null
  const price7dAgo = isXrp ? XRP_PINNED_PRICE : market.prices7d[h.ticker] ?? null
  const positionValue = price !== null ? h.shares * price : null

  let move7dAbs: number | null = null
  let move7dPct: number | null = null
  if (price !== null && price7dAgo !== null && price7dAgo !== 0) {
    move7dAbs = (price - price7dAgo) * h.shares
    move7dPct = price / price7dAgo - 1
  }

  let costAbs: number | null = null
  let costPct: number | null = null
  if (h.avgCost !== null && h.avgCost !== 0 && price !== null) {
    costAbs = (price - h.avgCost) * h.shares
    costPct = price / h.avgCost - 1
  }

  return {
    ...h,
    price,
    price7dAgo,
    positionValue,
    pinned: isXrp || undefined,
    marketCap: market.caps[h.ticker] ?? null,
    companyName: market.names[h.ticker] ?? null,
    move7dAbs,
    move7dPct,
    costAbs,
    costPct,
  }
}

export function enrichAll(holdings: Holding[], market: MarketData): EnrichedHolding[] {
  return holdings
    .map(h => enrichHolding(h, market))
    .sort((a, b) => (b.positionValue ?? 0) - (a.positionValue ?? 0))
}

export function positionsValue(enriched: EnrichedHolding[]): number {
  return enriched.reduce((sum, h) => sum + (h.positionValue ?? 0), 0)
}

// Total 7-day move across the book (XRP contributes 0; cash excluded).
export function total7d(enriched: EnrichedHolding[]): { abs: number; pct: number } {
  let abs = 0
  let value7dAgo = 0
  for (const h of enriched) {
    if (h.price7dAgo !== null) value7dAgo += h.shares * h.price7dAgo
    if (h.move7dAbs !== null) abs += h.move7dAbs
  }
  return { abs, pct: value7dAgo > 0 ? abs / value7dAgo : 0 }
}

// Top 3 holdings by current position value (cash already excluded — it isn't a holding).
export function pickTop3(enriched: EnrichedHolding[]): string[] {
  return enriched.slice(0, 3).map(h => h.ticker)
}

export function sectorPie(enriched: EnrichedHolding[]): PieSlice[] {
  return groupSum(enriched, h => h.sector)
}

// Cap pie: XRP → Crypto, GLTR (etf) → Commodity, equities bucketed by market cap.
export function capPie(enriched: EnrichedHolding[]): PieSlice[] {
  return groupSum(enriched, h => {
    if (h.instrument === 'crypto') return 'Crypto'
    if (h.instrument === 'etf') return 'Commodity'
    return capBucket(h.marketCap)
  })
}

function groupSum(enriched: EnrichedHolding[], keyOf: (h: EnrichedHolding) => string): PieSlice[] {
  const map = new Map<string, number>()
  for (const h of enriched) {
    const v = h.positionValue ?? 0
    if (v <= 0) continue
    map.set(keyOf(h), (map.get(keyOf(h)) ?? 0) + v)
  }
  return [...map.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value)
}
