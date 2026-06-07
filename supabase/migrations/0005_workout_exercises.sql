-- Per-exercise workout detail (additive). Pairs with the existing `workouts` table
-- (one summary row per day, where `workout_type` holds the day's title).
-- Rep notation in the source screenshots is inconsistent, so `raw` keeps the verbatim
-- set/rep string; `sets`/`reps` are best-effort and may be null. See
-- docs/vault/specs/telegram-agent-v1.md "Workout screenshot format".

create table if not exists workout_exercises (
  id          uuid primary key default gen_random_uuid(),
  user_id     text not null,
  date        date not null,
  position    int  not null default 0,   -- display order within the day
  section     text,                       -- sub-group, e.g. 'Physical therapy' (null = main)
  name        text not null,              -- 'Incline DB bench'
  raw         text,                        -- verbatim token: '3x12', '2x failure', '30x3 (descend 5/set)'
  sets        int,                         -- best-effort, nullable
  reps        text,                        -- best-effort: '12', '6-8', 'failure', '30s' (text, nullable)
  note        text,                        -- modifiers: 'drop 10', '25 lbs', 'each leg', 'HARD'
  done        boolean not null default true, -- false if struck through (planned, skipped)
  created_at  timestamptz default now()
);

create index if not exists workout_exercises_user_date_idx on workout_exercises(user_id, date);

-- RLS deny-all (service role bypasses) — parity with the rest of the schema.
alter table workout_exercises enable row level security;
create policy "deny all workout_exercises" on workout_exercises for all using (false);
