// Shared types for the finance positions terminal (rebuild v1).
// See docs/vault/specs/finance-tab-rebuild-v1.md for the authoritative spec.
import type { MarketBrief } from '@/components/finance/MarketNews'
import type { PortfolioScore } from '@/components/finance/Scores'

export type Instrument = 'equity' | 'etf' | 'crypto'

export interface Holding {
  id?: string             // fin_holdings row id (present for Supabase-backed holdings; enables inline Edit)
  ticker: string          // uppercased symbol used for Finnhub (e.g. 'META')
  rawTicker: string       // as written in the sheet (e.g. 'Meta')
  shares: number
  avgCost: number | null  // null when the sheet cell is blank (no cost basis)
  dateRecorded: string | null
  instrument: Instrument
  sector: string          // broad sector bucket
}

// Raw values pulled from the two Google Sheets tabs (no derivation yet).
export interface ParsedSheet {
  holdings: Holding[]
  buyingPower: number
  accounts: {
    bankAccount: number | null
    robinhood: number | null      // informational only (reconciliation)
    takeHome11wk: number | null
    federalRefund: number | null
    stateRefund: number | null
  }
  liabilities: {
    hertz: number | null
    rent: number | null
    groceryWeekly: number | null
    evCharging: number | null
    julyReserve: number | null
  }
}

// One holding enriched with live market data + computed P/L.
export interface EnrichedHolding extends Holding {
  price: number | null          // current price (pinned for XRP)
  price7dAgo: number | null     // close ~7 calendar days ago
  positionValue: number | null  // shares * price
  pinned?: boolean              // XRP price is pinned
  marketCap: number | null      // USD (profile2.marketCapitalization * 1e6)
  companyName: string | null
  // 7-day price-move P/L
  move7dAbs: number | null
  move7dPct: number | null
  // cost-basis P/L (null when avgCost is null)
  costAbs: number | null
  costPct: number | null
}

export interface Candle {
  t: number[]  // unix seconds
  c: number[]  // closes
}

export interface NewsHeadline {
  headline: string
  datetime: number
  source: string
  url: string
}

export interface Outlook {
  ticker: string
  summary: string
  outlook: string
  headlines: NewsHeadline[]
  placeholder?: boolean  // true when Gemini key is absent
}

export interface PieSlice {
  label: string
  value: number
}

// Final payload the /finance page renders from.
export interface FinanceView {
  netWorth: number
  investmentsSide: number      // positionsValue + buyingPower
  positionsValue: number
  buyingPower: number
  bankBalance: number      // now the transactional cash balance (seed + income − spend + food variance)
  income: number           // total logged paychecks
  spendToday: number
  spendWeek: number
  weeklyProfit: number
  completedWeeks: number
  total7dAbs: number
  total7dPct: number
  holdings: EnrichedHolding[]  // sorted by positionValue desc
  top3: string[]               // tickers
  sectorPie: PieSlice[]
  capPie: PieSlice[]
  food: {
    weekStart: string
    budget: number
    spent: number
    remaining: number
  }
  // Rendering extras (populated from the cache blob)
  charts: Record<string, { d7: Candle | null; d30: Candle | null; d60: Candle | null }>
  sparklines: Record<string, number[]>
  news: Record<string, NewsHeadline[]>
  outlooks: Record<string, Outlook>
  marketBrief: MarketBrief | null
  score: PortfolioScore | null
  dreamTarget: number
  dreamLabel: string
  fetchedAt: string
  stale: boolean
}
