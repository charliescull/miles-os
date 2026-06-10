-- ════════════════════════════════════════════════════════════════════════
-- Arbitrage Engine — migration 0002: self-learning feedback loop
-- Run in the Supabase SQL Editor AFTER schema.sql. Idempotent.
--
-- Adds the ground-truth capture (human decision + realized sale outcome) and a
-- per-opportunity model score, plus a table to persist the trained model.
-- ════════════════════════════════════════════════════════════════════════

-- ── Outcome capture + model score on each opportunity ────────────────────
alter table public.opportunities
  add column if not exists decision text not null default 'undecided',  -- undecided | bought | passed
  add column if not exists decided_at timestamptz,
  add column if not exists realized_sale_price numeric(12,2),
  add column if not exists realized_days_to_sell integer,
  add column if not exists realized_net_profit numeric(12,2),
  add column if not exists sold_at timestamptz,
  add column if not exists features jsonb,                 -- feature snapshot at prediction time
  add column if not exists model_score numeric(12,2),      -- predicted realized net profit ($)
  add column if not exists model_confidence numeric(5,4);  -- 0..1

-- ── Persisted model (one active row; pure-python ridge params live in jsonb) ──
create table if not exists public.ml_model (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  kind          text not null default 'ridge_profit',
  feature_names text[] not null,
  params        jsonb not null,        -- { weights[], intercept, mu[], sigma[], lambda }
  metrics       jsonb not null default '{}'::jsonb,  -- { r2, mae, cv_r2, baseline_mae }
  n_samples     integer not null default 0,
  is_active     boolean not null default false
);
create index if not exists ml_model_active_idx on public.ml_model (is_active, created_at desc);

-- Only the scraper (service role) reads/writes ml_model; no anon policy = locked.
alter table public.ml_model enable row level security;

-- Let the dashboard read the model score fields it already reads on opportunities
-- (covered by the existing "anon read opportunities" policy — no change needed).
