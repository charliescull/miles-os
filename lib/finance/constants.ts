import type { Instrument } from './types'

// Authoritative tunables. Mirrors fin_config defaults; the live values are read
// from fin_config / the sheet at refresh time. See spec §3.
export const XRP_PINNED_PRICE = 1.29 // TODO: swap XRP to CoinGecko (see spec §4)
export const TOTAL_WEEKS = 11
export const WEEK_ANCHOR = '2026-05-31' // Sunday of the June-1 internship start week
export const GROCERY_WEEKLY = 150.0
export const REFRESH_TTL_HOURS = 12

// Market-cap buckets in USD (Finnhub returns cap in millions → ×1e6 before comparing).
export const CAP_THRESHOLDS = { mega: 200e9, large: 10e9, mid: 2e9, small: 0.3e9 }

// Exact Google Sheets tab names (verified against the live sheet 2026-05-29).
export const SHEET_TABS = {
  investments: 'Investments',
  accounts: 'Assets & Liabilities',
}

interface TickerMeta {
  sector: string
  instrument: Instrument
  name?: string
}

// Broad-sector + instrument map (owner chose BROAD sectors — chips fold into Technology).
// For tickers not listed, fall back to profile2.finnhubIndustry mapped via BROAD_SECTOR_FALLBACK.
export const TICKER_META: Record<string, TickerMeta> = {
  XRP: { sector: 'Crypto', instrument: 'crypto', name: 'XRP' },
  AMZN: { sector: 'Consumer Discretionary', instrument: 'equity' },
  TSM: { sector: 'Technology', instrument: 'equity' },
  NVDA: { sector: 'Technology', instrument: 'equity' },
  RR: { sector: 'Industrials', instrument: 'equity', name: 'Richtech Robotics' },
  AMD: { sector: 'Technology', instrument: 'equity' },
  META: { sector: 'Communication Services', instrument: 'equity' },
  RMCF: { sector: 'Consumer Discretionary', instrument: 'equity', name: 'Rocky Mountain Chocolate Factory' },
  GLTR: { sector: 'Precious Metals', instrument: 'etf', name: 'abrdn Physical Precious Metals Basket' },
  MU: { sector: 'Technology', instrument: 'equity' },
  LRCX: { sector: 'Technology', instrument: 'equity' },
  GOOGL: { sector: 'Communication Services', instrument: 'equity' },
  MSFT: { sector: 'Technology', instrument: 'equity' },
  ORCL: { sector: 'Technology', instrument: 'equity' },
  BJ: { sector: 'Consumer Staples', instrument: 'equity' },
}

// Map a Finnhub finnhubIndustry string to one of our broad buckets (for unknown tickers).
const BROAD_SECTOR_FALLBACK: [RegExp, string][] = [
  [/semiconductor|hardware|software|technology|electronic/i, 'Technology'],
  [/media|communication|telecom|internet/i, 'Communication Services'],
  [/retail|consumer.*discretion|automobile|apparel|leisure/i, 'Consumer Discretionary'],
  [/food|beverage|staple|household/i, 'Consumer Staples'],
  [/industrial|machinery|aerospace|transport|robot/i, 'Industrials'],
  [/bank|financ|insur|capital market/i, 'Financials'],
  [/health|pharma|biotech|medical/i, 'Health Care'],
  [/energy|oil|gas/i, 'Energy'],
  [/metal|mining|material|chemical/i, 'Materials'],
  [/real estate|reit/i, 'Real Estate'],
  [/utilit/i, 'Utilities'],
]

export function broadSectorFromIndustry(industry?: string | null): string {
  if (!industry) return 'Other'
  for (const [re, bucket] of BROAD_SECTOR_FALLBACK) if (re.test(industry)) return bucket
  return 'Other'
}

export function metaFor(ticker: string): TickerMeta {
  return TICKER_META[ticker.toUpperCase()] ?? { sector: 'Other', instrument: 'equity' }
}

// Cap bucket label from a USD market cap.
export function capBucket(capUsd: number | null): string {
  if (!capUsd || capUsd <= 0) return 'Unknown'
  if (capUsd >= CAP_THRESHOLDS.mega) return 'Mega'
  if (capUsd >= CAP_THRESHOLDS.large) return 'Large'
  if (capUsd >= CAP_THRESHOLDS.mid) return 'Mid'
  if (capUsd >= CAP_THRESHOLDS.small) return 'Small'
  return 'Micro'
}
