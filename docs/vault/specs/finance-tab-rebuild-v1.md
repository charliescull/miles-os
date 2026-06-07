---
title: Finance Tab — Rebuild Spec (v1)
tags: [finance, spec, rebuild]
date_authored: 2026-05-28
status: in-progress
---

# MILES OS // Finance Tab — Rebuild Spec (v1)

**Target:** the existing Next.js app on Vercel (`/finance` route). Replace the current Finance page body only. Keep the global nav (HOME / CRM / FINANCE / HEALTH / REVIEW) and the existing color tokens.

> Every decision below is intentional — do not "improve" the money math or the layout without flagging. Where a value is a tunable, it's marked **(knob)**.

---

## 0. TL;DR of what changes

The old Finance tab (Runway / Burn / Save-rate / multi-account liabilities) is scrapped. The new page is two things:

1. **A tight money header** — Net Worth + a weekly Food Budget.
2. **A real positions terminal** — total holdings, top-3 cards with charts + news + AI outlook, all other holdings as rows, and two pie charts.

Styling: NYSE/ThinkOrSwim feel, **green = up / red = down**, using the dashboard's *existing* palette.

---

## 1. Architecture & stack

| Layer | Choice | Notes |
|---|---|---|
| App / UI | Next.js on Vercel (existing) | Rebuild `/finance` page + components only |
| Database | **Supabase (Postgres)** | New tables are **additive** — use `CREATE TABLE IF NOT EXISTS`. |
| Holdings + accounts source | **Google Sheets** (existing integration) | Read-only inputs. Keep reading via the existing connection. |
| Stock prices / history / news / sector+cap | **Finnhub** | Free tier. Quotes + company-news free; **historical candles NOT reliable on free** — fallback below. |
| Chart-history fallback | **Twelve Data** (free 800/day) → **Stooq** (keyless) | Used only if Finnhub `/stock/candle` returns 403 / no-access. |
| Crypto (XRP only) | **None for now** | XRP price is **pinned** (see §4). Wire CoinGecko later. |
| AI outlook | **Gemini 2.5 Pro** | Key not yet provisioned — graceful fallback required (see §9). |
| Refresh | **12h rolling + manual button** | Staleness-check on load; manual force-refresh. Credit-cheap. |

**Data flow per refresh:** Google Sheets (holdings, avg cost, accounts, liabilities) → compute → enrich with Finnhub (quote, candle w/ fallback, profile2, company-news) + pinned XRP → Gemini outlook for top-3 → write `fin_market_cache` + `fin_outlook_cache` + a `fin_networth_snapshots` row → render.

---

## 2. Inputs — Google Sheets contracts

### 2a. `Investments` tab
Columns: **A Ticker · B Date Recorded · C Shares · D Avg Cost**. Read rows until blank. The final row labelled **`Buying power`** is brokerage cash, not a ticker — parse it separately into `BUYING_POWER`.

Current holdings (avg cost for GOOGL supplied this round):

| Ticker | Shares | Avg Cost | Instrument | Broad sector | Special handling |
|---|---|---|---|---|---|
| XRP | 260.71 | 1.92 | Crypto | Crypto | **Price PINNED = 1.29** |
| AMZN | 0.129873 | 268.57 | Equity | Consumer Discretionary | |
| TSM | 0.134368 | 415.58 | Equity (ADR) | Technology | |
| NVDA | 0.161455 | 234.74 | Equity | Technology | |
| RR | 2 | 7.08 | Equity | Industrials | Richtech Robotics (NASDAQ:RR) — *not* Rolls-Royce |
| AMD | 1.673354 | 265.47 | Equity | Technology | |
| META | 0.025066 | 617.57 | Equity | Communication Services | sheet shows "Meta" → symbol `META` |
| RMCF | 1 | 1.61 | Equity | Consumer Discretionary | Rocky Mountain Chocolate Factory |
| GLTR | 2 | 228.33 | **ETF (commodity)** | **Precious Metals** | abrdn Physical Precious Metals Basket; no equity sector/cap |
| MU | 0.143112 | 789.87 | Equity | Technology | basis is correct (Micron ~$940 in May '26) |
| LRCX | 0.220023 | 299.65 | Equity | Technology | |
| GOOGL | 0.119372 | **400.60** | Equity | Communication Services | avg cost provided 2026-05-28 |
| MSFT | 0.06085 | 409.70 | Equity | Technology | |
| ORCL | 0.071448 | 195.67 | Equity | Technology | |
| BJ | 1 | 86.60 | Equity | Consumer Staples | BJ's Wholesale |

`BUYING_POWER = 345.54` (cash).

> Implementation note: keep `SECTOR_MAP` (ticker → broad sector) hardcoded from the table above — owner chose **broad** sectors (chips fold into **Technology**). For *new* tickers added later, fall back to `profile2.finnhubIndustry` mapped to a broad bucket.

### 2b. `Assets and Liabilities` tab
Read these named values (by label, not row index, to survive reordering):

**Assets used:** `Bank account` = **89.93** (`BANK_SEED`), `11 Week Take Home Pay` = **6994.46**, `Federal Tax Recovery (Refund)` = **598.23**, `State Tax Recovery (Refund)` = **207.12**. (`Robinhood` = 2487.99 is informational only — positions are computed live; may use it for a reconciliation warning.)

**Liabilities (all 11-week totals EXCEPT grocery, which is weekly):** `Hertz Car Rental` = 2172.62, `Total Rent` = 1015.41, `EV Charging Budget` = 220.00, `4th of July Reserve` = 300.00, `Grocery Budget/Week` = **150.00 (per week)**.

---

## 3. Constants

```
TOTAL_WEEKS        = 11
WEEK_ANCHOR        = 2026-05-31   // Sunday of the June-1 start week (see §5 knob)
BANK_SEED          = 89.93
BUYING_POWER       = 345.54
XRP_PINNED_PRICE   = 1.29
GROCERY_WEEKLY     = 150.00
TAKEHOME_11WK      = 6994.46
REFUNDS            = 805.35       // 598.23 + 207.12
LIAB_NONFOOD_11WK  = 3708.03      // 2172.62 + 1015.41 + 220.00 + 300.00
GROCERY_11WK       = 1650.00      // 150.00 * 11
WEEKLY_PROFIT      = 221.98       // (TAKEHOME_11WK + REFUNDS - LIAB_NONFOOD_11WK - GROCERY_11WK) / 11
REFRESH_TTL_HOURS  = 12
CAP_THRESHOLDS     = { mega: 200e9, large: 10e9, mid: 2e9, small: 0.3e9 } // USD; below small = micro  (knob)
```

Prefer storing the tunables in a `fin_config` row (§7) so they can change without redeploys; compute `WEEKLY_PROFIT` from the sheet each refresh and cache it.

---

## 4. XRP handling (pinned, temporary)

XRP is the only crypto; owner asked to **pin it at its current price ($1.29)** for now. Therefore:
- Do **not** call any crypto API.
- `price(XRP) = XRP_PINNED_PRICE`.
- 7-day price-move P/L for XRP = **0** (no history). Cost-basis P/L still computes: `(1.29 − 1.92) × 260.71 ≈ −$164`.
- XRP's chart: render a flat line at 1.29 with a small `PINNED` badge, or suppress the chart and show "price pinned". Don't fetch candles for it.
- Leave a clearly-marked `// TODO: swap XRP to CoinGecko` seam so it's a one-function change later.

---

## 5. Calculations (authoritative)

### Net worth
```
positions_value   = Σ ( shares_i × price_i )      // all 15 holdings; XRP uses pinned price
investments_side  = positions_value + BUYING_POWER   // cash IS included in the holdings total
bank_balance      = BANK_SEED
                    + WEEKLY_PROFIT × completed_weeks
                    + Σ food_variance(closed_weeks)
net_worth         = investments_side + bank_balance
```
- `price_i` (equities/ETF) = Finnhub `quote.c`. XRP = pinned.
- `completed_weeks = clamp( floor( (today − WEEK_ANCHOR) / 7 days ), 0, TOTAL_WEEKS )`. Before the anchor → 0 (internship not started; starts accruing the week of June 1).
- The **dropdown** under Net Worth **reveals** the split (Bank `bank_balance` vs Investments `investments_side`). It does **not** toggle the headline number.

### Weekly profit (the displayed metric)
`WEEKLY_PROFIT ≈ $221.98/wk` — this is the **budgeted** figure (assumes the $150 food budget is spent exactly). Show it near the net-worth/bank area. Actual realized growth varies by food variance.

### Food budget (budget-cost + variance model — avoids double counting)
- Grocery is already subtracted inside `WEEKLY_PROFIT` as a budgeted $150/wk. The live tracker therefore only pushes the **variance** to the bank.
- Week runs **Sunday → Saturday**. On load, ensure a `fin_food_weeks` row exists for the current week (`budget = 150`).
- A quick input "spent $__" appends to `fin_food_log` and decrements the displayed **remaining balance** (`150 − sum(spent this week)`), which can go negative (overspend).
- On week rollover (first load on/after a new Sunday): close the prior week → `variance = 150 − spent`; this variance enters `bank_balance` via `Σ food_variance(closed_weeks)`.
- Net effect (the $150 cancels): each closed week moves `(WEEKLY_PROFIT + 150 − actual_spent)` into the bank — i.e. real growth = pay + refunds − non-food liabilities − **actual** food spent.

### Holdings total + 7-day total P/L (top-left of Investments)
```
holdings_total    = investments_side                 // positions + buying power
total_7d_$        = Σ shares_i × ( price_now_i − price_7d_ago_i )   // XRP=0, cash=0
total_7d_pct      = total_7d_$ / positions_value_7d_ago
```
Color the 7d figures green/red; arrow ▲/▼.

### Per-holding P/L (owner chose **show both**)
```
price-move (7d):  $ = (price_now − price_7d_ago) × shares ;  % = price_now/price_7d_ago − 1
cost-basis:       $ = (price_now − avg_cost)     × shares ;  % = price_now/avg_cost     − 1
```
GOOGL now has a basis (400.60) so its cost-basis side renders. Color each figure independently (green ≥ 0, red < 0). Subtle per-row tint optional **(knob)**.

### Top-3 selection
Top 3 holdings **by current `position_value`, excluding cash.** ⚠️ Because most equity positions are tiny fractional shares, the largest positions by value are currently **GLTR, XRP, AMD** — not the mega-caps. The mega-caps appear in the rows below. (See §11 to re-rank.)

### Pie charts (bottom; cash excluded from both)
- **Sector pie:** sum `position_value` by broad sector from `SECTOR_MAP`. XRP → its own **Crypto** slice; GLTR → **Precious Metals** slice. Expect Technology to dominate.
- **Cap pie:** bucket each equity by live `profile2.marketCapitalization` (Finnhub returns it in **millions** → ×1e6) against `CAP_THRESHOLDS`. XRP → **Crypto** slice; GLTR → **Commodity** slice (no equity cap).

---

## 6. Page layout

```
+---------------------------------+--------------------------------+
| NET WORTH        $X,XXX         | FOOD BUDGET                    |
|   ⌄ bank / investments split    |   $XXX remaining (Sun–Sat)     |
|   weekly profit  +$221.98 (budg)|   [ spent $__ ]  [ log ]       |
+---------------------------------+--------------------------------+
+------------------------------------------------------------------+
| INVESTMENTS                                                      |
| TOTAL HOLDINGS  $X,XXX        ▲ +X.X%  / +$XX   (7d)             |
|                                                                  |
|  +----------+  +----------+  +----------+    top 3 by value      |
|  | GLTR     |  | XRP      |  | AMD      |                        |
|  | price/PL |  | price/PL |  | price/PL |                        |
|  | [LINE]   |  | [LINE]   |  | [LINE]   |   toggle: 7d|30d|60d   |
|  | news+AI  |  | news+AI  |  | news+AI  |   (Gemini + tag)       |
|  +----------+  +----------+  +----------+                        |
|                                                                  |
|  -- all holdings · sorted by value --                            |
| TSM   ----  $XXX  +x%/+$x (7d)  | +y%/+$y (cost)  sh  avgcost    |
| NVDA  ----  ...                                                  |
| ...                                                              |
|                                                                  |
|  +------------+      +------------+                              |
|  | SECTOR donut|     | CAP donut  |   hover = %                  |
|  +------------+      +------------+                              |
+------------------------------------------------------------------+
```

- **Top-3 cards:** ticker + company name, current price, both P/Ls, a **line chart** (default 7d, toggle 7/30/60), then a short **news summary + Gemini outlook** with a `Not financial advice` tag.
- **Rows:** sparkline (7d) + price + 7d price-move P/L ($ & %) + cost-basis P/L ($ & %) + shares + avg cost + position value. One row per holding.
- **Snapshot History table is removed** — page ends on the two donuts. (Net-worth snapshots still written to DB silently; no UI table.)

---

## 7. Supabase schema (additive)

```sql
create table if not exists fin_config (
  id            int primary key default 1,
  internship_anchor date   not null default '2026-05-31',
  total_weeks   int        not null default 11,
  bank_seed     numeric    not null default 89.93,
  buying_power  numeric    not null default 345.54,
  xrp_pinned    numeric    not null default 1.29,
  grocery_weekly numeric   not null default 150.00,
  weekly_profit numeric,               -- recomputed from Sheets each refresh
  updated_at    timestamptz not null default now()
);

create table if not exists fin_market_cache (
  cache_key   text primary key,        -- e.g. 'quotes', 'candle:AMD:D', 'news:AMD', 'profile:AMD'
  payload     jsonb       not null,
  fetched_at  timestamptz not null default now()
);

create table if not exists fin_food_weeks (
  week_start  date primary key,        -- the Sunday
  budget      numeric not null default 150.00,
  spent       numeric not null default 0,
  variance    numeric,                 -- set when closed = true
  closed      boolean not null default false
);

create table if not exists fin_food_log (
  id          bigserial primary key,
  week_start  date not null references fin_food_weeks(week_start),
  amount      numeric not null,
  note        text,
  created_at  timestamptz not null default now()
);

create table if not exists fin_networth_snapshots (
  id               bigserial primary key,
  taken_at         timestamptz not null default now(),
  net_worth        numeric,
  investments_side numeric,
  positions_value  numeric,
  buying_power     numeric,
  bank_balance     numeric,
  weekly_profit    numeric
);

create table if not exists fin_outlook_cache (
  ticker       text primary key,
  summary      text,
  outlook      text,
  headlines    jsonb,
  generated_at timestamptz not null default now()
);
```

> Use the service-role key server-side only. (MILES OS convention: enable RLS deny-all on every new table — service role bypasses it.)

---

## 8. Refresh logic (12h rolling + manual)

- **On `/finance` load (server side):** read `fin_market_cache` for key `quotes`. If `now − fetched_at > REFRESH_TTL_HOURS` **or** missing → run `refreshAll()`. Otherwise render from cache.
- **Manual button** (keep the existing refresh icon) → POST `/api/finance/refresh` → `refreshAll(force=true)`.
- `refreshAll()`:
  1. Read both Sheets tabs; recompute constants/`weekly_profit`.
  2. Finnhub `quote` for the 14 non-XRP symbols (batch sequentially; 60/min is ample).
  3. Candles for **top-3** (7/30/60d daily) + **all** holdings (≤7d sparklines) — with fallback (§9).
  4. `profile2` for equities (market cap + industry) — cache long (24h fine).
  5. `company-news` (last 7d) for top-3 only.
  6. Gemini outlook for top-3 (if key present) → `fin_outlook_cache`.
  7. Upsert `fin_market_cache`; insert one `fin_networth_snapshots` row.
- ~30–50 calls per refresh at a 12h cadence — trivially inside free tiers.

---

## 9. External API details

### Finnhub (primary)
Base `https://finnhub.io/api/v1`, auth `&token=${FINNHUB_API_KEY}`.
- **Quote:** `/quote?symbol={T}` → `c` current, `pc` prev close, `d`,`dp` day change.
- **Candles:** `/stock/candle?symbol={T}&resolution=D&from={unix}&to={unix}` → `{ s:'ok', c:[], t:[] }`. **If `s!=='ok'` or HTTP 403 / "access" → FALLBACK.**
- **Company news:** `/company-news?symbol={T}&from={YYYY-MM-DD}&to={YYYY-MM-DD}`.
- **Profile (cap + sector):** `/stock/profile2?symbol={T}` → `marketCapitalization` (millions), `finnhubIndustry`, `name`, `logo`.
- **For ETF/crypto top-3 cards** (GLTR, XRP) company-news is sparse — use `/news?category=general` for GLTR and `/news?category=crypto` for XRP, or render "limited coverage".

### Candle fallback (only if Finnhub candles fail)
- **Twelve Data:** `https://api.twelvedata.com/time_series?symbol={T}&interval=1day&outputsize={N}&apikey=${TWELVEDATA_API_KEY}` (free 800/day, 8/min).
- **Stooq (no key):** `https://stooq.com/q/d/l/?s={t}.us&i=d` → CSV daily OHLC. Last resort.
- Normalize all three to `{ t:[unix...], c:[close...] }` behind one `getCandles(symbol, days)` function.

### Gemini 2.5 Pro (AI outlook)
- `POST https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${GEMINI_API_KEY}` (verify exact model string in AI Studio).
- Input: `{ ticker, name, headlines:[{headline, datetime, source, url}] }`.
- Prompt (low temperature): summarize past week using ONLY the headlines: (1) 2–3 sentence factual summary; (2) brief balanced outlook with one bullish + one bearish consideration; no invented facts; end with exactly `Not financial advice.`
- Render the `Not financial advice` line as a small muted tag.
- **Key not provisioned yet:** if `GEMINI_API_KEY` missing/empty, skip the call and render a placeholder ("AI outlook — add Gemini key in env to enable"). The rest of the page must work without it.

### Env vars
```
FINNHUB_API_KEY      = (TO CREATE — not currently in .env.local)
TWELVEDATA_API_KEY   = (optional fallback; Stooq needs none)
GEMINI_API_KEY       = (TO CREATE — see §12)
# existing, already configured:
NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
GOOGLE_SHEETS_FINANCE_ID / GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_SERVICE_ACCOUNT_KEY
```

---

## 10. Styling (preserve the existing MILES OS look)

NYSE / ThinkOrSwim feel using the **current dashboard palette**.

- **Colors:** reuse the app's existing oklch tokens — near-black surfaces, the established **green** accent (`oklch(0.72 0.18 145)`), monospace data. Red for losses already exists (`--color-danger: oklch(0.65 0.22 25)`). Do **not** invent a new green.
- **Gain/loss:** green when ≥ 0, red when < 0 — applied to P/L figures, the 7d total, and line-chart strokes.
- **Type:** keep the existing mono + uppercase micro-labels (`TOTAL HOLDINGS`, etc.).
- **Surfaces:** sharp/low-radius `card` class, thin hairline borders, generous spacing, institutional-dark.
- **Charts:** clean line charts (line, not candle/area), minimal gridlines, last-price tag at right edge. Sparklines 1-color (green/red by 7d sign), no axes.
- **Pies:** donuts with hover-to-show-% (categorical palette; gain/loss coloring does **not** apply to pies).
- **Motion:** subtle staggered fade/slide-in on load; keep it fast.

---

## 11. Edge cases, fallbacks & assumptions

- **GOOGL** has avg cost 400.60 → cost-basis side renders.
- **XRP** pinned; flat 7d; cost-basis still shown; `// TODO` seam for CoinGecko.
- **GLTR** ETF: no equity sector/cap → Precious Metals (sector) / Commodity (cap); news via general feed.
- **Finnhub candle 403** → Twelve Data → Stooq, transparently.
- **Gemini key missing** → outlook placeholder; page still fully functional.
- **Fractional shares:** many < 0.25 share; format small values cleanly (`$24.93`), never round shares.
- **Market closed / weekend:** `quote.c` may equal `pc`; fine. Cache valid 12h.
- **Robinhood total** (2487.99) informational; if `positions_value + BUYING_POWER` drifts far, surface a small reconciliation note (optional).
- **WEEK_ANCHOR knob:** Sunday 2026-05-31 so pay accrual + food reset share one Sunday boundary. To start pay-weeks Monday June 1, change to `2026-06-01` (food reset stays Sunday).
- **Top-3 ranking knob:** "by position value" → GLTR / XRP / AMD. Expose `TOP3_MODE` for other rankings/pins.
- **Cap thresholds** standard — adjust in `fin_config`.
- **P/L row color** defaults to coloring figures only; full-row tint via knob.

---

## 12. Setup checklist (owner action items)

1. **Create a Gemini API key** at Google AI Studio (`aistudio.google.com` → "Get API key"), add as `GEMINI_API_KEY` in Vercel env + `.env.local`. Until then AI outlook shows a placeholder.
2. **Create a Finnhub API key** (`finnhub.io` → free account → dashboard), add as `FINNHUB_API_KEY`. (Optional: add `TWELVEDATA_API_KEY` for the chart fallback; Stooq works keyless.)
3. Run the §7 SQL in the Supabase editor as migration `0003_finance_rebuild.sql`. Seed `fin_config` (1 row) and `fin_food_weeks` for the current Sunday.
4. Verify the Google Sheets integration reads both `Investments` and `Assets and Liabilities` tabs. **NOTE: confirm an `Investments` tab actually exists in the sheet** — the current integration only reads `Assets and Liabilities`.
5. Deploy; load `/finance`; hit manual refresh once to populate caches and write the first snapshot.

---

## 13. Acceptance checklist

- [ ] Net Worth = investments_side + bank_balance; dropdown reveals the split.
- [ ] Weekly profit displays ≈ $221.98 and bank auto-grows by completed week (0 before June 1).
- [ ] Food budget: $150 Sun–Sat, decrements on logged spend, can go negative, variance rolls into bank on Sunday, no double-count with the liability.
- [ ] Total holdings includes the $345.54 cash; 7d total %/$ correct.
- [ ] Each holding shows BOTH 7d price-move and cost-basis P/L, green/red.
- [ ] Top-3 by value (GLTR/XRP/AMD today) with line charts + 7/30/60 toggle + news + Gemini outlook (or placeholder) + "Not financial advice" tag.
- [ ] All other holdings as single rows with 7d sparkline, sorted by value desc.
- [ ] Sector donut + Cap donut (with Crypto + Commodity slices); cash excluded.
- [ ] Existing palette preserved; line charts; Snapshot History removed.
- [ ] 12h rolling refresh + working manual button; everything cached in Supabase; no crash if Gemini key absent or Finnhub candles gated.

---

## Implementation notes (added during codebase review, 2026-05-29)

- **Google Sheets reality:** the existing `/api/finance/snapshot` route authenticates via a service-account JWT, exports the sheet as XLSX through the Drive API, loads it with `exceljs`, then dumps text to Claude for extraction. The rebuild will **reuse the auth + Drive-export + exceljs plumbing** but parse the `Investments` / `Assets and Liabilities` tabs **deterministically by column/label** (not via Claude) — required for exact per-ticker shares + avg cost.
- **Cron:** `vercel.json` runs `/api/finance/snapshot` daily at 05:00 UTC. The rebuild must keep a working snapshot path (repoint cron to the new refresh endpoint or keep the route calling `refreshAll`).
- **Env gap (RESOLVED 2026-05-29):** `FINNHUB_API_KEY`, `GEMINI_API_KEY`, `TWELVEDATA_API_KEY` are now all set in `.env.local`. Still need to be added to Vercel env for production.

## Verified sheet structure (confirmed against live sheet, 2026-05-29)

The spec's column contracts were checked against the actual Google Sheet. Corrections the parser MUST honor:

- **Tab names (exact):** `Investments` and `Assets & Liabilities` (ampersand — NOT "Assets and Liabilities"). Match tab by name containing "investment" / "asset" to be safe.
- **`Investments` tab layout:** row 1 = title cell "Investments"; row 2 = headers `Ticker | Date Recorded | Shares | Avg Cost` (A–D); rows 3–17 = the 15 holdings; row 18 = `Buying power` with the cash amount **345.54 in column D (Avg Cost), column C (Shares) blank**. Read data from row 3 until a blank Ticker; treat the `Buying power` row as `BUYING_POWER` (value from whichever of C/D is populated — here D).
- **GOOGL Avg Cost is BLANK** in the sheet (spec assumed 400.60). Parser must treat missing avg cost as "no cost basis" → render price-move P/L only, hide cost-basis P/L, exclude from cost-basis math. (Owner can add 400.60 to the sheet to enable it.)
- **Ticker casing:** `Meta` appears lowercase → uppercase all tickers before hitting Finnhub (`META`). `RR` = Richtech Robotics (correct as-is).
- **`Assets & Liabilities` tab layout:** two side-by-side blocks. Assets in cols A–C (`Type | Date Recorded | Current Value`), Liabilities in cols D–F (`Type | Date Recorded | Current Value`). Row 1 = section banners, row 2 = sub-headers, data from row 3.
- **Label matching is fuzzy:** real labels carry suffixes — `Hertz Car Rental (11 Weeks)`, `Total Rent (11 Weeks)`, `Grocery Budget/ Week (11 Weeks)`, `Federal Tax Recovery (Refund)`, `State Tax Recovery (Refund)`. Match by case-insensitive substring on a stable keyword (e.g. "hertz", "rent", "grocery", "federal tax", "state tax", "ev charging", "4th of july", "bank account", "take home", "robinhood").
- **Grocery nuance:** labeled "Grocery Budget/ Week (11 Weeks)" = **$150 per week** (the (11 Weeks) refers to the internship span, not a total). EV Charging ($220) and 4th of July Reserve ($300) are treated as 11-week lump reserves per spec.
- **Rent label trap (fixed):** matching the keyword `rent` also matches "Hertz Car **Rent**al", double-counting Hertz and dropping the real rent — broke weekly profit. Match `total rent` instead.

## Candle-source reality (verified live 2026-05-29 — supersedes spec §9 fallback chain)

The spec's chain (Finnhub → Twelve Data → Stooq) does not hold up on free tiers:
- **Finnhub `/stock/candle`** → 403 "You don't have access to this resource" (gated on free).
- **Twelve Data** works but free tier is **8 API credits/minute**, and a multi-symbol batch costs 1 credit *per symbol* — so 14 holdings can't be fetched in one burst.
- **Stooq** is no longer keyless — it now requires a captcha-gated apikey. **Dropped.**
- **NEW primary: Yahoo Finance chart endpoint** `query1.finance.yahoo.com/v8/finance/chart/{SYM}?range=1mo&interval=1d` — keyless and bulk-friendly, but **requires a `User-Agent` header** (429s without one). Returns daily closes used for sparklines, 7d-ago price, and the 7/30/60 charts (one fetch per symbol, sliced).
- Final chain in code: **Yahoo → Twelve Data** (Twelve Data only catches the rare Yahoo miss). One 60d fetch per top-3 ticker is sliced into 7/30/60 to avoid extra calls.

## Live verification (2026-05-29)
Backend (Phases 1–2) confirmed against the real sheet + APIs: net worth **$2,591.63**, weekly profit **$221.98**, 7d total **+$119.21 (+5.85%)**, all 15 holdings priced, XRP pinned, GOOGL renders without cost-basis. Cache + snapshot rows written.

## Charts (Phase 3 enhancement)
Top-3 cards use **hourly** candles (Yahoo `range=3mo&interval=1h`, sliced into 7/30/60 → ~29/148/295 points) for detail, with an interactive crosshair (hover → date/time + price). Rows use daily sparklines. `lib/finance/finnhub.ts` → `getHourlySeries()`.

## Gemini reality (supersedes spec §9 model choice)
- **`gemini-2.5-pro` is NOT on the Gemini free tier** (`limit: 0`). Use a **Flash** model. Code defaults to `gemini-2.5-flash`, overridable via `GEMINI_MODEL` env.
- The key was created in the **`personal-os`** Google Cloud project, which is **linked to billing** (it runs the Sheets service account). That disqualifies it from the Gemini free tier *and* it has no prepay credits → all models return 429. The integration fails soft (cards show news headlines + a placeholder; page fully works).
- **Fix for free outlooks:** create a NEW Gemini key in a fresh AI-Studio project that is *not* billing-linked (the free tier then applies to Flash), and replace `GEMINI_API_KEY`. Alternatively enable billing on `personal-os` (paid, pennies). Integration code (`lib/finance/gemini.ts`) needs no change either way.
