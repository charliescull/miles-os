# Capture reliability verification

This evidence covers the mobile quick-capture/idempotency slice. It deliberately
separates checks run in this checkout from checks that require the deployed
Supabase project.

## Implementer correction

The initial claim function incorrectly returned `claimed = false` for a newly
inserted row because it treated the fresh `processing` lease as an existing
active request. The function now tracks whether the insert won and returns
`claimed = true` for that first request. `/api/quick` also reports explicit
`processed` versus `in_progress` states; the mobile queue retries the latter
instead of marking it complete.

## Checks run in this worktree

- `npx eslint app/api/quick/route.ts app/m/page.tsx components/mobile/MobileCommandCenter.tsx lib/router/routeText.ts next.config.ts` — passed.
- `npx tsc --noEmit` — passed.
- `git diff --check` — passed.
- `npm run build` — reaches application compilation, but the sandbox blocks the
  existing Google Fonts downloads. This is an environment limitation, not a
  reported TypeScript or application compilation error.
- Next.js 16 guidance was checked in
  `node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/turbopack.md`
  and `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md`.

## Database checks still required before release

The migration is present at `supabase/migrations/0010_capture_idempotency.sql`,
but this worktree does not have deployment authority or a safe database
connection. Therefore the migration is **not claimed to be applied**.

Run the migration through the normal Supabase deployment process, then execute
`supabase/tests/0010_capture_idempotency.sql` in a service-role SQL session.
That script checks first-winner behavior, failed-request retry, stale-lease
reclaim, request-hash binding, and fencing-token replacement.

The concurrent winner check requires two database sessions. In both sessions,
call `claim_capture_request` with the same `(user_id, source,
idempotency_key)` and different processing tokens while the first transaction
is open. Exactly one call must return `claimed = true`; the other must return
`claimed = false` after the row lock is released. Do not use production content
for this test.

## Manual mobile/API checks

After deployment, authenticate normally and record the result without recording
cookies, tokens, or request contents:

1. Open `/m`, submit a short test capture, and confirm it reaches `processed`.
2. Disable connectivity, submit another capture, reload `/m`, and confirm it
   remains queued.
3. Restore connectivity and confirm the same item reaches `processed`.
4. Replay the same POST to `/api/quick` with the same `Idempotency-Key`; confirm
   no second domain record is created and the response says it was already
   processed or in progress.
5. Reuse that key with different text; confirm the request is rejected.
6. Confirm the resulting capture has a memory embedding and audit entry.

Until these database and deployment checks are completed, acceptance remains
`FIX_REQUIRED` for release even though the local static checks pass.

## Follow-up hardening in this checkout

- Claim ownership checks now renew the lease with a conditional token-matched
  update, so a replaced worker observes claim loss through a write fence.
- Heartbeat failures are retained and checked before completion.
- Completion and failure transitions require the active processing token and
  verify that exactly one ledger row was updated; a failed transition is no
  longer silently ignored.
- `/api/quick` preserves `201` for a completed first submission, `200` for a
  completed replay, `202` for an in-progress replay, and `409` for hash reuse.
- `node --experimental-strip-types --test scripts/quick-capture-response.test.mjs`
  passes all three response-state tests.
- Focused ESLint, TypeScript, and `git diff --check` pass after this pass.
