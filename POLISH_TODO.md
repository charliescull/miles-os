# POLISH_TODO — cleared at end of Phase 3 (2026-06-10)

All Phase 1/2 items resolved in Phase 3:

- Card interiors (Session/Habits/Nutrition/Calendar/Operator/FinancePulse) restyled to tokens — BlockGauges for habits + fuel, glow on hero numbers, decorative green eliminated app-wide (login, finance terminal, health, CRM). Donut palettes converted to a white→gray luminance ramp (chroma reserved for signals).
- Boot→HOME morph: assemble strokes now converge onto the REAL brain canvas (measured from `[data-brain-stage]` at assemble time, with center-screen fallback).
- Brain initial pose: -0.55 rad yaw → 3/4 profile first frame (also the reduced-motion still).
- TopRail tickers: hardcoded fakes replaced with live NW + day P/L from `/api/finance/snapshot`.
- OperatorCard streak: wired to real workout data (same REST-day rules as HEALTH).
- Responsive-light: HOME/HEALTH stack below `lg`; FINANCE/CRM/REVIEW grids collapse below `md`; holdings table scrolls horizontally.
- Ambient mix tuned conservative (sparser shimmer/ticks/pings, softer heartbeat thump).
- Reduced-motion paths re-verified in code: CSS kill-switch, Odometer final-value, Boot 900ms card, SceneCanvas demand-frame, EkgLine static beat, TabMorph flattens.

## Remaining — requires human senses (can't be done by the model)

- [ ] **Audition the audio at low volume at night** — levels are deliberately conservative and theoretically mixed; tweak the constants in `lib/sound.ts` `setAmbientSection` to taste.
- [ ] **Eyeball reduced-motion** — toggle OS "reduce motion" and visit each tab once.
