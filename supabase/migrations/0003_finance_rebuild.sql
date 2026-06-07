-- Finance tab rebuild (v1) — additive only.
-- New positions terminal: live holdings, food budget, net-worth snapshots, market/AI caches.
-- All tables are single-tenant (single-user system); RLS deny-all matches the existing
-- security posture (the service-role client bypasses RLS).

-- fin_config: tunable knobs. Single row (id = 1). weekly_profit recomputed from Sheets each refresh.
create table if not exists fin_config (
  id                int primary key default 1,
  internship_anchor date        not null default '2026-05-31', -- Sunday of the June-1 start week
  total_weeks       int         not null default 11,
  bank_seed         numeric     not null default 89.93,
  buying_power      numeric     not null default 345.54,
  xrp_pinned        numeric     not null default 1.29,
  grocery_weekly    numeric     not null default 150.00,
  weekly_profit     numeric,
  updated_at        timestamptz not null default now()
);

-- fin_market_cache: 12h rolling cache for Finnhub quotes/candles/news/profile.
create table if not exists fin_market_cache (
  cache_key   text primary key,         -- 'quotes' | 'candle:AMD:D' | 'news:AMD' | 'profile:AMD'
  payload     jsonb       not null,
  fetched_at  timestamptz not null default now()
);

-- fin_food_weeks: one row per Sunday-anchored week. variance set when closed.
create table if not exists fin_food_weeks (
  week_start  date primary key,         -- the Sunday
  budget      numeric not null default 150.00,
  spent       numeric not null default 0,
  variance    numeric,
  closed      boolean not null default false
);

-- fin_food_log: individual spend entries within a week.
create table if not exists fin_food_log (
  id          bigserial primary key,
  week_start  date not null references fin_food_weeks(week_start),
  amount      numeric not null,
  note        text,
  created_at  timestamptz not null default now()
);

-- fin_networth_snapshots: silent history (written each refresh; no UI table).
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

-- fin_outlook_cache: Gemini per-ticker summary/outlook for the top-3 cards.
create table if not exists fin_outlook_cache (
  ticker       text primary key,
  summary      text,
  outlook      text,
  headlines    jsonb,
  generated_at timestamptz not null default now()
);

-- Index for snapshot history queries (newest first).
create index if not exists fin_networth_snapshots_taken_idx
  on fin_networth_snapshots(taken_at desc);

-- Enable RLS (service role bypasses) — parity with existing tables.
alter table fin_config enable row level security;
alter table fin_market_cache enable row level security;
alter table fin_food_weeks enable row level security;
alter table fin_food_log enable row level security;
alter table fin_networth_snapshots enable row level security;
alter table fin_outlook_cache enable row level security;

-- Deny-all policies.
create policy "deny all fin_config" on fin_config for all using (false);
create policy "deny all fin_market_cache" on fin_market_cache for all using (false);
create policy "deny all fin_food_weeks" on fin_food_weeks for all using (false);
create policy "deny all fin_food_log" on fin_food_log for all using (false);
create policy "deny all fin_networth_snapshots" on fin_networth_snapshots for all using (false);
create policy "deny all fin_outlook_cache" on fin_outlook_cache for all using (false);

-- Seed the single config row.
insert into fin_config (id) values (1) on conflict (id) do nothing;
