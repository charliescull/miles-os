-- Enable pgvector extension
create extension if not exists vector;

-- entities: people, orgs, projects referenced in tasks/captures
create table if not exists entities (
  id          uuid primary key default gen_random_uuid(),
  user_id     text not null,
  name        text not null,
  kind        text not null, -- person | org | project | other
  metadata    jsonb default '{}',
  created_at  timestamptz default now()
);

-- raw_captures: everything that comes in via Telegram or web form
create table if not exists raw_captures (
  id             uuid primary key default gen_random_uuid(),
  user_id        text not null,
  source         text not null, -- telegram | web
  raw_text       text not null,
  audio_url      text,
  classification jsonb default '{}',
  llm_source     text,
  routed_to      text, -- tasks | daily_logs | decisions | notes
  routed_id      uuid,
  created_at     timestamptz default now()
);

-- tasks: the CRM / task manager
create table if not exists tasks (
  id                uuid primary key default gen_random_uuid(),
  user_id           text not null,
  title             text not null,
  description       text,
  urgency           text not null default 'someday', -- today | this_week | this_month | someday
  is_key            boolean default false,
  priority_score    float default 0,
  time_estimate_min int,
  tags              text[] default '{}',
  due_date          date,
  owner             text,
  entity_id         uuid references entities(id) on delete set null,
  status            text not null default 'open', -- open | done | blocked
  kind              text not null default 'task', -- task | blocker | decision | content
  completed_at      timestamptz,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);

-- daily_logs: habits, nutrition, finance snapshots, goals — stored as JSON in notes
create table if not exists daily_logs (
  id         uuid primary key default gen_random_uuid(),
  user_id    text not null,
  log_date   date not null,
  notes      text default '{}', -- JSON blob
  mood       int,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id, log_date)
);

-- memory_chunks: vector embeddings of all content
create table if not exists memory_chunks (
  id          uuid primary key default gen_random_uuid(),
  user_id     text not null,
  source_type text not null, -- capture | task | journal | habit | meal | finance | review
  source_id   uuid,
  text        text not null,
  embedding   vector(1536),
  created_at  timestamptz default now()
);

-- audit_log: all write operations
create table if not exists audit_log (
  id            uuid primary key default gen_random_uuid(),
  user_id       text not null,
  action        text not null,
  resource_type text,
  resource_id   uuid,
  metadata      jsonb default '{}',
  created_at    timestamptz default now()
);

-- Vector index for cosine similarity search
create index if not exists memory_chunks_embedding_idx
  on memory_chunks
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

-- Indexes for common queries
create index if not exists tasks_user_urgency_idx on tasks(user_id, urgency, status);
create index if not exists tasks_user_status_idx on tasks(user_id, status);
create index if not exists daily_logs_user_date_idx on daily_logs(user_id, log_date);
create index if not exists raw_captures_user_created_idx on raw_captures(user_id, created_at desc);

-- Enable RLS on all tables
alter table entities enable row level security;
alter table raw_captures enable row level security;
alter table tasks enable row level security;
alter table daily_logs enable row level security;
alter table memory_chunks enable row level security;
alter table audit_log enable row level security;

-- Deny-all RLS policies (service role bypasses RLS)
create policy "deny all entities" on entities for all using (false);
create policy "deny all raw_captures" on raw_captures for all using (false);
create policy "deny all tasks" on tasks for all using (false);
create policy "deny all daily_logs" on daily_logs for all using (false);
create policy "deny all memory_chunks" on memory_chunks for all using (false);
create policy "deny all audit_log" on audit_log for all using (false);
