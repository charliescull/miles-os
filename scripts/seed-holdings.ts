/**
 * One-time bulk loader for fin_holdings (finance overhaul v2 §5.4).
 *
 * Usage (env pulled from .env.local automatically by tsx --env-file, or export first):
 *   npx tsx --env-file=.env.local scripts/seed-holdings.ts positions.json
 *
 * positions.json — an array of:
 *   { "ticker": "NVDA", "shares": 10, "avgCost": 120.5,
 *     "instrument": "equity"|"etf"|"crypto"?, "sector": "Technology"?, "companyName": "NVIDIA"? }
 *
 * Each position becomes a fin_holdings row + one seeding buy trade so avg_cost is ledger-derived.
 * Re-running skips tickers that already have an OPEN holding (idempotent-ish). This talks to
 * Supabase directly (no @/ aliases) so it runs outside the Next runtime.
 */
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

interface SeedPosition {
  ticker: string
  shares: number
  avgCost?: number | null
  instrument?: 'equity' | 'etf' | 'crypto'
  sector?: string
  companyName?: string
}

async function main() {
  const file = process.argv[2]
  if (!file) { console.error('Usage: tsx scripts/seed-holdings.ts <positions.json>'); process.exit(1) }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) { console.error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (e.g. --env-file=.env.local)'); process.exit(1) }
  const db = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })

  const positions = JSON.parse(readFileSync(file, 'utf8')) as SeedPosition[]
  if (!Array.isArray(positions)) { console.error('positions file must be a JSON array'); process.exit(1) }

  for (const p of positions) {
    const ticker = p.ticker.trim().toUpperCase()
    const shares = Number(p.shares)
    if (!ticker || !(shares > 0)) { console.warn(`skip invalid: ${JSON.stringify(p)}`); continue }

    const { data: existing } = await db.from('fin_holdings').select('id').eq('ticker', ticker).is('closed_at', null).maybeSingle()
    if (existing) { console.log(`skip ${ticker} (already open)`); continue }

    const avgCost = p.avgCost === undefined || p.avgCost === null ? null : Number(p.avgCost)
    const { data: holding, error } = await db.from('fin_holdings').insert({
      ticker,
      raw_ticker: p.ticker,
      company_name: p.companyName ?? null,
      shares,
      avg_cost: avgCost,
      instrument: p.instrument ?? 'equity',
      sector: p.sector ?? null,
      pinned: p.instrument === 'crypto',
      opened_at: new Date().toISOString().slice(0, 10),
    }).select().single()
    if (error || !holding) { console.error(`failed ${ticker}:`, error?.message); continue }

    // Seed trade so the ledger reconciles with the holding (only if a cost basis was given).
    if (avgCost !== null) {
      await db.from('fin_trades').insert({ holding_id: holding.id, ticker, side: 'buy', shares, price: avgCost, note: 'seed' })
    }
    console.log(`seeded ${ticker}: ${shares} sh${avgCost !== null ? ` @ ${avgCost}` : ''}`)
  }
  console.log('done.')
}

main().catch(e => { console.error(e); process.exit(1) })
