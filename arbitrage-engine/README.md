# Arbitrage Engine — Strategy B (Business & Industrial)

> **Isolated sub-project of MILES OS.** Self-contained. Nothing here imports from or
> writes to the MILES OS app, DB tables, or design system. It can be deleted wholesale
> without affecting the dashboard. Frontend is built to be *portable* so it can later be
> lifted into MILES OS as a route — but until then it runs standalone.

An autonomous **arbitrage alert** system (Human-in-the-Loop). It does **not** buy anything.
It scrapes industrial-equipment listings, validates them against eBay sold comps, runs the
landed-cost math, and pushes qualifying deals to a Supabase `opportunities` table that a
realtime Next.js dashboard renders as a feed.

## Why "Business & Industrial"
eBay's final-value fee for *Select Business & Industrial Equipment* is an anomaly:
**3% up to $15,000, then 0.5% above $15,000** — versus ~15% standard retail. That fee
retention is the entire edge.

---

## Architecture

```
                   ┌─────────────────────────────────────────────┐
 Sources           │  scraper/  (Python 3.11+, Render worker)     │
 GovDeals,         │                                              │
 B2B liquidations, │  run.py ──> agent.py (browser-use + Claude)  │
 classifieds       │              │  Scrapfly residential proxy   │
                   │              ▼                                │
                   │  comps.py  ──> eBay sold/completed comps      │
                   │              ▼                                │
                   │  calc.py   ──> landed cost + ROI + liquidity  │
                   │              ▼                                │
                   │  supabase_client.py ──> insert opportunity    │
                   └──────────────────┬──────────────────────────┘
                                      ▼
                         Supabase (Postgres + pgvector)
                          scraped_items / market_comparables / opportunities
                                      ▼
                   ┌─────────────────────────────────────────────┐
                   │  dashboard/ (Next.js App Router, Vercel)     │
                   │  realtime subscription → opportunity cards   │
                   └─────────────────────────────────────────────┘
```

## The Math (in `scraper/src/calc.py`, fully unit-tested)

| Component | Rule |
|---|---|
| Target sell price | avg of last 3 eBay **sold** comps |
| Freight | flat $250 (or dynamic by weight if known) |
| State tax | $0 (Form ST-4 resale exemption) |
| Platform fee | 3% of sell price up to $15k **+** 0.5% of the portion above $15k |
| Payment processing | ~3% of sell price |
| Insurance | 0.6% of declared value (Secursus) |
| **Net profit** | `sell − (ask + freight + platform + processing + insurance)` |
| **Trigger** | `net_profit / ask > 0.25` **AND** liquidity OK |
| Liquidity | `ADV = sold_30d / 30`; `days_to_liquidate = 30 / sold_30d`; drop if `> 14` |

All thresholds are env-configurable (`config.py`).

---

## Quickstart

### 0. Prereqs
Accounts/keys: Anthropic, Supabase, Scrapfly, (optional) Render & Browser-Use Cloud.

### 1. Database
Open Supabase → SQL Editor → paste & run [`db/schema.sql`](db/schema.sql). It enables
`pgvector` and creates the three tables + the `match_equipment` semantic-search RPC.

### 2. Scraper
```bash
cd scraper
python -m venv .venv && .venv\Scripts\activate      # Windows
pip install -r requirements.txt
copy ..\.env.example .env                            # then fill in keys
python -m pytest                                     # verify the math
python run.py --once --source govdeals --query "commercial printer"   # single dry run
```

### 3. Dashboard
```bash
cd dashboard
npm install
copy .env.local.example .env.local                  # fill Supabase URL + anon key
npm run dev                                          # http://localhost:3000
```
`NEXT_PUBLIC_DEMO=1` in `.env.local` renders sample opportunities with **no DB needed**.

### 4. Deploy
- **Dashboard** → Vercel (import `arbitrage-engine/dashboard`, add env, deploy).
- **Scraper** → Render Background Worker (Dockerized via `scraper/Dockerfile`) on a cron
  (e.g. every 2h) or continuous loop.

---

## Safety / legal notes
- This is an **alerting** tool. A human verifies condition from photos, secures the resale
  exemption, and executes every transaction. No automated purchasing.
- Scraping marketplaces can violate ToS and trip anti-bot systems. Scrapfly residential
  proxies + Claude-driven `browser-use` reduce blocks but do not make scraping authorized.
  Respect each site's terms and rate limits. The comps layer is pluggable so the official
  **eBay Marketplace Insights API** can replace scraping if/when partner access is granted.

## Relationship to MILES OS
See [`docs/cross-reference.md`](docs/cross-reference.md). Short version: shares *patterns*
(Supabase service-role server-side writes, oklch-friendly dark UI) but **no shared tables,
env, or code paths**. Memory file: `arbitrage-engine` in the MILES OS memory index.
