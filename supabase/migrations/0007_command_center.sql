-- COMMAND CENTER (replaces CRM): appointments mirror + daily notepad.
-- Tasks reuse the existing `tasks` table (kind='task'); no change needed there.

-- appointments: Supabase mirror of Google Calendar events created via the bot.
-- start/end stored as LOCAL wall-clock strings ('YYYY-MM-DDTHH:mm:ss' or 'YYYY-MM-DD')
-- to match lib/calendar EventInput and avoid timezone math on read.
create table if not exists appointments (
  id              uuid primary key default gen_random_uuid(),
  user_id         text not null,
  google_event_id text,
  summary         text not null,
  start_local     text not null,
  end_local       text,
  all_day         boolean default false,
  recurrence      text,            -- RRULE string (e.g. 'FREQ=WEEKLY;BYDAY=MO') or null
  location        text,
  notified_at     timestamptz,     -- phase 2: 15-min alert dedupe
  canceled        boolean default false,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);
create index if not exists appointments_user_start_idx on appointments(user_id, start_local);
alter table appointments enable row level security;
create policy "deny all appointments" on appointments for all using (false);

-- notes: daily notepad entries ("X ..."). Reset visually each day (queried by date);
-- history retained so past days can be browsed.
create table if not exists notes (
  id         uuid primary key default gen_random_uuid(),
  user_id    text not null,
  note_date  date not null,
  text       text not null,
  created_at timestamptz default now()
);
create index if not exists notes_user_date_idx on notes(user_id, note_date desc, created_at);
alter table notes enable row level security;
create policy "deny all notes" on notes for all using (false);

-- alert_log: dedupe for the 15-min-before Telegram alerts (one row per fired event).
create table if not exists alert_log (
  id         uuid primary key default gen_random_uuid(),
  user_id    text not null,
  event_key  text not null,   -- '<YYYY-MM-DDTHH:mm>|<title>'
  created_at timestamptz default now()
);
create index if not exists alert_log_user_key_idx on alert_log(user_id, event_key);
alter table alert_log enable row level security;
create policy "deny all alert_log" on alert_log for all using (false);
