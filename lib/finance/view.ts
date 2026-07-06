import { getServiceClient } from '@/lib/supabase'
import { ensureWeekAndRollover } from './food'
import { completedWeeks, cashBalance } from './calc'
import { getLatestBrief } from './marketBrief'
import { getLatestScore } from './scoring'
import { incomeTotal } from './income'
import { nonFoodSpendTotal, spendSummary } from './spend'
import type { FinanceCacheBlob } from './refresh'
import type { FinanceView, Outlook } from './types'

// Assemble the final render payload: combine the cached market blob with the live cash flow
// (paychecks − daily spend + food variance), the food week, and cached outlooks/brief/score.
export async function assembleView(blob: FinanceCacheBlob, now = new Date()): Promise<FinanceView> {
  const food = await ensureWeekAndRollover(now)
  const weeks = completedWeeks(now)

  // Cash = starting cash + real paychecks − daily (non-food) spend + food variance.
  const db0 = getServiceClient()
  const { data: cfg0 } = await db0.from('fin_config').select('cash_seed, dream_target, dream_label').eq('id', 1).maybeSingle()
  const cashSeed = Number(cfg0?.cash_seed ?? blob.bankSeed)
  const income = await incomeTotal()
  const spendBurn = await nonFoodSpendTotal()
  const spend = await spendSummary()
  const bank = cashBalance(cashSeed, income, spendBurn, food.varianceSum)
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

  const marketBrief = await getLatestBrief()
  const score = await getLatestScore()

  // Dream-car target (env override optional).
  const dreamTarget = Number(process.env.DREAM_TARGET ?? cfg0?.dream_target ?? 88750)
  const dreamLabel = cfg0?.dream_label ?? '2022 Porsche 718 Cayman GTS 4.0'

  return {
    netWorth,
    investmentsSide,
    positionsValue: blob.positionsValue,
    buyingPower: blob.buyingPower,
    bankBalance: bank,
    income,
    spendToday: spend.today,
    spendWeek: spend.thisWeek,
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
    marketBrief,
    score,
    dreamTarget,
    dreamLabel,
    fetchedAt: blob.fetchedAt,
    stale: false,
  }
}
