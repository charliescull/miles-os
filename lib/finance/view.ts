import { getServiceClient } from '@/lib/supabase'
import { ensureWeekAndRollover } from './food'
import { completedWeeks, bankBalance } from './calc'
import type { FinanceCacheBlob } from './refresh'
import type { FinanceView, Outlook } from './types'

// Assemble the final render payload: combine the cached market blob with the date-dependent
// bank accrual, the live food week, and any cached Gemini outlooks.
export async function assembleView(blob: FinanceCacheBlob, now = new Date()): Promise<FinanceView> {
  const food = await ensureWeekAndRollover(now)
  const weeks = completedWeeks(now)
  const bank = bankBalance(blob.bankSeed, blob.weeklyProfit, weeks, food.varianceSum)
  const investmentsSide = blob.positionsValue + blob.buyingPower
  const netWorth = investmentsSide + bank

  const outlooks: Record<string, Outlook> = {}
  if (blob.top3.length) {
    const db = getServiceClient()
    const { data } = await db.from('fin_outlook_cache').select('*').in('ticker', blob.top3)
    for (const r of data ?? []) {
      outlooks[r.ticker] = {
        ticker: r.ticker,
        summary: r.summary ?? '',
        outlook: r.outlook ?? '',
        headlines: r.headlines ?? [],
      }
    }
  }

  return {
    netWorth,
    investmentsSide,
    positionsValue: blob.positionsValue,
    buyingPower: blob.buyingPower,
    bankBalance: bank,
    weeklyProfit: blob.weeklyProfit,
    completedWeeks: weeks,
    total7dAbs: blob.total7d.abs,
    total7dPct: blob.total7d.pct,
    holdings: blob.holdings,
    top3: blob.top3,
    sectorPie: blob.sectorPie,
    capPie: blob.capPie,
    food: {
      weekStart: food.weekStart,
      budget: food.budget,
      spent: food.spent,
      remaining: food.budget - food.spent,
    },
    charts: blob.charts,
    sparklines: blob.sparklines,
    news: blob.news,
    outlooks,
    fetchedAt: blob.fetchedAt,
    stale: false,
  }
}
