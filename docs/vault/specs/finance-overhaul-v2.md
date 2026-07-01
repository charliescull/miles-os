# Finance Overhaul v2 — Implementation Prompt

> **How to use this file:** This is a single, self-contained brief for the VS Code Claude Code
> agent. Paste (or reference) it as your instruction: *"Implement `docs/vault/specs/finance-overhaul-v2.md`."*
> It was written after auditing the live codebase, watching the reference build, and researching
> the free-automation constraints. Follow the build order in §12. Read §0 before touching anything.

---

## 0. Guardrails — read first

You are modifying a **production** single-user app (MILES OS, V3.1, Next.js App Router on Vercel
Hobby + Supabase). Obey `CLAUDE.md` and `docs/vault/dont-break.md`. Specifically for this work:

- **Additive migrations only.** New Supabase migration `supabase/migrations/0008_finance_overhaul.sql`.
  Never rename or drop existing `fin_*` tables/columns. Match the existing posture: single-tenant,
  `enable row level security` + `deny all` policy on every new table (the service-role client in
  `lib/supabase.ts` bypasses RLS).
- **Do not break the capture pipeline** (`classifyCapture` + `embedAndStore` + audit) or
  `match_memory_chunks`. The new Telegram spend/holding commands extend the router; they do not
  replace it.
- **Keep `Shell` + `TopRail`.** The finance page still wraps in `<Shell>`.
- **Auth:** every new API route is gated by `isAuthenticatedFromRequest` except cron routes, which
  self-authenticate via `Authorization: Bearer <CRON_SECRET>` and must be added to `PUBLIC_PATHS`
  in `proxy.ts` (same pattern as `/api/cron/alerts`).
- **Vercel Hobby = daily cron only.** Sub-daily / specific-time jobs run via **cron-job.org**
  hitting an API route (this is already how `/api/cron/alerts` works). Do **not** add sub-daily
  crons to `vercel.json`.
- **Design system:** dark, **oklch only**. Use the existing JARVIS tokens (§3). Never introduce
  hex/hsl.
- End the session by appending a log to `docs/vault/sessions/YYYY-MM-DD.md` (per CLAUDE.md).

---

## 1. What this overhaul delivers

A complete rebuild of `/finance` into a "keep-me-on-top-of-my-money-for-life" cockpit, with the
**minimum possible manual entry**. The only paid dependency is **SimpleFIN Bridge ($15/yr)** for
automated SoFi transaction sync; everything else runs on free tiers. Seven workstreams:

1. **Holdings → Supabase**, with an in-app **Buy / Sell / Edit** form (portfolio is currently stale
   because it lives in a read-only Google Sheet).
2. **Total Holdings redesign** — keep the top-3 cards, fix the janky per-row chart, split the lower
   area into **portfolio (left) + Market News (right)**.
3. **Market News panel** — daily & weekly AI market brief, generated **server-side at 7:00am ET**.
4. **Portfolio scoring** — market-cap sentiment score + diversification/risk score (distinct
   colors), with a written **risk-factors** + **upside narrative**.
5. **Recurring expenses** — a full Rocket-Money-style module: categorized bills, an upcoming-bills
   timeline, cancellation tracking, per-type expiration, monthly total rolled into net worth/budget,
   Telegram alerts before renewals/expirations.
6. **Credit card + credit score** — a new Discover section (manual entry): due dates, balances, min
   payment, utilization, and FICO tracking, with payment-due Telegram alerts.
7. **Spend tracking (free)** + **dream-car progress bar** (WebGL 718 Cayman GTS 4.0 on a podium,
   target **$88,750**) + **more futuristic animations** throughout.

---

## 2. Reference build (design inspiration)

The user's reference is Rowan's *"I Built My Own Rocket Money"* (YouTube `nPSh3KJQ894`) — a
self-hosted finance dashboard on the **same stack** (Next.js + Vercel + Supabase + Claude Code).
Its Finance section pattern: **net-worth tracking, subscriptions, incoming orders, a wishlist, AI
receipt scanning, and "Nova" — a built-in AI money coach.** We adopt the *patterns* (recurring
detection UI, bills timeline, an AI coach voice, category rollups), not any code. Rocket Money's own
product conventions we mirror: one clean list of every recurring charge, category budgets with
"about to hit your limit" alerts, and net-worth trend over time.

---

## 3. Design language (use these exact tokens)

From `app/globals.css` — already defined, just use them:

| Purpose | Token |
|---|---|
| Page void / bg | `oklch(0 0 0)` / `--background` |
| Card bg | `--card-bg` `oklch(0.04 0 0)` |
| Card border (cyan charge) | `--card-border` / hover `--card-border-hover` |
| Primary HUD accent (cyan) | `--jarvis` `oklch(0.82 0.13 225)` |
| Lit cyan | `--jarvis-bright` |
| Deep blue | `--jarvis-deep` |
| Stark red accent | `--stark-red` `oklch(0.64 0.21 27)` |
| Up / positive | `--signal-up` `oklch(0.78 0.17 150)` |
| Down / negative | `--signal-down` `oklch(0.64 0.21 27)` |
| Muted label | `--color-ink-4`; secondary `--color-ink-5` |
| Glows | `--bloom-cyan`, `--bloom-up`, `--bloom-down`, `--bloom-box` |
| Motion | `--snap` (UI feedback), `--drift-period` (ambient) |

Existing utility classes: `card`, `card-label`, `mono`, `hud`. Keep the current `FinanceCore`
organ (the flashing net-worth core) — it stays at the top.

**Scoring colors (new, must be visually distinct from each other):**
- **Market-cap sentiment score** → cyan family (`--jarvis` bright when bullish → `--jarvis-deep`
  when neutral → `--stark-red` when bearish).
- **Diversification / risk score** → an amber-to-violet ramp so it never reads the same as the
  sentiment gauge: use `oklch(0.80 0.15 85)` (well-diversified/low-risk) → `oklch(0.62 0.18 300)`
  (concentrated/high-risk). Define these as `--score-div-good` / `--score-div-bad` in globals.css.

---

## 4. New page layout (`app/finance/page.tsx`)

Top → bottom. Everything scrolls inside `h-[calc(100vh-40px)]`.

```
┌────────────────────────────────────────────────────────────────┐
│ FinanceCore (net-worth core organ) — KEEP, add subtle particle  │
│                                        drift (§11)              │
├────────────────────────────────────────────────────────────────┤
│ MONEY HEADER:  [ Net Worth + weekly ]   [ Food budget ]         │
│                [ NEW: Credit / Discover card ]  (3-up on md)    │
├────────────────────────────────────────────────────────────────┤
│ TOTAL HOLDINGS                                                  │
│   • header: total value + 7D  (+ Buy/Sell/Edit button, §5)     │
│   • Top-3 cards (KEEP, richer: §7 深-news)                      │
│   ┌───────────────────────────┬──────────────────────────────┐ │
│   │ PORTFOLIO (left ~60%)     │ MARKET NEWS (right ~40%) §6   │ │
│   │  holdings table, SHORT    │  daily brief + weekly insights│ │
│   │  mini-sparkline (§7)      │  headlines w/ sentiment       │ │
│   │  Sector + MktCap donuts   │                               │ │
│   │  + SCORES (§8)            │                               │ │
│   └───────────────────────────┴──────────────────────────────┘ │
├────────────────────────────────────────────────────────────────┤
│ RECURRING / BILLS (Rocket-Money module) §9                     │
│   upcoming-bills timeline · category rollups · cancel tracker  │
├────────────────────────────────────────────────────────────────┤
│ DREAM-CAR PROGRESS BAR §10  (WebGL 718 Cayman on a podium)      │
│   net worth ▸▸▸▸▸▸▸▸ $88,750                                    │
└────────────────────────────────────────────────────────────────┘
```

On `md` and up the portfolio/news row is two columns (`grid-cols-[1.5fr_1fr]`). On mobile it stacks.

---

## 5. Holdings → Supabase + Buy/Sell/Edit

### 5.1 Migration (`0008_finance_overhaul.sql`)
```sql
-- Live holdings, editable in-app. Replaces the read-only Google Sheet "Investments" tab.
create table if not exists fin_holdings (
  id            uuid primary key default gen_random_uuid(),
  ticker        text not null,                 -- uppercased symbol (Finnhub)
  raw_ticker    text,                          -- as the user typed it
  company_name  text,
  shares        numeric not null default 0,
  avg_cost      numeric,                       -- null = no cost basis
  instrument    text not null default 'equity',-- equity | etf | crypto
  sector        text,                          -- broad bucket; fallback via TICKER_META
  pinned        boolean not null default false,-- e.g. XRP price pinned
  pinned_price  numeric,
  opened_at     date,
  closed_at     date,                          -- non-null once fully sold (kept for history)
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists fin_holdings_open_idx on fin_holdings(ticker) where closed_at is null;
alter table fin_holdings enable row level security;
create policy "deny all fin_holdings" on fin_holdings for all using (false);

-- Immutable trade ledger (every buy/sell). avg_cost on fin_holdings is derived from this.
create table if not exists fin_trades (
  id          uuid primary key default gen_random_uuid(),
  holding_id  uuid references fin_holdings(id) on delete cascade,
  ticker      text not null,
  side        text not null,                   -- buy | sell
  shares      numeric not null,
  price       numeric not null,                -- execution price / share
  traded_at   timestamptz not null default now(),
  note        text,
  created_at  timestamptz not null default now()
);
alter table fin_trades enable row level security;
create policy "deny all fin_trades" on fin_trades for all using (false);
```

### 5.2 Data-layer changes
- New `lib/finance/holdings.ts`: `listOpenHoldings()`, `applyTrade({ticker, side, shares, price, note})`
  — on **buy**: upsert holding, recompute weighted `avg_cost` from the ledger, insert a trade;
  on **sell**: reduce shares, insert a trade, set `closed_at` when shares reach 0 (weighted avg
  cost is unchanged on sells). Always write to `fin_trades` first, then recompute the holding.
- **Refactor `lib/finance/refresh.ts`** to read holdings from `fin_holdings` (open positions) instead
  of `readFinanceSheet()`. Keep `sheets.ts` **only** for bank/liabilities/accounts (the
  "Assets & Liabilities" tab) until those are migrated too — or migrate them now into `fin_config`
  /a new `fin_accounts` table if you prefer fully sheet-free (recommended, see §5.4). Preserve the
  `MarketData` enrichment path (Finnhub quotes/profile/candles) unchanged.
- Auto-classify `instrument`/`sector` for new tickers via existing `TICKER_META` +
  `BROAD_SECTOR_FALLBACK`; if unknown, call Finnhub `profile2` once at add-time and store the result
  on the row so the daily refresh doesn't re-fetch.

### 5.3 UI: Buy/Sell/Edit
- A `+ Trade` button in the TOTAL HOLDINGS header opens a modal (`components/finance/TradeForm.tsx`).
  Fields: ticker (autocomplete via Finnhub `symbol search`), side (Buy/Sell), shares, price
  (prefill live quote, editable), optional note. On submit → `POST /api/finance/trade` →
  `applyTrade` → revalidate the view. Sub-second, no page reload.
- Inline **Edit** (pencil) on each holdings row for quick share/cost corrections (writes a
  `note:'manual adjust'` trade or a direct holding patch via `PATCH /api/finance/holding`).
- **Telegram parity** (optional, matches COMMAND-center direction): extend `lib/router/commandParse.ts`
  with `trade` grammar — `bought 10 NVDA @ 120` / `sold all TSLA @ 240` / `sold 5 AAPL` → `applyTrade`.
  Route via `routeText.ts`. This is the "as easy as possible" path the user wants.

### 5.4 One-time data load
Since the portfolio was fully re-ported, seed `fin_holdings` empty and let the user enter current
positions via the form/Telegram. Provide a `scripts/seed-holdings.ts` that accepts a JSON array so
the user can bulk-load once. (Ask the user for their current positions when they run this.)

---

## 6. Market News panel (right column) + 7am server-side brief

### 6.1 Migration
```sql
-- Daily/weekly AI market brief + per-day market headlines with sentiment.
create table if not exists fin_market_brief (
  id           uuid primary key default gen_random_uuid(),
  kind         text not null,                 -- 'daily' | 'weekly'
  brief_date   date not null,
  headline     text,                          -- one-line TL;DR
  body         text,                          -- AI narrative (markdown)
  bullets      jsonb,                         -- [{title, detail, sentiment}]
  movers       jsonb,                         -- top gainers/losers snapshot
  macro        jsonb,                         -- {treasury10y, cpi, fedFunds, ...}
  generated_at timestamptz not null default now(),
  unique (kind, brief_date)
);
alter table fin_market_brief enable row level security;
create policy "deny all fin_market_brief" on fin_market_brief for all using (false);
```

### 6.2 The 7:00am ET job — **server-side on Vercel, triggered by cron-job.org**
- New route `app/api/cron/market-brief/route.ts` (add `/api/cron` is already public; this route
  self-authenticates via `Bearer CRON_SECRET`). `export const maxDuration = 60`.
- **cron-job.org** job: schedule **07:00, timezone `America/New_York`** (set the job's timezone so
  DST is automatic — do NOT hardcode a UTC hour), method GET/POST, header
  `Authorization: Bearer <CRON_SECRET>`. Runs even when the user's computer is off. This mirrors the
  existing alerts job exactly.
- **Why server-side, not a Cowork task:** the attached Alpha Vantage MCP and Chrome tools only run
  inside Cowork (they are not available to the Vercel runtime). Running server-side means the brief
  is always fresh at 7am regardless of whether Cowork/the laptop is on. (A Cowork task remains a
  fine *optional* enrichment layer later — see §6.4.)

### 6.3 Data sources within the job (all free)
Prices already come from **Finnhub/Yahoo** (free, wired). Add **Alpha Vantage free** (env
`ALPHAVANTAGE_API_KEY`) strictly for news + macro. **Free tier = 25 req/day, 5 req/min** — budget
carefully and cache:
- `NEWS_SENTIMENT` with `tickers=<your open holdings, comma-sep>` → 1 call (portfolio news + per-ticker sentiment).
- `NEWS_SENTIMENT` with `topics=financial_markets,economy_macro,earnings` → 1 call (market-wide).
- `TOP_GAINERS_LOSERS` → 1 call (movers).
- Macro (cache 24h+, they move slowly): `TREASURY_YIELD` (10y), `CPI`, `FEDERAL_FUNDS_RATE` → 3 calls.
- **Total ≈ 6 calls/day**, comfortably under 25. Store raw results in `fin_market_cache` under new
  keys (`av:news:portfolio`, `av:news:market`, `av:movers`, `av:macro`) with their own TTLs.
- If `ALPHAVANTAGE_API_KEY` is missing, the job degrades to Finnhub `getNews` for headlines and skips
  macro (fail-soft, like `gemini.ts`).

### 6.4 The AI narrative (Anthropic — matches existing pattern)
Use the SDK already in the repo: `new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })`,
`model: process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6'` (same as `lib/nutrition/foodLog.ts`).
- **Daily** (every 7am): feed the day's Alpha Vantage news + movers + macro + the user's holdings.
  Ask for strict JSON `{headline, body, bullets:[{title,detail,sentiment}]}` — a tight,
  "Nova money-coach" voice: what happened, what matters *for this portfolio*, one thing to watch.
  Keep `body` ≤ 120 words. Store `kind:'daily'`.
- **Weekly** (when `brief_date` is a Sunday, or a separate `?kind=weekly`): a longer synthesis of the
  week + the portfolio scoring inputs from §8. Store `kind:'weekly'`.
- Always append "Not financial advice." Never invent facts beyond the provided data (same rule as
  `gemini.ts`).

### 6.5 UI
`components/finance/MarketNews.tsx` in the right column: the daily TL;DR headline (cyan, `--bloom-cyan`),
the AI body, a short list of bullets with a sentiment dot (green/red/neutral), a "Movers" strip, and a
"This week" expandable for the weekly brief. Reads from `GET /api/finance` (extend the view payload
with `marketBrief`).

---

## 7. Top-3 cards depth + fixing the "janky" holdings chart

**The user's two asks here:** (a) top-3 stock info/news must be *much* deeper; (b) the per-row chart
line for non-top-3 holdings "looks janky" — shorten it and split the section in two.

### 7.1 Top-3 cards — deeper research
Extend `refresh.ts` for the top-3 to fetch and cache (Finnhub free + Alpha Vantage budget permitting):
- **Fundamentals:** `COMPANY_OVERVIEW` (P/E, market cap, 52w hi/lo, analyst target) — Alpha Vantage,
  or Finnhub `metric`. Cache; only top-3, so ≤3 calls, still within budget when combined with §6.3
  (move company-overview to a **weekly** refresh to save daily calls).
- **Earnings:** next earnings date + last surprise (`EARNINGS_CALENDAR` / Finnhub `earnings`).
- **News + sentiment:** already have `getNews`; add the Alpha Vantage per-ticker sentiment score.
- **AI outlook:** keep `fin_outlook_cache` but you may switch `generateOutlook` from Gemini to the
  Anthropic client for consistency (optional). Show: 2–3 sentence week summary + balanced outlook +
  next-earnings chip + analyst target vs price.
- Card layout: price, 7D and cost P/L (keep), a **cleaner** line chart (keep `LineChart` + range
  toggle), then a richer info block (fundamentals row → news → AI outlook → "Not financial advice.").

### 7.2 Non-top-3 holdings table — shorten the sparkline, split the row
- In the holdings table, the current full-width `Sparkline` column (`h-7` spanning `1fr`) is the janky
  part. **Replace it with a compact fixed-width mini-spark** (e.g. `w-[56px] h-6`), or a tiny 7-day
  delta bar. Regrid the table to remove the stretched column:
  `grid-cols-[64px_56px_72px_120px_120px_84px_76px_88px]` (TICKER, mini-spark, PRICE, 7D P/L, COST
  P/L, SHARES, AVG, VALUE). This "cuts the chart line in half" so it no longer looks stretched.
- Put this table in the **left** column (~60%); the **right** column is Market News (§6). This is the
  "current section less stretched and moved to the left" the user described.

---

## 8. Portfolio scoring (market-cap sentiment + diversification/risk)

**Ask:** market-cap and diversification donuts should be **different colors** and be **scored** —
market-cap by *current market sentiment*, diversification by *whether it's in the right buckets and
how much risk is taken*, plus **main risk factors** and an **upside narrative**.

### 8.1 Migration
```sql
create table if not exists fin_portfolio_score (
  id             uuid primary key default gen_random_uuid(),
  scored_date    date not null unique,
  sentiment_score int,                 -- 0..100 (market-cap-weighted sentiment)
  sentiment_label text,                -- e.g. 'Bullish' | 'Neutral' | 'Bearish'
  diversification_score int,           -- 0..100
  diversification_label text,          -- 'Concentrated' .. 'Well-diversified'
  risk_score     int,                  -- 0..100 (higher = more risk)
  risk_factors   jsonb,                -- ["68% in semis", "no defensive sleeve", ...]
  upside         text,                 -- upside narrative (AI)
  generated_at   timestamptz not null default now()
);
alter table fin_portfolio_score enable row level security;
create policy "deny all fin_portfolio_score" on fin_portfolio_score for all using (false);
```

### 8.2 Logic (computed in the 7am job, after holdings enrich)
- **Sentiment score:** market-cap-weighted average of per-ticker Alpha Vantage news-sentiment scores
  (`ticker_sentiment_score`, range ≈ -0.35..0.35 → normalize to 0..100). Color via the cyan→red ramp
  (§3). Label thresholds: ≥60 Bullish, 40–59 Neutral, <40 Bearish.
- **Diversification score:** deterministic from the existing `sectorPie`/`capPie` — penalize
  concentration (e.g. Herfindahl index across sectors), reward presence across ≥4 broad buckets and a
  non-trivial defensive/large-cap sleeve. Color via the amber→violet `--score-div-*` ramp.
- **Risk score:** blend of concentration + small/mid-cap weight + single-name max weight + crypto %.
- **risk_factors + upside:** ask Anthropic (same client) to turn the numeric inputs + sector/cap mix
  + sentiment into `{risk_factors:[...4 max], upside:"..."}` — concrete, portfolio-specific, no fluff.

### 8.3 UI
Under the two donuts, render two **gauges** (not just donuts): SENTIMENT (cyan family) and
DIVERSIFICATION/RISK (amber→violet), each with its numeric score, label, and a one-line reason.
Below them a compact **Risk factors** list (stark-red dots) and an **Upside** line (cyan). Animate the
gauge fill on load (§11).

---

## 9. Recurring expenses — full Rocket-Money module

### 9.1 Migration
```sql
-- Recurring charges (subscriptions, trials, fixed-term, one-off future bills).
create table if not exists fin_recurring (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  merchant       text,
  category       text not null,          -- streaming | software | insurance | rent | utility | gym | phone | other
  type           text not null,          -- subscription | trial | fixed_term | one_off
  amount         numeric not null,
  cadence        text not null,          -- monthly | yearly | weekly | quarterly | one_time
  next_due       date,                   -- next charge/renewal date
  start_date     date,
  expiration_date date,                  -- trial end / fixed-term end (null = ongoing)
  status         text not null default 'active', -- active | canceled | expired | paused
  auto_renews    boolean not null default true,
  notify_days_before int not null default 3,
  last_notified_at timestamptz,
  note           text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists fin_recurring_active_idx on fin_recurring(status, next_due);
alter table fin_recurring enable row level security;
create policy "deny all fin_recurring" on fin_recurring for all using (false);
```

### 9.2 Type → expiration behavior (the core logic the user asked for)
- `subscription` — ongoing; `next_due` rolls forward by `cadence` after each charge; no `expiration_date`.
- `trial` — has `expiration_date`; alert `notify_days_before` the trial ends ("cancel or it converts");
  on expiry, prompt to convert to `subscription` or mark `canceled`.
- `fixed_term` (insurance, lease, financing) — `expiration_date` = term end; if `auto_renews`, roll to
  a new term and alert; else mark `expired` and alert "ended".
- `one_off` — a single future bill (`cadence='one_time'`); drops off after `next_due` passes.

### 9.3 UI (`components/finance/Recurring.tsx`) — Rocket-Money patterns
- **Upcoming-bills timeline:** horizontal 30-day strip with each bill dotted on its `next_due`
  (trials in stark-red, subscriptions in cyan), plus a "Next 7 days: $X" total.
- **Category rollups:** grouped list (streaming/software/insurance/…) with per-category monthly total
  and a bar; a top-line **"$X/mo recurring"** figure.
- **Cancellation tracker:** a Cancel toggle sets `status='canceled'`, logs the date, and shows
  "you're saving $Y/mo" — mirroring Rocket Money's cancel flow (we do **not** auto-cancel with the
  merchant; it's a tracker + reminder).
- **Add/Edit form:** name, merchant, category, type, amount, cadence, dates, notify-days.
- **Net-worth/budget integration:** the monthly recurring total feeds a new line in the money header
  ("committed $X/mo") and is available to the food/budget math. Do not silently change `netWorth`
  formula; add committed spend as a *forward* obligation display, and only subtract realized charges
  from bank (via §10 spend log), not projected ones — flag this choice in the session log.

### 9.4 Alerts
Extend the existing `/api/cron/alerts` route (cron-job.org, 5-min) OR add a **daily** check in the
7am job: for any `fin_recurring` with `next_due`/`expiration_date` within `notify_days_before` and
`last_notified_at` older than the window, send a Telegram message (reuse the `sendTelegram` helper in
`app/api/cron/alerts/route.ts`) and set `last_notified_at`. Dedupe like the appointment alerts.

---

## 10. Credit card + credit score (Discover, manual) & spend tracking

### 10.1 Migration
```sql
create table if not exists fin_credit_accounts (
  id               uuid primary key default gen_random_uuid(),
  issuer           text not null default 'Discover',
  nickname         text,
  last4            text,
  credit_limit     numeric,
  current_balance  numeric not null default 0,
  statement_balance numeric,
  min_payment      numeric,
  due_date         date,
  apr              numeric,
  autopay          boolean default false,
  notify_days_before int not null default 5,
  last_notified_at timestamptz,
  updated_at       timestamptz not null default now()
);
alter table fin_credit_accounts enable row level security;
create policy "deny all fin_credit_accounts" on fin_credit_accounts for all using (false);

-- FICO history (Discover shows FICO Score 8, refreshed ~every 30 days on statement/app).
create table if not exists fin_credit_score (
  id          uuid primary key default gen_random_uuid(),
  score       int not null,
  model       text default 'FICO 8',
  source      text default 'Discover',
  scored_on   date not null,
  created_at  timestamptz not null default now()
);
alter table fin_credit_score enable row level security;
create policy "deny all fin_credit_score" on fin_credit_score for all using (false);

-- Free spend log (manual/Telegram/merchant-email). Not a bank feed — see §10.3.
create table if not exists fin_spend (
  id          uuid primary key default gen_random_uuid(),
  amount      numeric not null,
  merchant    text,
  category    text,                 -- coffee | food | transport | shopping | ...
  source      text default 'manual',-- manual | telegram | email_receipt | statement_import
  spent_at    timestamptz not null default now(),
  raw         text,
  created_at  timestamptz not null default now()
);
create index if not exists fin_spend_time_idx on fin_spend(spent_at);
alter table fin_spend enable row level security;
create policy "deny all fin_spend" on fin_spend for all using (false);
```

### 10.2 Credit card UI + alerts
- A new **Credit** card in the money header: current balance, statement balance, **min payment**,
  **due date** (with a countdown chip that turns amber ≤5 days, stark-red ≤2), utilization
  `current_balance / credit_limit` (color-ramped; >30% amber, >50% red), and the latest **FICO** with
  a small sparkline of `fin_credit_score` history + delta vs last month.
- Manual entry form (`components/finance/CreditForm.tsx`). The user updates balance/due/score monthly
  from the Discover app or statement. Discover surfaces FICO Score 8 free every ~30 days.
- **Payment-due alerts:** same cron pattern as §9.4 — Telegram "Discover payment $X due in N days".

### 10.3 Spend tracking — SimpleFIN primary + free fallbacks
Research finding: **SoFi does not send per-transaction emails** (only in-app push + fraud alerts), so
free methods can't fully auto-pull daily coffee-level spend. The user opted for the cheapest real
automation: **SimpleFIN Bridge — $15/year ($1.50/mo)** — which reaches SoFi via MX, connects
**read-only** (no credential storage, no screen-scraping), and returns clean transaction JSON on a
daily sync. Build this as the **primary** spend source, with the free methods as fallbacks/backfill.

1. **SimpleFIN Bridge (primary, automated, $15/yr):**
   - One-time setup: the user creates a SimpleFIN Bridge account, connects SoFi, and generates a
     **Setup Token**; the app exchanges it **once** for a permanent **Access URL** (HTTP Basic creds
     embedded) which is stored in the `SIMPLEFIN_ACCESS_URL` env var. Do the token→access-URL claim
     in a small `scripts/simplefin-claim.ts` (POST the base64-decoded setup token's claim URL) so no
     secrets are hardcoded.
   - New route `app/api/cron/simplefin/route.ts` (self-auth via `Bearer CRON_SECRET`; `/api/cron`
     already public). **cron-job.org** daily job (e.g. 06:30 America/New_York, before the 7am brief).
     It GETs `${SIMPLEFIN_ACCESS_URL}/accounts?start-date=<lastSync>`, iterates `transactions`, and
     **upserts `fin_spend`** with `source='simplefin'`, `raw=<txn json>`, deduping on the SimpleFIN
     transaction `id` (add a nullable `ext_id text unique` column to `fin_spend` — see migration note
     below). Auto-categorize each new txn with the Anthropic client (batch them in one call: map
     merchant→category coffee/food/transport/shopping/…). Fail-soft if the key/URL is absent.
   - Migration addition to `fin_spend` (in `0008`): `ext_id text`, `account_name text`, and
     `create unique index if not exists fin_spend_extid_idx on fin_spend(ext_id) where ext_id is not null;`
   - This also gives you real SoFi **balance** for the net-worth bank figure (SimpleFIN returns account
     balances) — optionally replace the sheet-derived `bankSeed` accrual with the live SoFi balance
     and flag the change in the session log.
2. **Telegram quick-log (fallback, cash/instant):** extend the capture router — `coffee 6`,
   `spent 12 lunch`, `$40 gas` → `fin_spend` (`source='telegram'`). For spend SimpleFIN can't see
   (cash) or when you want it logged the moment it happens.
3. **Monthly statement import (backstop):** drop a SoFi/Discover CSV/PDF once a month → parse to
   `fin_spend` (`source='statement_import'`) to true-up. Dedup against `simplefin` rows by
   date+amount+merchant.
4. **Gmail merchant receipts (optional extra):** a weekly `/api/cron/receipts` job can still parse
   Amazon/DoorDash/etc. receipt emails (`source='email_receipt'`) for richer line-item detail; low
   priority now that SimpleFIN covers the bank feed.

Spend feeds a "Today / This-week spend" readout and the food/budget category math.

---

## 11. Dream-car progress bar (WebGL) + animations

### 11.1 The progress bar
- New `components/finance/DreamCar.tsx`, full-width at the page bottom. A slim **progress rail**:
  current **net worth** → target **$88,750** (`2022 Porsche 718 Cayman GTS 4.0`). Store target in
  `fin_config` (`dream_target numeric default 88750`, `dream_label text`). Show `$netWorth / $88,750`,
  percent, and a count-up animation on the number (ease-out, `--snap`-ish, respects
  `prefers-reduced-motion`).
- **WebGL car on a podium:** a `three.js` (r128, already whitelisted in the artifact stack) scene:
  a `.glb` Porsche 718 Cayman slowly rotating on a glowing cylindrical podium, cyan rim-light,
  dark reflective floor, subtle bloom. The car "advances"/brightens as the percent climbs (e.g.
  emissive rim intensity or a filling light ring around the podium = progress).
- **Model sourcing (self-host the file):** download a free 718 Cayman `.glb` and place in
  `public/models/cayman.glb`. Candidates (verify license — most are CC-Attribution, so add credit in
  a code comment + an on-page tiny "model: <author>" note):
  - 2018 Porsche 718 Cayman GTS — Sketchfab (Ddiaz Design):
    `https://sketchfab.com/3d-models/2018-porsche-718-cayman-gts-ed07dfc50f8146aea10143232657c061`
  - 2020 718 Cayman GT4 — Sketchfab (Outlaw Games):
    `https://sketchfab.com/3d-models/2020-porsche-718-cayman-gt4-357999b7e87642e38062623127a61bb2`
  - 2017 718 Cayman (982) — Sketchfab (Ddiaz Design):
    `https://sketchfab.com/3d-models/2017-porsche-718-cayman-982-c599b3aa82eb46f7ba3bb2d22bd9dfc6`
  Load with `GLTFLoader`; if the model fails/isn't present, fall back to a stylized neon SVG car
  silhouette so the page never breaks. Lazy-load the three.js scene (dynamic import, `ssr:false`) and
  pause the render loop when offscreen to protect performance.
- **Reference imagery** (for materials/lighting, not required assets): the exact color the user likes
  is the Arctic/Ice-grey car in their screenshot; tune the paint material toward that.

### 11.3 Car visual reference (from image research)
Confirmed by pulling up the 2022 718 Cayman GTS 4.0 in Chrome image search:
- **Target paint:** cool light silver-grey — **GT Silver Metallic / Arctic Grey**. Model it as a
  metallic PBR material: base `oklch(~0.78 0.01 240)`, low roughness (~0.25), clearcoat, subtle
  metallic flake. Keep the cyan podium rim-light as the key so the paint picks up a HUD-blue sheen.
- **Hero angle for the turntable:** start the rotation on the **rear-3/4** (shows the ducktail/wing
  and quad-tip center exhaust — the GTS 4.0's signature), sweeping through the side profile.
- **Signature cues to preserve** in whatever `.glb` is used: satin-black wheels, black side-intake
  trim, GTS badging, low stance. Avoid GT4-RS wings — GTS 4.0 has the subtler spoiler.
- **Good public reference galleries** (for eyeballing materials, not for hotlinking): Porsche
  Newsroom press kit, Car and Driver, and Stuttcars 718 GTS 4.0 galleries. Self-host the chosen
  `.glb` per §11.1; use these only to tune paint/lighting.

### 11.2 More futuristic animations (clean, not noisy)
Keep the existing `FinanceCore`. Add, all gated behind `prefers-reduced-motion`:
- Card-border cyan "charge" sweep on hover (`--card-border-hover`, `--snap`).
- Number **count-ups** on net worth, holdings total, recurring total, progress percent.
- **Gauge fill** animations for the §8 scores.
- A faint ambient **particle/scanline drift** in the `FinanceCore` and behind the DreamCar podium
  (period `--drift-period`).
- Sparkline/line-chart **draw-on** (stroke-dashoffset) when a card mounts.
- Sentiment dots and the due-date countdown **pulse** subtly when in alert range.
Prefer CSS/transform + `requestAnimationFrame`; avoid layout thrash. Do not animate on every render —
only on mount / value-change.

---

## 12. Build order (phased — commit per phase)

1. **Migration 0008** (all tables) + regenerate types. Verify RLS deny-all + build passes.
2. **Holdings → Supabase**: `holdings.ts`, refactor `refresh.ts` to read `fin_holdings`, TradeForm +
   `/api/finance/trade` + `/api/finance/holding`, Telegram `trade` grammar. Seed script. *(Portfolio
   editable — the user can fix all stale positions here.)*
3. **Layout split**: move holdings table left + shorten sparkline; scaffold the right column.
4. **7am market-brief job**: `/api/cron/market-brief`, Alpha Vantage client (budgeted), Anthropic
   narrative, `fin_market_brief`; wire cron-job.org (America/New_York 07:00). MarketNews panel.
5. **Portfolio scoring**: `fin_portfolio_score`, gauges, risk/upside.
6. **Recurring module**: `fin_recurring`, Recurring.tsx, alerts hook.
7. **Credit + spend**: `fin_credit_*`, `fin_spend` (+ `ext_id`), Credit card UI, **SimpleFIN daily
   sync** (`scripts/simplefin-claim.ts` + `/api/cron/simplefin`, cron-job.org 06:30 ET), Telegram
   spend grammar, statement import, optional Gmail receipts.
8. **DreamCar WebGL** + progress + animations pass.
9. **Verification** (§13) + session log.

Ship incrementally; each phase should build (`next build`) and deploy green before the next.

---

## 13. Verification checklist (do before declaring done)

- `next build` + `tsc --noEmit` clean. (Note: OneDrive mount can lag right after edits — verify from
  source or via a Vercel preview deploy, per memory `miles-os-onedrive-mount-lag`.)
- Migration applies cleanly on a fresh DB; every new table has RLS deny-all.
- `/api/finance` returns the extended view (holdings from Supabase, marketBrief, scores) with no
  Google-Sheet dependency for holdings.
- `applyTrade` math: buy→avg-cost weighting, partial sell, full sell (`closed_at` set) — unit-check
  with a script.
- `/api/cron/market-brief` returns 200 with `Bearer CRON_SECRET`, 401 without; runs under 60s;
  Alpha Vantage calls ≤ ~6 and fail-soft when key absent.
- cron-job.org job created at America/New_York 07:00 (screenshot/confirm DST behavior).
- SimpleFIN: `simplefin-claim.ts` yields a working Access URL; `/api/cron/simplefin` pulls SoFi txns,
  dedupes on `ext_id`, categorizes, and inserts `source='simplefin'` rows; fail-soft when the env
  var is absent. Daily cron-job.org job at 06:30 ET confirmed.
- Recurring + credit alerts fire via Telegram and dedupe.
- DreamCar: model loads; SVG fallback works when `cayman.glb` is missing; render loop pauses
  offscreen; `prefers-reduced-motion` disables heavy motion.
- No oklch→hex regressions; `Shell`/`TopRail` intact; capture pipeline untouched.

---

## 14. Env vars to add (Vercel: shared, Production + Preview)

- `ALPHAVANTAGE_API_KEY` — free key (25 req/day) for news + macro. Fail-soft if absent.
- `SIMPLEFIN_ACCESS_URL` — permanent SoFi read-only Access URL from SimpleFIN Bridge ($15/yr), set
  once via `scripts/simplefin-claim.ts`. Powers the daily spend + SoFi-balance sync. Fail-soft if absent.
- `DREAM_TARGET` (optional; else `fin_config.dream_target = 88750`).
- Reuse existing: `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `CRON_SECRET`, `TELEGRAM_BOT_TOKEN`,
  `TELEGRAM_USER_ID`, `USER_TIMEZONE`, Finnhub key, Supabase service creds.

---

## 15. Known constraints / decisions (surfaced honestly)

- **SoFi has no per-transaction email** → no zero-cost fully-automated daily bank feed. The user
  opted for **SimpleFIN Bridge ($15/yr)** as the primary automated feed (read-only, daily sync, SoFi
  via MX), with Telegram quick-log + statement import as fallbacks. This is the cheapest real
  automation; Plaid is enterprise-priced and overkill for one user.
- **Alpha Vantage free = 25 req/day** → the brief is budgeted to ~6 calls and caches macro/weekly
  fundamentals; prices stay on the already-free Finnhub/Yahoo path.
- **Vercel Hobby = daily cron only** → the 7am job runs via cron-job.org, matching the existing
  alerts architecture.
- **3D model licensing** → self-host a CC-Attribution `.glb` and credit the author; SVG fallback
  guarantees the page renders without it.
- **Discover FICO** is FICO Score 8, refreshed ~monthly → manual entry cadence is monthly; the score
  sparkline makes the trend visible.
```
