---
title: System Overview
tags: [architecture, overview]
---

# MILES OS — System Overview

Personal AI operating system for Charlie Scullion. Single-user Next.js app on Vercel that replaces scattered apps (Notion, spreadsheets, phone reminders) with one unified interface.

## What it does
1. **Captures** anything via Telegram (voice or text) or the web dashboard
2. **Classifies and routes** captures automatically using Claude
3. **Surfaces context** via semantic search (RAG over memory_chunks)
4. **Tracks** daily habits, nutrition, finances, and weekly reviews over time
5. **CRM** for people, projects, and orgs

## Version
V3.1 (visible in TopRail branding)

## Deployment
- Next.js App Router → Vercel
- Supabase for all persistence (PostgreSQL + pgvector)
- Single-user: all data scoped to `USER_ID` env var
- Finance snapshot cron runs daily at 05:00 UTC

## Required Env Vars
```
NEXT_PUBLIC_SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
NEXT_PUBLIC_SUPABASE_ANON_KEY
ANTHROPIC_API_KEY
OPENAI_API_KEY
TELEGRAM_BOT_TOKEN
TELEGRAM_WEBHOOK_SECRET
TELEGRAM_USER_ID
AUTH_SECRET
API_SECRET
CRON_SECRET
USER_ID
USER_DISPLAY_NAME
USER_LOCATION
USER_ROLE
USER_TIMEZONE
ANTHROPIC_MODEL          # optional, default: claude-sonnet-4-6
```

## AI Models in Use
| Model | Provider | Used for |
|---|---|---|
| `claude-sonnet-4-6` | Anthropic | Capture classification, /ask streaming answers |
| `text-embedding-3-small` | OpenAI | Embedding captures and search queries |
| `whisper-1` | OpenAI | Telegram voice transcription |
