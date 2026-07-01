import Anthropic from '@anthropic-ai/sdk'
import { getServiceClient } from '@/lib/supabase'
import { listOpenHoldings } from './holdings'
import { getPortfolioNews, getMarketNews, getMovers, getMacro, avKey } from './alphavantage'
import { getNews } from './finnhub'
import type { MarketBrief, Bullet } from '@/components/finance/MarketNews'

// The 7:00am ET market brief (finance overhaul v2 §6.4). Gathers Alpha Vantage news + movers +
// macro (Finnhub headlines as fail-soft fallback), asks Claude for a tight "Nova" money-coach
// narrative anchored to the user's actual holdings, and stores it in fin_market_brief.

function todayKey(): string {
  return new Date().toISOString().slice(0, 10)
}

interface BriefJson {
  headline: string
  body: string
  bullets: Bullet[]
}

async function narrate(
  kind: 'daily' | 'weekly',
  tickers: string[],
  context: string,
): Promise<BriefJson | null> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const wordCap = kind === 'weekly' ? 220 : 120
  const msg = await anthropic.messages.create({
    model: process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6',
    max_tokens: 700,
    system: `You are "Nova", a sharp, concise money coach. Write a ${kind} market brief for an investor whose holdings are: ${tickers.join(', ') || '(none yet)'}.
Return ONLY JSON: { "headline": "one-line TL;DR", "body": "<=${wordCap} words: what happened, what matters FOR THIS PORTFOLIO, one thing to watch", "bullets": [{ "title": "short", "detail": "one sentence", "sentiment": "positive"|"negative"|"neutral" }] }.
Rules: 3-5 bullets. Never invent facts beyond the provided data. Concrete and portfolio-specific, no fluff. Do NOT add "Not financial advice" (the UI appends it).`,
    messages: [{ role: 'user', content: context || 'No fresh market data available; give a brief, honest neutral note.' }],
  })
  const raw = msg.content[0]?.type === 'text' ? msg.content[0].text : '{}'
  const match = raw.match(/\{[\s\S]*\}/)
  if (!match) return null
  try {
    const p = JSON.parse(match[0])
    if (!p.headline || !p.body) return null
    return {
      headline: String(p.headline),
      body: String(p.body),
      bullets: Array.isArray(p.bullets)
        ? p.bullets.slice(0, 5).map((b: Record<string, string>): Bullet => ({
            title: String(b.title ?? ''),
            detail: String(b.detail ?? ''),
            sentiment: (['positive', 'negative', 'neutral'].includes(b.sentiment) ? b.sentiment : 'neutral') as Bullet['sentiment'],
          }))
        : [],
    }
  } catch {
    return null
  }
}

// Generate + persist a brief. `kind` defaults to daily; pass 'weekly' for the Sunday synthesis.
export async function generateMarketBrief(kind: 'daily' | 'weekly' = 'daily'): Promise<{ ok: boolean; briefDate: string; avUsed: boolean }> {
  const holdings = await listOpenHoldings()
  const tickers = holdings.map(h => h.ticker)
  const usingAv = !!avKey()

  const [portfolioNews, marketNews, movers, macro] = usingAv
    ? await Promise.all([getPortfolioNews(tickers), getMarketNews(), getMovers(), getMacro()])
    : [[], [], null, { treasury10y: null, cpi: null, fedFunds: null }]

  // Fail-soft headlines from Finnhub when AV is unavailable.
  let fallbackHeadlines: string[] = []
  if (!usingAv && tickers.length) {
    const news = await getNews(tickers[0], 3)
    fallbackHeadlines = news.slice(0, 5).map(n => n.headline)
  }

  const ctxParts: string[] = []
  if (portfolioNews.length) ctxParts.push('PORTFOLIO NEWS:\n' + portfolioNews.slice(0, 8).map(a => `- (${a.sentimentLabel}) ${a.title}`).join('\n'))
  if (marketNews.length) ctxParts.push('MARKET NEWS:\n' + marketNews.slice(0, 8).map(a => `- (${a.sentimentLabel}) ${a.title}`).join('\n'))
  if (movers) ctxParts.push(`MOVERS: gainers ${movers.gainers.map(m => `${m.ticker} +${m.changePct.toFixed(1)}%`).join(', ')}; losers ${movers.losers.map(m => `${m.ticker} ${m.changePct.toFixed(1)}%`).join(', ')}`)
  if (macro.treasury10y !== null || macro.cpi !== null || macro.fedFunds !== null) {
    ctxParts.push(`MACRO: 10y treasury ${macro.treasury10y ?? '—'}, CPI ${macro.cpi ?? '—'}, fed funds ${macro.fedFunds ?? '—'}`)
  }
  if (fallbackHeadlines.length) ctxParts.push('HEADLINES:\n' + fallbackHeadlines.map(h => `- ${h}`).join('\n'))

  const narrative = await narrate(kind, tickers, ctxParts.join('\n\n'))
  const briefDate = todayKey()

  const db = getServiceClient()
  await db.from('fin_market_brief').upsert({
    kind,
    brief_date: briefDate,
    headline: narrative?.headline ?? null,
    body: narrative?.body ?? null,
    bullets: narrative?.bullets ?? [],
    movers: movers ?? null,
    macro,
    generated_at: new Date().toISOString(),
  }, { onConflict: 'kind,brief_date' })

  return { ok: !!narrative, briefDate, avUsed: usingAv }
}

// Reader for the finance view: latest daily brief + latest weekly (for the "this week" expandable).
export async function getLatestBrief(): Promise<MarketBrief | null> {
  const db = getServiceClient()
  const { data: daily } = await db
    .from('fin_market_brief').select('*').eq('kind', 'daily').order('brief_date', { ascending: false }).limit(1).maybeSingle()
  if (!daily) return null
  const { data: weekly } = await db
    .from('fin_market_brief').select('headline, body').eq('kind', 'weekly').order('brief_date', { ascending: false }).limit(1).maybeSingle()

  return {
    headline: daily.headline ?? null,
    body: daily.body ?? null,
    bullets: (daily.bullets as Bullet[] | null) ?? [],
    movers: (daily.movers as MarketBrief['movers']) ?? null,
    briefDate: daily.brief_date ?? null,
    weekly: weekly ? { headline: weekly.headline ?? null, body: weekly.body ?? null } : null,
  }
}
