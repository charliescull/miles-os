-- Additive retry protection for mobile/action-button captures.
create table if not exists capture_requests (
  idempotency_key text not null,
  user_id text not null,
  source text not null,
  status text not null default 'processing',
  completed_at timestamptz,
  last_error text,
  updated_at timestamptz not null default now(),
  request_hash text,
  processing_token text,
  created_at timestamptz default now(),
  primary key (user_id, source, idempotency_key)
);
alter table capture_requests enable row level security;
alter table capture_requests add column if not exists status text not null default 'processing';
alter table capture_requests add column if not exists completed_at timestamptz;
alter table capture_requests add column if not exists last_error text;
alter table capture_requests add column if not exists updated_at timestamptz not null default now();
alter table capture_requests add column if not exists request_hash text;
alter table capture_requests add column if not exists processing_token text;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = current_schema() and tablename = 'capture_requests' and policyname = 'deny all capture requests') then
    create policy "deny all capture requests" on capture_requests for all using (false);
  end if;
end $$;

alter table raw_captures add column if not exists idempotency_key text;
create unique index if not exists raw_captures_user_source_idempotency_idx
  on raw_captures(user_id, source, idempotency_key)
  where idempotency_key is not null;

-- Domain writes use the same key as the request ledger. These are additive so
-- retries after a worker crash cannot append a second row after reclaiming the
-- lease. Existing rows remain valid and continue to accept non-mobile writes.
alter table notes add column if not exists idempotency_key text;
create unique index if not exists notes_user_idempotency_idx
  on notes(user_id, idempotency_key);

alter table tasks add column if not exists idempotency_key text;
create unique index if not exists tasks_user_idempotency_idx
  on tasks(user_id, idempotency_key);

alter table appointments add column if not exists idempotency_key text;
create unique index if not exists appointments_user_idempotency_idx
  on appointments(user_id, idempotency_key);

-- Recipes may be provisioned separately from the core migration chain. Keep
-- this migration additive in environments where that optional table is absent.
do $$
begin
  if to_regclass('public.recipes') is not null then
    execute 'alter table public.recipes add column if not exists idempotency_key text';
    execute 'create unique index if not exists recipes_user_idempotency_idx
      on public.recipes(user_id, idempotency_key)';
  end if;
end $$;

-- Claim creation and lease reclamation must happen in one database transaction.
-- The caller must only execute side effects when claimed=true. The row lock makes
-- concurrent retries observe one winner, even when a previous lease is stale.
create or replace function claim_capture_request(
  p_user_id text,
  p_source text,
  p_idempotency_key text,
  p_request_hash text,
  p_processing_token text,
  p_lease_seconds integer default 900
)
returns table (claimed boolean, status text, processing_token text, request_hash text)
language plpgsql
security definer
set search_path = public
as $$
declare
  existing capture_requests%rowtype;
  inserted boolean := false;
begin
  insert into capture_requests (user_id, source, idempotency_key, request_hash, processing_token, status)
  values (p_user_id, p_source, p_idempotency_key, p_request_hash, p_processing_token, 'processing')
  on conflict (user_id, source, idempotency_key) do nothing
  returning true into inserted;

  select * into existing
    from capture_requests
   where user_id = p_user_id
     and source = p_source
     and idempotency_key = p_idempotency_key
   for update;

  if p_request_hash is not null
     and existing.request_hash is not null
     and existing.request_hash <> p_request_hash then
    raise exception 'Idempotency key was reused for different content';
  end if;

  if inserted
     or existing.status = 'failed'
     or (existing.status = 'processing'
         and existing.updated_at < now() - make_interval(secs => p_lease_seconds)) then
    update capture_requests
       set status = 'processing',
           last_error = null,
           updated_at = now(),
           processing_token = p_processing_token,
           request_hash = coalesce(p_request_hash, existing.request_hash)
     where user_id = p_user_id
       and source = p_source
       and idempotency_key = p_idempotency_key;
    return query select true, 'processing'::text, p_processing_token,
                        coalesce(p_request_hash, existing.request_hash);
  else
    return query select false, existing.status, existing.processing_token, existing.request_hash;
  end if;
end;
$$;

revoke all on function claim_capture_request(text, text, text, text, text, integer) from public;
grant execute on function claim_capture_request(text, text, text, text, text, integer) to service_role;
