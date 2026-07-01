-- Income / paychecks (finance overhaul v2 follow-up). Real logged income raises cash → net worth,
-- alongside daily expenses (fin_spend) that lower it. Additive; RLS deny-all like the rest.

create table if not exists fin_income (
  id          uuid primary key default gen_random_uuid(),
  amount      numeric not null,
  source      text,                      -- 'paycheck' | 'refund' | 'other'
  note        text,
  received_at timestamptz not null default now(),
  created_at  timestamptz not null default now()
);
create index if not exists fin_income_time_idx on fin_income(received_at);
alter table fin_income enable row level security;
create policy "deny all fin_income" on fin_income for all using (false);

-- Optional: let the user set a real current-cash baseline instead of the sheet-derived seed.
alter table fin_config add column if not exists cash_seed numeric;
