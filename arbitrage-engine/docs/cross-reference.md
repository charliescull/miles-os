# Arbitrage Engine ↔ MILES OS — relationship & isolation

This sub-project lives **inside** the MILES OS repo for convenience but is
deliberately **isolated**. This doc records exactly what is and isn't shared so
the risk of the arbitrage experiment never bleeds into the production dashboard.

## What is NOT shared (hard isolation)
- **Database**: separate Supabase project (or at minimum separate tables —
  `scraped_items`, `market_comparables`, `opportunities`, RPC `match_equipment`).
  None of MILES OS's tables (`tasks`, `daily_logs`, `memory_chunks`,
  `match_memory_chunks`, `entities`, `audit_log`) are touched.
- **Env / secrets**: its own `.env` (scraper) and `.env.local` (dashboard).
  Does not read MILES OS env.
- **Code**: no imports across the boundary in either direction.
- **Auth**: dashboard is its own app; it does not use the `os-auth` JWT scheme.
- **Cron**: unrelated to the MILES OS 05:00 UTC finance snapshot.

## What IS shared (patterns only, by reference)
- The **Supabase service-role, server-side-write** pattern (mirrors
  `lib/supabase.ts`).
- A **dark, oklch-friendly** visual language so the eventual merge feels native.
- The **pluggable-provider** instinct (comps backend swap mirrors the finance
  data-source fallbacks).

## Future integration path (when/if the experiment proves out)
The dashboard is built as portable App Router files. To fold it into MILES OS:
1. Move `dashboard/app/page.tsx` → a new MILES OS route, e.g. `app/arb/page.tsx`,
   wrapped in the existing `Shell`/`TopRail`.
2. Replace the standalone Supabase client with a server-side read via the MILES OS
   service-role client (keep realtime if desired via the public client).
3. Map the card styling onto MILES OS's `card`/`badge-*` utilities + oklch tokens.
4. Add a left-rail nav entry. Keep the arbitrage Supabase tables separate unless a
   full data merge is intended.

Until then: **do not** import arbitrage code from MILES OS or vice-versa.

## Memory
Tracked in the MILES OS memory index as `arbitrage-engine`
(`~/.claude/.../memory/arbitrage_engine.md`). Cross-references
[[project-os-system]] for the stability rules it must respect on eventual merge.
