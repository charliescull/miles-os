---
title: Database Schema
tags: [architecture, database, supabase]
---

# Database Schema

All tables are in the `public` schema on Supabase (PostgreSQL). Every table is scoped by `user_id` (text). Primary keys are UUID with `gen_random_uuid()` default.

---

## audit_log
Immutable action trail. Written after every significant operation.

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| user_id | text | NO | — |
| action | text | NO | — |
| resource_type | text | YES | — |
| resource_id | uuid | YES | — |
| metadata | jsonb | YES | `{}` |
| created_at | timestamptz | YES | now() |

---

## daily_logs
One row per user per day. Stores habit completions and capture notes as JSON in `notes`.

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| user_id | text | NO | — |
| log_date | date | NO | — |
| notes | text | YES | `{}` |
| mood | integer | YES | — |
| created_at | timestamptz | YES | now() |
| updated_at | timestamptz | YES | now() |

**Note:** `notes` is stored as a JSON string (text, not jsonb). The capture pipeline parses it with `JSON.parse()` and re-serializes with `JSON.stringify()`. Shape: `{ captures: [{ id, text, ts }], ...habitKeys }`. Unique constraint on `(user_id, log_date)` — upserted with `onConflict: 'user_id,log_date'`.

---

## entities
CRM records — people, organisations, or projects.

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| user_id | text | NO | — |
| name | text | NO | — |
| kind | text | NO | — |
| metadata | jsonb | YES | `{}` |
| created_at | timestamptz | YES | now() |

**kind values:** `person`, `org`, `project`
**metadata shape:** `{ role?: string, ... }` — freeform

---

## memory_chunks
Vector embedding store for RAG. Populated by `embedAndStore()` in `lib/memory.ts`.

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| user_id | text | NO | — |
| source_type | text | NO | — |
| source_id | uuid | YES | — |
| text | text | NO | — |
| embedding | vector (USER-DEFINED) | YES | — |
| created_at | timestamptz | YES | now() |

**embedding:** pgvector type, 1536 dimensions (OpenAI text-embedding-3-small). Queried via `match_memory_chunks` RPC using cosine similarity.
**source_type values:** `capture` (others possible as system grows)
**text:** truncated to 2000 chars at insert; embedding input truncated to 8000 chars.

---

## RPC Functions

### match_memory_chunks

Cosine similarity search over `memory_chunks`. Used by `/api/ask` to find relevant context for RAG.

```sql
CREATE OR REPLACE FUNCTION public.match_memory_chunks(
  query_embedding vector,
  match_user_id text,
  match_count integer DEFAULT 20
)
RETURNS TABLE(
  id uuid,
  user_id text,
  source_type text,
  source_id uuid,
  text text,
  similarity double precision,
  created_at timestamptz
)
LANGUAGE plpgsql AS $$
begin
  return query
  select
    mc.id, mc.user_id, mc.source_type, mc.source_id, mc.text,
    1 - (mc.embedding <=> query_embedding) as similarity,
    mc.created_at
  from memory_chunks mc
  where mc.user_id = match_user_id
  order by mc.embedding <=> query_embedding
  limit match_count;
end;
$$;
```

**Notes:**
- Uses `<=>` operator (pgvector cosine distance). Similarity = `1 - distance`, so 1.0 = identical.
- No similarity threshold — returns top `match_count` regardless of score.
- Results ordered best-first by distance (not explicitly by similarity DESC, same effect).
- Called in `/api/ask/route.ts` as `db.rpc('match_memory_chunks', { query_embedding, match_user_id: USER_ID, match_count: 20 })`

---

## raw_captures
Every capture ever received, regardless of routing. Source of truth for the capture pipeline.

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| user_id | text | NO | — |
| source | text | NO | — |
| raw_text | text | NO | — |
| audio_url | text | YES | — |
| classification | jsonb | YES | `{}` |
| llm_source | text | YES | — |
| routed_to | text | YES | — |
| routed_id | uuid | YES | — |
| created_at | timestamptz | YES | now() |

**source values:** `web`, `telegram`
**classification shape:** `{ kind, urgency, tags, summary, is_key, owner }` — output of `classifyCapture()`
**routed_to values:** `task`, `blocker`, `decision`, `content`, `note`, `habit`
**routed_id:** FK to `tasks.id` (for routed task/blocker/decision/content rows)

---

## tasks
Tasks, blockers, decisions, and content items. All four kinds live in this table, distinguished by `kind`.

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| user_id | text | NO | — |
| title | text | NO | — |
| description | text | YES | — |
| urgency | text | NO | `someday` |
| is_key | boolean | YES | false |
| priority_score | float8 | YES | 0 |
| time_estimate_min | integer | YES | — |
| tags | text[] | YES | `{}` |
| due_date | date | YES | — |
| owner | text | YES | — |
| entity_id | uuid | YES | — |
| status | text | NO | `open` |
| kind | text | NO | `task` |
| completed_at | timestamptz | YES | — |
| created_at | timestamptz | YES | now() |
| updated_at | timestamptz | YES | now() |

**urgency values:** `today`, `this_week`, `this_month`, `someday`, `overdue`
**status values:** `open`, `done`, `blocked`
**kind values:** `task`, `blocker`, `decision`, `content`
**priority_score:** 100 for `is_key = true`, 50 otherwise (set at insert)
**entity_id:** optional FK to `entities.id`
