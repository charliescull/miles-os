---
title: Do Not Break
tags: [safety, architecture]
---

# Things That Must Not Break

This file exists so Claude Code never accidentally damages a live system. Every item here has a reason — read it before touching anything nearby.

---

## 1. The Capture Pipeline

**Files:** `app/api/capture/route.ts`, `app/api/telegram/webhook/route.ts`, `lib/router/classifyCapture.ts`, `lib/memory.ts`

**Why:** Every capture ever made has gone through this pipeline. Breaking it means new captures stop being classified, stored, or embedded. Historical data in `raw_captures`, `tasks`, and `memory_chunks` depends on the schema this pipeline writes.

**Rules:**
- Never change the `raw_captures` insert shape without a DB migration
- Never remove the `embedAndStore` call — it's fire-and-forget but essential for RAG
- Never change `classifyCapture`'s return shape without updating all consumers
- The `audit_log` insert must remain at the end

---

## 2. Supabase Schema

**Why:** The schema is live in production. Renaming tables or columns breaks every query instantly with no migration path.

**Rules:**
- Never rename: `raw_captures`, `tasks`, `daily_logs`, `memory_chunks`, `entities`, `audit_log`
- Never remove or rename columns that existing queries reference
- Any schema change requires a Supabase migration file first

---

## 3. `match_memory_chunks` RPC

**File:** Called in `app/api/ask/route.ts` line 25

**Why:** This is a custom pgvector function in Supabase. If its name or signature changes, `/api/ask` breaks silently (returns no results but doesn't throw).

**Rules:**
- Never rename this RPC call without updating the Supabase function too
- Parameters: `query_embedding`, `match_user_id`, `match_count` — all required

---

## 4. Auth Middleware

**File:** `lib/auth.ts`, `isAuthenticatedFromRequest()`

**Why:** Every API route except the Telegram webhook uses this. Weakening it exposes all user data.

**Rules:**
- Never remove the auth check from any API route
- Never change the cookie name `os-auth` without clearing existing sessions
- The three-tier check (x-api-secret → cron Bearer → cookie) must remain in order

---

## 5. Telegram Webhook Security

**File:** `app/api/telegram/webhook/route.ts` lines 28-30, 38-41

**Why:** Without the secret token check and user ID check, anyone who discovers the webhook URL can inject data into the capture pipeline.

**Rules:**
- Never remove the `x-telegram-bot-api-secret-token` verification
- Never remove the `TELEGRAM_USER_ID` sender check

---

## 6. oklch Design System

**File:** `app/globals.css`, all component files

**Why:** The entire UI is built on a specific oklch palette. Introducing hex/hsl colors creates visual inconsistency and makes future theming impossible.

**Rules:**
- Never introduce `#xxxxxx` or `hsl()` colors in component files
- Always use the defined oklch tokens (see CLAUDE.md Design System table)
- Never remove or rename `card`, `card-label`, `mono`, `badge-warm`, `badge-hot` CSS classes

---

## 7. Shell + TopRail Layout

**Files:** `components/dashboard/Shell.tsx`, `components/dashboard/TopRail.tsx`

**Why:** Every page uses Shell. Changing Shell's structure affects every route simultaneously.

**Rules:**
- Never remove `TopRail` from Shell
- Never change the `min-h-screen flex flex-col` structure of Shell
- Never change TopRail's `h-10` height without updating all `h-[calc(100vh-40px)]` references in page files

---

## 8. `lib/config.ts`

**Why:** All user-specific values (name, habits, nutrition goals) are centralized here. If anything reads from this, hardcoding those values elsewhere creates drift.

**Rules:**
- Always read from `config` in components, never hardcode Charlie's name, habits, or goals
- Adding new config values is safe; removing or renaming existing ones requires a codebase search first
