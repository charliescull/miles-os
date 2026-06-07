---
title: Telegram Agent — Capture-to-Category Spec (v1)
tags: [telegram, capture, vision, spec]
date_authored: 2026-05-29
status: planning
---

# MILES OS // Telegram Agent — Spec (v1)

Turn the Telegram bot into a phone-driven input layer that classifies anything sent and routes it to the right category — including **images** (workout screenshots, meals) via Claude vision, plus task check-off and calendar event creation.

## Goal (owner's words)
Send anything from my phone → it updates the right category automatically:
- Workout **screenshot(s)** → logged as exercises + reps under the day.
- A meal → logged as **standard food** (just logged) OR **recipe** (analyzed + taste-scored + saved) if I say "recipe."
- Add **and check off** tasks in the CRM.
- Add **events** to my calendar.

## Decisions locked (2026-05-29)
- **Calendar:** build write access. Owner shares their Google Calendar with the existing service account (`personal-os@personal-os-497319.iam.gserviceaccount.com`) + enable Calendar API. Service account creates events.
- **Food vs recipe:** the existing recipe system stays (analyze + taste rating + saved to recipe library). Add a NEW lightweight **standard food log** = just logged to the day with macros, no taste score, not saved as a named recipe. Bot routes to recipe only when the message says "recipe"; otherwise standard food.
- **Workout:** extend beyond the single `workout_type` string per day — store every exercise + reps. Screenshot format: muscle group at top, each exercise + reps listed beneath (owner to paste exact format).

## Current state (verified 2026-05-29)
- **Telegram webhook** `app/api/telegram/webhook/route.ts`: handles text + voice (Whisper) only. Ignores `message.photo`. Security checks (`x-telegram-bot-api-secret-token` + `TELEGRAM_USER_ID`) intact — DO NOT weaken. Routes via `classifyCapture` → `tasks` only.
- **classifyCapture** `lib/router/classifyCapture.ts`: kinds = task|blocker|decision|content|note|habit. No workout/meal/calendar/done intents. Text-only.
- **Workouts** `app/api/workouts/route.ts` + `workouts` table: `{ user_id, date, workout_type, updated_at }`, unique (user_id, date). ONE string per day — no exercise detail.
- **Recipes** `app/api/recipes/{route,analyze}.ts` + `recipes` table: dish_name, macros, food_score, score_tag, rationale, taste_rating, created_at. analyze is TEXT-ONLY (no vision).
- **Calendar** `app/api/calendar/route.ts`: READ-ONLY iCal feed (`GOOGLE_CALENDAR_ICAL_URL`). Cannot write.
- **No vision/image handling anywhere.** No `foods`/`meals` table.
- **Tasks** (`tasks` table, migration 0001): status open|done|blocked, completed_at. Check-off = update status='done'.

## Hard constraints
- **Telegram needs a public HTTPS webhook** — cannot reach localhost. The live bot must point at the **Vercel deployment**; env vars must be set on Vercel. Test the bot against production. (Underlying API routes are still testable locally via the API secret.)
- **Env not set:** `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `TELEGRAM_USER_ID` are all empty in `.env.local`. Bot is not connected yet.
- Respect [[project-os-system]] DO-NOT-BREAK: capture pipeline shape, Telegram secret check, auth middleware, additive schema only.

## Proposed phases (each verifiable via its own API route before wiring the bot)
0. **Connect the bot** — BotFather token → env (local + Vercel) → register webhook with secret → verify text round-trip. (Owner action: create bot, give token.)
1. **Standard food log** — new `food_log` table + `/api/food` route + Health-page UI section. Text path testable immediately.
2. **Workout exercise detail** — extend schema (e.g. `workout_exercises` or JSONB on `workouts`) + `/api/workouts` update + Health UI detail area. Needs owner's screenshot format.
3. **Vision pipeline** — shared helper: Telegram photo(s) → Claude vision → structured parse. Wire to workout + food. Needs screenshot format.
4. **Calendar write** — service-account Calendar API; `/api/calendar` POST to create events. Needs owner's Google setup.
5. **Task add + check-off intent** — extend classifier/intents so "done: X" / "finished X" completes a matching task.
6. **Wire the webhook** — photo handling + intent routing + per-category confirmations. Connect live, verify each category from phone.

## Workout screenshot format (from 4 real examples, 2026-05-29)
Source = iOS Notes. Structure:
- **Title line** = workout name, free-form/custom (e.g. "Torso 1-", "Back + triceps + Core", "shoulders arms PT", "PT chest Tri cardio"). NOT clean PUSH/PULL. Store verbatim as the day title (`workouts.workout_type`).
- **One exercise per line**, then a set/rep token. Notation is **inconsistent** — do NOT force a rigid sets×reps split:
  - "3x12", "3x8" = sets×reps; BUT "Pushups 30x3", "Decline sit-ups 10x 2", "Russian twists 16x 2", "Ankle taps 100 x2" = reps×sets.
  - ranges: "3x6-8", "3x20-25"; to-failure: "2x failure", "2xfailure HARD"; time: "30 seconds x 3"; each-side: "2x30e", "2x 8 E" (e/E = each).
  - modifiers in parens or trailing: "(descend 5 reps each time)", "(10 drop set)", "(drop 10)", "w dropset", "25 lbs", "no weight", "Right leg", "HARD", "killer".
- **Strikethrough = skipped** (planned but not done) → `done=false`. Claude vision detects strikethrough.
- **Sub-sections**: a line ending ":" starts a section ("Physical therapy:", "Push-up circuit:") that groups following exercises (`section` field). Blank lines separate groups.
- **Trailing " x"** on every line (PT screenshot) = the owner's done-marker; treat as done=true.

Parser contract (vision → JSON): `{ title, exercises: [{ section, name, raw, sets, reps, note, done }] }` where `raw` = the verbatim set/rep string (always kept), `sets` int|null, `reps` text|null (best-effort), `note` = modifiers, `done` bool.

## Owner action items
1. **BotFather:** open @BotFather in Telegram → `/newbot` → name it → copy the **bot token**. Also get your numeric user id from @userinfobot.
2. Paste the workout screenshot **exact text format** (muscle group + exercises + reps) so the vision parser matches it.
3. **Calendar (phase 4):** share your Google Calendar with `personal-os@personal-os-497319.iam.gserviceaccount.com` (Make changes to events) + enable Google Calendar API in the `personal-os` Cloud project.
4. Add `TELEGRAM_*` (and later calendar) env vars to **Vercel** + redeploy.
