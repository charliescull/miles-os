import { getServiceClient } from '@/lib/supabase'
import { getProfile } from './finnhub'
import { metaFor, broadSectorFromIndustry } from './constants'
import type { Holding, Instrument } from './types'

// Live holdings + immutable trade ledger (finance overhaul v2 §5). Replaces the read-only
// Google Sheet "Investments" tab: the portfolio now lives in fin_holdings, editable in-app
// (TradeForm / Telegram) and derived from fin_trades. avg_cost is always recomputed from the
// ledger so it can never drift from the trade history.

const EPS = 1e-9

export interface HoldingRow {
  id: string
  ticker: string
  raw_ticker: string | null
  company_name: string | null
  shares: number
  avg_cost: number | null
  instrument: Instrument
  sector: string | null
  pinned: boolean
  pinned_price: number | null
  opened_at: string | null
  closed_at: string | null
}

// Map a DB row into the pure-calc `Holding` shape the enrich pipeline expects.
export function rowToHolding(r: HoldingRow): Holding {
  return {
    id: r.id,
    ticker: r.ticker,
    rawTicker: r.raw_ticker ?? r.ticker,
    shares: Number(r.shares),
    avgCost: r.avg_cost === null ? null : Number(r.avg_cost),
    dateRecorded: r.opened_at,
    instrument: r.instrument,
    sector: r.sector ?? 'Other',
  }
}

// Open positions (not fully sold), value-agnostic order — enrichAll re-sorts by position value.
export async function listOpenHoldings(): Promise<Holding[]> {
  const db = getServiceClient()
  const { data } = await db.from('fin_holdings').select('*').is('closed_at', null)
  return (data as HoldingRow[] | null ?? []).map(rowToHolding)
}

export async function listHoldingRows(includeCloseD = false): Promise<HoldingRow[]> {
  const db = getServiceClient()
  let q = db.from('fin_holdings').select('*')
  if (!includeCloseD) q = q.is('closed_at', null)
  const { data } = await q.order('created_at', { ascending: true })
  return (data as HoldingRow[] | null) ?? []
}

// Current open share count for a ticker (0 if none) — used by the Telegram "sold all" command.
export async function getOpenShares(ticker: string): Promise<number> {
  const db = getServiceClient()
  const { data } = await db
    .from('fin_holdings').select('shares').eq('ticker', ticker.trim().toUpperCase()).is('closed_at', null).maybeSingle()
  return data ? Number(data.shares) : 0
}

// Classify instrument/sector for a brand-new ticker (constants first, then one Finnhub profile call).
async function classifyTicker(ticker: string): Promise<{ instrument: Instrument; sector: string; name: string | null }> {
  const meta = metaFor(ticker)
  if (meta.sector !== 'Other') return { instrument: meta.instrument, sector: meta.sector, name: meta.name ?? null }
  const prof = await getProfile(ticker).catch(() => null)
  return {
    instrument: meta.instrument,
    sector: prof?.industry ? broadSectorFromIndustry(prof.industry) : meta.sector,
    name: prof?.name ?? meta.name ?? null,
  }
}

export interface TradeInput {
  ticker: string
  side: 'buy' | 'sell'
  shares: number
  price: number
  note?: string | null
  rawTicker?: string
}

export interface TradeResult {
  holding: HoldingRow
  netShares: number
  closed: boolean
}

// Apply a buy/sell. Ledger-first: insert the trade, then recompute the holding's shares +
// weighted avg-cost from the full ledger. Weighted avg cost is derived from BUYS only, so a
// sell never changes it; closed_at is set once net shares reach ~0 (position kept for history).
export async function applyTrade(input: TradeInput): Promise<TradeResult> {
  const db = getServiceClient()
  const ticker = input.ticker.trim().toUpperCase()
  const shares = Math.abs(Number(input.shares))
  const price = Number(input.price)
  if (!ticker) throw new Error('ticker required')
  if (!(shares > 0)) throw new Error('shares must be > 0')
  if (input.side === 'buy' && !(price > 0)) throw new Error('buy price must be > 0')

  // Find an existing OPEN holding, or create one on a buy.
  const { data: existing } = await db
    .from('fin_holdings').select('*').eq('ticker', ticker).is('closed_at', null).maybeSingle()
  let holding = existing as HoldingRow | null

  if (!holding) {
    if (input.side === 'sell') throw new Error(`No open position in ${ticker} to sell`)
    const c = await classifyTicker(ticker)
    const { data: created } = await db.from('fin_holdings').insert({
      ticker,
      raw_ticker: input.rawTicker ?? ticker,
      company_name: c.name,
      shares: 0,
      avg_cost: null,
      instrument: c.instrument,
      sector: c.sector,
      pinned: c.instrument === 'crypto',
      opened_at: new Date().toISOString().slice(0, 10),
    }).select().single()
    holding = created as HoldingRow
  }

  // Ledger first.
  await db.from('fin_trades').insert({
    holding_id: holding.id,
    ticker,
    side: input.side,
    shares,
    price,
    note: input.note ?? null,
  })

  // Recompute from the full ledger.
  const { data: trades } = await db.from('fin_trades').select('side, shares, price').eq('holding_id', holding.id)
  let boughtShares = 0, boughtCost = 0, soldShares = 0
  for (const t of trades ?? []) {
    const s = Number(t.shares)
    if (t.side === 'buy') { boughtShares += s; boughtCost += s * Number(t.price) }
    else soldShares += s
  }
  const netShares = boughtShares - soldShares
  const avgCost = boughtShares > EPS ? boughtCost / boughtShares : null
  const closed = netShares <= EPS

  const { data: updated } = await db.from('fin_holdings').update({
    shares: closed ? 0 : netShares,
    avg_cost: avgCost,
    closed_at: closed ? new Date().toISOString().slice(0, 10) : null,
    updated_at: new Date().toISOString(),
  }).eq('id', holding.id).select().single()

  return { holding: updated as HoldingRow, netShares: closed ? 0 : netShares, closed }
}

// Direct correction of a holding's shares / avg cost (inline Edit) without a synthetic trade.
export async function patchHolding(
  id: string,
  patch: { shares?: number; avgCost?: number | null; sector?: string; companyName?: string },
): Promise<HoldingRow> {
  const db = getServiceClient()
  const fields: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (patch.shares !== undefined) fields.shares = patch.shares
  if (patch.avgCost !== undefined) fields.avg_cost = patch.avgCost
  if (patch.sector !== undefined) fields.sector = patch.sector
  if (patch.companyName !== undefined) fields.company_name = patch.companyName
  const { data } = await db.from('fin_holdings').update(fields).eq('id', id).select().single()
  return data as HoldingRow
}
