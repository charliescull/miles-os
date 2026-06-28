-- WHOOP OAuth token store (single-user). One row per user_id holding the live
-- access/refresh tokens so the server can proxy WHOOP API calls and silently
-- refresh. Secrets never reach the browser — the WHOOP card only ever talks to
-- our own auth-gated /api/whoop/* routes.

create table if not exists whoop_tokens (
  user_id       text primary key,
  access_token  text not null,
  refresh_token text,
  expires_at    timestamptz not null,   -- when access_token expires
  updated_at    timestamptz default now()
);

-- RLS deny-all (service role bypasses) — parity with the rest of the schema.
alter table whoop_tokens enable row level security;
create policy "deny all whoop_tokens" on whoop_tokens for all using (false);
