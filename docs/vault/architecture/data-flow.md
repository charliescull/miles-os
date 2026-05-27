---
title: Data Flow & Capture Pipeline
tags: [architecture, capture, pipeline]
---

# Data Flow

## Capture Pipeline (the core system)

```
Input (web or Telegram)
  │
  ├─ Voice (Telegram only) → Whisper transcription → text
  │
  └─ Text
       │
       ▼
classifyCapture(text)           ← Claude claude-sonnet-4-6
  Returns: { kind, urgency, tags, summary, is_key, owner }
  kind: task | blocker | decision | content | note | habit
  urgency: today | this_week | this_month | someday
       │
       ├─ kind = task/blocker/decision/content
       │    └─ INSERT into tasks table
       │
       └─ kind = note/habit
            └─ UPSERT into daily_logs.notes.captures[] (JSON)
       │
       ▼
embedAndStore(text, sourceType, sourceId)
  ← OpenAI text-embedding-3-small (1536-dim)
  → INSERT into memory_chunks
       │
       ▼
INSERT into audit_log
```

## RAG Query Flow (/api/ask)

```
User question
  │
  ▼
OpenAI text-embedding-3-small → question embedding
  │
  ▼
Supabase RPC: match_memory_chunks(embedding, user_id, count=20)
  ← pgvector cosine similarity
  │
  ▼
Claude streaming response with matched chunks as context
  └─ Cites chunks by ID in [brackets]
```

## Auth Flow

```
Request arrives
  │
  ├─ x-api-secret header → matches API_SECRET env var → allow
  ├─ Authorization: Bearer → matches CRON_SECRET env var → allow (crons)
  └─ Cookie os-auth (JWT, HS256, 30d) → verify → allow/deny
```

## Finance Snapshot Cron

- Runs daily at 05:00 UTC via Vercel cron (vercel.json)
- POST /api/finance/snapshot
- Auth via CRON_SECRET Bearer token

## Telegram Bot Flow

```
Voice/text message from authorized user (TELEGRAM_USER_ID)
  │
  ├─ Verify x-telegram-bot-api-secret-token
  ├─ Verify sender user ID matches TELEGRAM_USER_ID
  │
  ├─ Voice → fetch file → Whisper transcription → text
  │
  └─ Same pipeline as /api/capture
       └─ Reply with classification + urgency inline keyboard
```
