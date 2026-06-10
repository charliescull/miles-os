-- ════════════════════════════════════════════════════════════════════════
-- Arbitrage Engine — Supabase schema  (Strategy B: Business & Industrial)
-- Run top-to-bottom in the Supabase SQL Editor. Idempotent where practical.
--
-- ISOLATION: all objects are prefixed/named so they cannot collide with the
-- MILES OS schema (tasks, daily_logs, memory_chunks, match_memory_chunks…).
-- ════════════════════════════════════════════════════════════════════════

-- ── Extensions ──────────────────────────────────────────────────────────
create extension if not exists vector;       -- pgvector: semantic model matching
create extension if not exists pgcrypto;     -- gen_random_uuid()

-- ── 1. scraped_items ────────────────────────────────────────────────────
-- Raw assets discovered on source sites BEFORE validation. One row per listing.
create table if not exists public.scraped_items (
  id                uuid primary key default gen_random_uuid(),
  created_at        timestamptz not null default now(),
  source            text not null,                 -- 'govdeals' | 'publicsurplus' | 'craigslist' | ...
  source_listing_id text,                          -- site's native listing id (for dedupe)
  url               text not null,
  title             text not null,
  model_number      text,                          -- best-effort extracted model/SKU
  brand             text,
  condition         text,                          -- free text as listed
  ask_price         numeric(12,2),                 -- current ask / current bid
  currency          text not null default 'USD',
  weight_lb         numeric(10,2),                 -- if known → enables dynamic freight
  location          text,
  category          text,
  ends_at           timestamptz,                   -- auction end, if applicable
  raw               jsonb not null default '{}'::jsonb,   -- full extracted blob
  embedding         vector(1536),                  -- OpenAI text-embedding-3-small of title+model
  status            text not null default 'new',   -- new | validated | rejected | opportunity
  reject_reason     text,
  unique (source, source_listing_id)
);
create index if not exists scraped_items_status_idx on public.scraped_items (status, created_at desc);
create index if not exists scraped_items_embedding_idx
  on public.scraped_items using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- ── 2. market_comparables ───────────────────────────────────────────────
-- eBay sold/completed comps gathered to validate a scraped_item.
create table if not exists public.market_comparables (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),
  scraped_item_id uuid not null references public.scraped_items(id) on delete cascade,
  ebay_item_id    text,
  title           text,
  sold_price      numeric(12,2) not null,
  shipping_price  numeric(12,2),
  sold_date       date,
  condition       text,
  url             text,
  similarity      numeric(5,4)                       -- cosine sim of comp vs scraped item (0..1)
);
create index if not exists market_comparables_item_idx
  on public.market_comparables (scraped_item_id, sold_date desc);

-- ── 3. opportunities ────────────────────────────────────────────────────
-- A scraped_item that PASSED the ROI + liquidity triggers. This is what the
-- dashboard subscribes to. One opportunity per scraped_item.
create table if not exists public.opportunities (
  id                   uuid primary key default gen_random_uuid(),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  scraped_item_id      uuid not null references public.scraped_items(id) on delete cascade,
  unique (scraped_item_id),

  -- denormalized snapshot (so the card renders from one row, no joins)
  title                text not null,
  source               text not null,
  source_url           text not null,
  model_number         text,
  brand                text,
  condition            text,
  image_url            text,

  -- money (all USD)
  ask_price            numeric(12,2) not null,
  target_sell_price    numeric(12,2) not null,
  freight_cost         numeric(12,2) not null,
  platform_fee         numeric(12,2) not null,
  processing_fee       numeric(12,2) not null,
  insurance_fee        numeric(12,2) not null,
  total_cost           numeric(12,2) not null,     -- ask + all costs
  net_profit           numeric(12,2) not null,
  roi                  numeric(8,4)  not null,     -- net_profit / ask

  -- liquidity
  sold_count_30d       integer,
  adv                  numeric(10,4),              -- avg daily volume (units/day)
  est_days_to_liquidate numeric(10,2),
  liquidity_ok         boolean not null default true,

  comps                jsonb not null default '[]'::jsonb,   -- the comps used for the price
  status               text not null default 'new'           -- new | reviewing | bought | passed | sold
);
create index if not exists opportunities_feed_idx on public.opportunities (status, roi desc, created_at desc);

-- keep updated_at fresh
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists opportunities_set_updated_at on public.opportunities;
create trigger opportunities_set_updated_at
  before update on public.opportunities
  for each row execute function public.set_updated_at();

-- ── 4. Semantic model matching RPC ──────────────────────────────────────
-- Find previously-scraped items similar to a query embedding (e.g. to detect
-- duplicates or cluster by equipment model). Mirrors MILES OS's match pattern
-- but is a DISTINCT function name to avoid any collision.
create or replace function public.match_equipment(
  query_embedding vector(1536),
  match_threshold float default 0.75,
  match_count     int   default 10
)
returns table (
  id uuid, title text, model_number text, ask_price numeric, url text, similarity float
)
language sql stable as $$
  select s.id, s.title, s.model_number, s.ask_price, s.url,
         1 - (s.embedding <=> query_embedding) as similarity
  from public.scraped_items s
  where s.embedding is not null
    and 1 - (s.embedding <=> query_embedding) > match_threshold
  order by s.embedding <=> query_embedding
  limit match_count;
$$;

-- ── 5. Row Level Security ───────────────────────────────────────────────
-- Service-role (scraper) bypasses RLS. The dashboard uses the ANON key and only
-- needs to READ opportunities, so expose read-only on that one table.
alter table public.opportunities    enable row level security;
alter table public.scraped_items    enable row level security;
alter table public.market_comparables enable row level security;

drop policy if exists "anon read opportunities" on public.opportunities;
create policy "anon read opportunities" on public.opportunities
  for select using (true);

-- (scraped_items + market_comparables stay locked: no anon policy = no anon access)

-- ── 6. Realtime ─────────────────────────────────────────────────────────
-- Add opportunities to the realtime publication so the dashboard gets live INSERTs.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'opportunities'
  ) then
    alter publication supabase_realtime add table public.opportunities;
  end if;
end $$;
