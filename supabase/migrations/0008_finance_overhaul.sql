-- Finance Overhaul v2 — additive only. See docs/vault/specs/finance-overhaul-v2.md.
-- New: live holdings + trade ledger, AI market brief, portfolio scoring, recurring/bills,
-- credit accounts + FICO history, free spend log (SimpleFIN/Telegram/statement), dream-car target.
-- Single-tenant posture: every table gets RLS enable + deny-all (service-role client bypasses).

-- ─────────────────────────────────────────────────────────────────────────────
-- §5.1  Holdings → Supabase (replaces the read-only Google Sheet "Investments" tab)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists fin_holdings (
  id            uuid primary key default gen_random_uuid(),
  ticker        text not null,                  -- uppercased symbol (Finnhub)
  raw_ticker    text,                           -- as the user typed it
  company_name  text,
  shares        numeric not null default 0,
  avg_cost      numeric,                        -- null = no cost basis
  instrument    text not null default 'equity', -- equity | etf | crypto
  sector        text,                           -- broad bucket; fallback via TICKER_META
  pinned        boolean not null default false, -- e.g. XRP price pinned
  pinned_price  numeric,
  opened_at     date,
  closed_at     date,                           -- non-null once fully sold (kept for history)
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
  side        text not null,                    -- buy | sell
  shares      numeric not null,
  price       numeric not null,                 -- execution price / share
  traded_at   timestamptz not null default now(),
  note        text,
  created_at  timestamptz not null default now()
);
alter table fin_trades enable row level security;
create policy "deny all fin_trades" on fin_trades for all using (false);

-- ─────────────────────────────────────────────────────────────────────────────
-- §6.1  Daily/weekly AI market brief + per-day headlines with sentiment
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists fin_market_brief (
  id           uuid primary key default gen_random_uuid(),
  kind         text not null,                   -- 'daily' | 'weekly'
  brief_date   date not null,
  headline     text,                            -- one-line TL;DR
  body         text,                            -- AI narrative (markdown)
  bullets      jsonb,                           -- [{title, detail, sentiment}]
  movers       jsonb,                           -- top gainers/losers snapshot
  macro        jsonb,                           -- {treasury10y, cpi, fedFunds, ...}
  generated_at timestamptz not null default now(),
  unique (kind, brief_date)
);
alter table fin_market_brief enable row level security;
create policy "deny all fin_market_brief" on fin_market_brief for all using (false);

-- ─────────────────────────────────────────────────────────────────────────────
-- §8.1  Portfolio scoring (market-cap sentiment + diversification/risk)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists fin_portfolio_score (
  id                    uuid primary key default gen_random_uuid(),
  scored_date           date not null unique,
  sentiment_score       int,                    -- 0..100 (market-cap-weighted sentiment)
  sentiment_label       text,                   -- 'Bullish' | 'Neutral' | 'Bearish'
  diversification_score int,                    -- 0..100
  diversification_label text,                   -- 'Concentrated' .. 'Well-diversified'
  risk_score            int,                    -- 0..100 (higher = more risk)
  risk_factors          jsonb,                  -- ["68% in semis", "no defensive sleeve", ...]
  upside                text,                   -- upside narrative (AI)
  generated_at          timestamptz not null default now()
);
alter table fin_portfolio_score enable row level security;
create policy "deny all fin_portfolio_score" on fin_portfolio_score for all using (false);

-- ─────────────────────────────────────────────────────────────────────────────
-- §9.1  Recurring charges (subscriptions, trials, fixed-term, one-off future bills)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists fin_recurring (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null,
  merchant           text,
  category           text not null,             -- streaming | software | insurance | rent | utility | gym | phone | other
  type               text not null,             -- subscription | trial | fixed_term | one_off
  amount             numeric not null,
  cadence            text not null,             -- monthly | yearly | weekly | quarterly | one_time
  next_due           date,                      -- next charge/renewal date
  start_date         date,
  expiration_date    date,                      -- trial end / fixed-term end (null = ongoing)
  status             text not null default 'active', -- active | canceled | expired | paused
  auto_renews        boolean not null default true,
  notify_days_before int not null default 3,
  last_notified_at   timestamptz,
  note               text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists fin_recurring_active_idx on fin_recurring(status, next_due);
alter table fin_recurring enable row level security;
create policy "deny all fin_recurring" on fin_recurring for all using (false);

-- ─────────────────────────────────────────────────────────────────────────────
-- §10.1  Credit card (Discover, manual) + FICO history + free spend log
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists fin_credit_accounts (
  id                 uuid primary key default gen_random_uuid(),
  issuer             text not null default 'Discover',
  nickname           text,
  last4              text,
  credit_limit       numeric,
  current_balance    numeric not null default 0,
  statement_balance  numeric,
  min_payment        numeric,
  due_date           date,
  apr                numeric,
  autopay            boolean default false,
  notify_days_before int not null default 5,
  last_notified_at   timestamptz,
  updated_at         timestamptz not null default now()
);
alter table fin_credit_accounts enable row level security;
create policy "deny all fin_credit_accounts" on fin_credit_accounts for all using (false);

-- FICO history (Discover shows FICO Score 8, refreshed ~every 30 days).
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

-- Free spend log (manual/Telegram/merchant-email/SimpleFIN). Not a bank feed by itself.
create table if not exists fin_spend (
  id           uuid primary key default gen_random_uuid(),
  amount       numeric not null,
  merchant     text,
  category     text,                            -- coffee | food | transport | shopping | ...
  source       text default 'manual',           -- manual | telegram | email_receipt | statement_import | simplefin
  spent_at     timestamptz not null default now(),
  raw          text,
  ext_id       text,                            -- SimpleFIN transaction id (dedupe key)
  account_name text,                            -- SimpleFIN account name
  created_at   timestamptz not null default now()
);
create index if not exists fin_spend_time_idx on fin_spend(spent_at);
create unique index if not exists fin_spend_extid_idx on fin_spend(ext_id) where ext_id is not null;
alter table fin_spend enable row level security;
create policy "deny all fin_spend" on fin_spend for all using (false);

-- ─────────────────────────────────────────────────────────────────────────────
-- §11.1  Dream-car target (stored on the existing fin_config singleton)
-- ─────────────────────────────────────────────────────────────────────────────
alter table fin_config add column if not exists dream_target numeric not null default 88750;
alter table fin_config add column if not exists dream_label  text not null default '2022 Porsche 718 Cayman GTS 4.0';
