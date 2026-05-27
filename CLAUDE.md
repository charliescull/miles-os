@AGENTS.md

# MILES OS — Project Overview

Single-user personal AI operating system for Charlie Scullion (OSU student, Columbus OH, EST). A Next.js App Router app deployed on Vercel that centralizes task management, habits, nutrition, finances, weekly reviews, and a CRM into one dark-themed dashboard. Has an AI capture pipeline (Telegram + web) that classifies and routes anything captured into Supabase, with vector embeddings for semantic memory search.

**Version:** V3.1
**Stack:** Next.js (App Router), TypeScript, Supabase (PostgreSQL + pgvector), Tailwind CSS, oklch design system
**AI:** Claude (`claude-sonnet-4-6`) for capture classification + /ask RAG; OpenAI for embeddings + Whisper transcription
**Input channels:** Web capture bar + Telegram bot (text + voice notes)
**Cron:** Finance snapshot daily at 05:00 UTC (vercel.json)

---

# Pages & Routes

| Route | File | What it does |
|---|---|---|
| `/` | `app/page.tsx` | Dashboard — 3-col grid (280px \| 1fr \| 280px), h-[calc(100vh-40px)] |
| `/finance` | `app/finance/page.tsx` | Net worth, liquid/invested/liabilities, sparklines, snapshot history table |
| `/crm` | `app/crm/page.tsx` | Tasks/blockers/decisions/content/people — kanban + list views |
| `/review` | `app/review/page.tsx` | Weekly review form, auto-saves, sealable |
| `/login` | `app/login/page.tsx` | Password login → 30-day JWT cookie |

## Dashboard Cards (left → centre → right)
- **Left:** OperatorCard (identity + focus + streak), FinancePulseCard, KeyBlockersCard
- **Centre:** SessionCard, HabitsCard, CalendarCard
- **Right:** NutritionCard

---

# Architecture

## Layout
Every page wraps in `Shell` (`components/dashboard/Shell.tsx`) → `TopRail` + `<main>`. Never replace Shell.

## Data Layer
- All DB via Supabase **service role client** (`lib/supabase.ts`) — server-side only
- `USER_ID` from env `USER_ID`, default `'user'`
- Public client exists but unused (all reads are server-side)

## Key Tables
| Table | Purpose |
|---|---|
| `raw_captures` | Every capture: source, raw_text, classification, routed_to |
| `tasks` | Tasks, blockers, decisions, content items |
| `daily_logs` | Per-day habits + notes/captures JSON |
| `memory_chunks` | OpenAI embeddings (text-embedding-3-small, 1536-dim) for RAG |
| `entities` | CRM people / orgs / projects |
| `audit_log` | Full action audit trail |

---

# The Capture Pipeline — DO NOT BREAK

Text in via POST `/api/capture` (web) or POST `/api/telegram/webhook` (Telegram):

1. **`classifyCapture()`** — calls Claude to return `{ kind, urgency, tags, summary, is_key, owner }`
2. **Route** — task/blocker/decision/content → `tasks` table; note/habit → `daily_logs.notes.captures`
3. **`embedAndStore()`** — OpenAI embedding → insert into `memory_chunks`
4. **Audit** — write to `audit_log`

Telegram additionally handles voice via Whisper before the same pipeline.

---

# The RAG Memory System

POST `/api/ask`:
1. Embed question via OpenAI
2. Call `match_memory_chunks` Supabase RPC (pgvector cosine similarity, top 20)
3. Stream Claude response with matched chunks as context

Note: this is the *app's own* internal memory — entirely separate from Claude Code's file-based memory system.

---

# Design System — DO NOT DEVIATE

Dark theme using **oklch only**. Never substitute hex or hsl equivalents.

| Role | Value |
|---|---|
| Background | `oklch(0.08 0 0)` |
| Green / primary / positive | `oklch(0.72 0.18 145)` |
| Amber / this-week | `oklch(0.78 0.16 90)` |
| Red / overdue / danger | `oklch(0.65 0.22 25)` |
| Blue / later | `oklch(0.60 0.10 230)` |
| Muted labels | `oklch(0.45 0 0)` |
| Subtle borders | `oklch(1 0 0 / 0.06)` |

CSS utility classes: `card`, `card-label`, `mono`, `badge-warm`, `badge-hot` — defined in `app/globals.css`. Use these; don't reinvent them.

---

# Authentication

- JWT cookie `os-auth`, 30-day, HS256
- `isAuthenticatedFromRequest()` checks in order: `x-api-secret` header → `Authorization: Bearer <CRON_SECRET>` → cookie
- Every API route is auth-gated except the Telegram webhook (uses its own `x-telegram-bot-api-secret-token`)

---

# Config (`lib/config.ts`)

User values live here — never hardcode them elsewhere:
- `displayName`, `role`, `location`, `timezone`, `userId`
- `habits[]` — the tracked habits list
- `nutritionGoals` — kcal/protein/carbs/fat/cutoffHour

---

# DO NOT BREAK — Hard Rules

1. **Capture pipeline** — `classifyCapture` + `embedAndStore` + audit. Breakage corrupts historical routing.
2. **Supabase table/column names** — live schema. Never rename without a migration.
3. **`match_memory_chunks` RPC** — must exist with this exact name and signature.
4. **Auth middleware** — never remove or weaken `isAuthenticatedFromRequest`.
5. **oklch design tokens** — the entire visual system depends on these exact values.
6. **Shell + TopRail** — wraps every page. Don't replace or restructure.
7. **Telegram secret check** — `x-telegram-bot-api-secret-token` is a security boundary.

---

# Session Logging

**At session start:** Read the most recent file in `docs/vault/sessions/` to get context on the last session.

**At session end:** Append a summary to `docs/vault/sessions/YYYY-MM-DD.md` (today's date). Include:
- What was changed or built
- Decisions made
- Anything left in progress
- Next steps

---

# Knowledge Vault

Extended docs live in `docs/vault/`. Read relevant files before making changes in that area:
- `docs/vault/architecture/` — system design details
- `docs/vault/dont-break.md` — expanded protected list with reasoning
- `docs/vault/sessions/` — session logs (most recent = last worked on)
