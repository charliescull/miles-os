# HANDOFF — "Black & White 2.0" — Phase 1 → Phase 2

Phase 1 (Fable) is done: tokens, HUD primitives, 3D+bloom pipeline, boot sequence, and HOME as the gold-standard pattern. Phase 2 (Opus) builds HEALTH, CRM, FINANCE, REVIEW, nav transitions, ambient audio, and the responsive/perf passes **by composing what exists — do not invent new design language.** Log judgment calls in `POLISH_TODO.md`.

## North star (one paragraph)

Boots like classified hardware waking up, resolves into a living machine: each tab is a glowing white **organ** breathing on a black field, surrounded by dense spec-sheet data. Pure black + white at rest; green/red ONLY as state signals. Dense in data, calm in motion. When unsure, cut motion and add a true-feeling detail.

## Design tokens — `app/globals.css` (single source of truth)

- **Field:** page bg is `oklch(0 0 0)` (pure black, NOT the old 0.08). Surfaces `--card-bg: oklch(0.04 0 0)`, hairline borders `oklch(1 0 0 / 0.10)`.
- **Signals:** `--signal-up: oklch(0.78 0.17 150)` (good/up/done), `--signal-down: oklch(0.64 0.21 27)` (bad/down/overdue). Nothing else gets chroma. The old amber/blue roles are deliberately collapsed to white/muted (`badge-warm` → white outline, `badge-cool` → dim) — keep it that way.
- **Bloom (CSS):** use classes `glow` / `glow-hot` / `glow-up` / `glow-down` / `glow-box`. The recipe is tight-first-shadow (1px, keeps glyphs crisp) + wide faint halos. **Never** widen the first shadow — that's how text goes blurry.
- **Motion:** exactly two speeds. SNAP = `var(--snap)` (130ms) for all UI feedback. DRIFT = 6s+ loops (`drift-rotate`, `drift-breathe`, `--drift-period: 24s`) for ambient life. Anything in between reads cheap — don't.
- **Scanlines:** `body::after` overlay, disabled under reduced motion. Don't add a second grain layer per page.
- **Reduced motion:** the global `@media (prefers-reduced-motion: reduce)` kill-switch exists; JS side uses `useReducedMotion()` from `components/hud`. Every new animation must respect both.

## Typography roles

| Role | Class | Font |
|---|---|---|
| Headers / stamps ("OPERATOR ONLINE") | `.display` | Michroma (`--font-display`) |
| HUD labels, serials, boot copy | `.hud` | Share Tech Mono (`--font-hud`) |
| Dense numeric data | `.mono` | Geist Mono (tabular-nums) |
| Body prose | default | Geist Sans |

`card-label` is already `.hud`-flavored — use it for all panel micro-labels.

## HUD primitives — `components/hud/` (compose, don't reinvent)

- `HudFrame` — corner-bracket surface. `Panel` (dashboard) wraps it; keep using `Panel` for cards, its V3.1 API is unchanged.
- `Odometer value="$128,440" play={bool}` — rolling numerals; digits only roll, punctuation fixed; reduced-motion renders final value. Use for any hero number reveal.
- `BlockGauge ratio segments signal?` — segmented meter (habit %, macro %, position weight).
- `SpecRow label value signal?` — dotted-leader spec line; build dense data stacks from these.
- `Serial seed` / `Barcode seed` — diegetic furniture; ALWAYS seed-deterministic (`seededRandom` in `seed.ts`) — **never `Math.random()` in render** (hydration).
- `HatchStrip` — caution-stripe separators.

## The organ pattern (clone HOME's)

Reference implementation: `components/three/BrainStage.tsx` + `Brain.tsx` + `SceneCanvas.tsx`, wired in `components/dashboard/HomeBrain.tsx`, used in `app/page.tsx`.

Recipe per section:
1. Organ = procedural white geometry (points + additive hairlines) inside `SceneCanvas` (it owns bloom, dpr cap, visibility pause, reduced-motion still-frame). Lazy-load via `next/dynamic` `ssr: false` from a client stage wrapper.
2. **Bloom numbers that work (hard-won):** Bloom intensity 0.55, luminanceThreshold 0.32, base points opacity ~0.35–0.45, hairlines 0.06, only the *moving accents* (pulses, EKG head, P/L flash) near opacity 1 so bloom ignites just them. Intensity 1.1 + threshold 0.08 = blown-out blob; don't go back.
3. Stage wrapper adds diegetic margin furniture (corner labels, Serial, activity %) + hairline crosshair.
4. A small client component fetches real data → drives organ params (see `HomeBrain.tsx`: habits+tasks → `liveliness`).
5. Page layout: organ `h-[44vh] min-h-[300px]` top-of-center-column, `HatchStrip`, then data panels. Margins keep persistent HUD furniture.

Section organs (direction already approved):
- **HEALTH** — beating heart: same point/line technique on a two-chamber shape; scale pulse at a real cardiac rhythm (systole snap ~0.12s, diastole relax) + running EKG polyline (one bright head pixel, dim trail). Sync the HEALTH ambient pulse to it.
- **CRM** — rotating node constellation: entities/tasks as nodes, relationships as hairlines; stale contacts dim (opacity by days-since-touch). Data: `/api/entities`, `/api/tasks`.
- **FINANCE** — net-worth core: dense point sphere pulsing green/red by daily P/L sign (tint ONLY the pulse accent, not the whole organ); ticker nodes orbit, sized by position. Data: `/api/finance/snapshot`, `/api/finance`.
- **REVIEW** — lighter: no 3D required; calm system-log/ledger of `SpecRow`s with a slow cursor. Judgment call yours.

## Boot sequence — `components/boot/`

`BootGate` (wraps HOME content) + `BootSequence` (overlay). Timeline: cascade 0–2.0s → metrics odometers 2.0–3.9 → OPERATOR ONLINE 3.9–5.1 → strokes assemble into brain silhouette while overlay dissolves 5.1–6.3. Skippable (click/ESC), once per session (`sessionStorage miles-booted`), TopRail `[ REBOOT ]` replays **with sound** (the click unlocks WebAudio; the automatic first boot is silent by browser law). Reduced motion: 900ms ONLINE card. Don't slow the timeline; Phase 3 owns easing tweaks.

## Audio — `lib/sound.ts`

Pure WebAudio synthesis, master gain 0.16 ("pleasant at 11pm"), `isMuted()/setMuted()` persisted in localStorage. Boot cues exist (`playBootSwell/playTick/playChime`). Phase 2 builds per-section generative ambient ON TOP of this engine (export ctx/master access as needed): HOME airy shimmer, HEALTH pulse synced to heartbeat, FINANCE faint tape, CRM sparse pings. Rules: gate behind first user gesture, mute toggle in TopRail (build it — currently only the lib flag exists), ≤2 simultaneous voices per section, no samples.

## Performance budget

- 3D: one canvas per page, ≤3k points + ≤2.5k line segments per organ, dpr cap 1.75, no per-frame allocations in `useFrame` (reuse vectors), `frameloop` pauses off-screen/hidden (SceneCanvas does this).
- First paint: 3D + audio always behind `next/dynamic` `ssr:false`. Target 60fps; graceful fallback = render the organ static (reduced-motion path doubles as the low-power path).

## Next.js notes (v16.2.6 — read `node_modules/next/dist/docs/` before unfamiliar APIs)

- For instant tab navigations, routes can export `unstable_instant` (see `01-app/02-guides/instant-navigation.md`) — relevant when you build tab morphs. Tab changes should be diegetic morphs (organ dissolves/reassembles, shared HUD chrome persists), not slides.
- `middleware` is `proxy.ts` in this repo. Don't touch auth.

## Known issues / leftovers (also seeded in POLISH_TODO.md)

- **Pre-existing hydration mismatch:** `lib/config.ts` reads non-`NEXT_PUBLIC` env (`USER_ROLE` etc.) and is imported by client components → server says "Intern", client says "Student". Fix: inline public values or NEXT_PUBLIC_ them.
- Card interiors (Session/Habits/Calendar/Nutrition/CRM/Finance/Review pages) still wear V3.1 styling — Phase 2 restyles interiors with SpecRow/BlockGauge/Odometer. Panel chrome is already converted.
- `arbitrage-engine/` is excluded from tsconfig — separate project, leave it.
- Old streak value in OperatorCard is hardcoded 0 (pre-existing).

## Verify loop

Dev server usually already runs on :3000 (login password in `.env.local` `DASHBOARD_PASSWORD`). **Production is on Vercel** — localhost is only the pre-deploy check; nothing ships until git push. `npx tsc --noEmit` and `npm run build` must stay green. Replay boot: `[ REBOOT ]` or clear `sessionStorage['miles-booted']`.
