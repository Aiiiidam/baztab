# 013 — Phase 1 implementation choices

Choices made while building Phase 1 that the specs and plan left open, or where the code differs
from a plan detail. Each entry says why. (012 is reserved for the infrastructure-proof outcome, plan
M0-T5.)

## M1 — Organization sign-in

- **National-ID check digit uses the tens digit.** The plan's "ninth digit + 2" is read as the digit
  in the tens place (the 10th of 11), which is the published legal-entity algorithm and validates the
  widely cited example `10380284790`. A run of six zeros after the prefix is also rejected.
- **Argon2id via `@node-rs/argon2`** (assumption A4) at the OWASP baseline m=19 MiB, t=2, p=1. On the
  development laptop one verify takes ≈ 18 ms (p95 26 ms) and ten concurrent verifies ≈ 40 ms p50 /
  69 ms p95, ≈ 190 MiB peak. Re-measure on the Darkube web plan with `node scripts/bench-argon2.mjs`.
- **Throttle semantics.** "Increasing delay rather than a hard lockout" is implemented as: after 5
  account failures in a 15-minute window, the next attempt waits 30 s, then 1, 2, 4, 8 minutes, capped
  at 15. The source limit (30 per window) blocks until the window ends. Keys are SHA-256 of the scope
  and identifier. The check runs before the password hash and the failure is recorded after it, so a
  burst of parallel attempts can exceed the limit by its concurrency; Argon2id cost bounds that.
- **The client address** is the Nth entry from the end of `X-Forwarded-For`, N = `TRUSTED_PROXY_COUNT`
  (default 1, the Darkube ingress). Verify the header chain in M0-T4.
- **One env schema for every process.** `PROCESS_ROLE` (web, worker, cli) picks
  `DATABASE_URL_WEB` / `_WORKER` with `DATABASE_URL` as the local fallback; the migration URL is
  mapped only in `prisma.config.ts` and the operator CLI. Runtime-only production requirements
  (`APP_ORIGIN`, S3 storage, no fake inference) are skipped while `next build` runs, because builds
  only have a placeholder URL; `SKIP_AUTH` is refused in production builds too.
- **Raw SQL binds instants through `utc()`.** A local PostgreSQL in `Asia/Tehran` shifted raw `Date`
  parameters by 3h30 when written to `timestamp` columns. Supabase defaults to UTC, which would have
  hidden the bug; the helper makes every raw query time-zone independent. The local test database is
  deliberately left in Tehran time.
- **Sessions are `MemberSession`** (`member_sessions`), with the composite tenant FK
  `(organizationId, membershipId)`; the template `User`/`Session` tables were dropped in a second
  migration on an empty development database.
- **A must-change session reaches only `/change-password`.** Pages redirect there; route handlers
  answer 403 `password_change_required`.
- **E2E members are provisioned through the real operator CLI** and each run uses random mobiles, so
  the suite needs no seeded credentials. Sign-in throttling is reset at the start of an e2e run (it is
  covered by integration tests).
- **Local tooling.** PostgreSQL 16 and FFmpeg are installed on the development machine with winget;
  Docker is not available there, so image builds are verified in CI only. The Playwright CDN is
  geo-blocked from the development network, so `PLAYWRIGHT_CHANNEL=msedge` drives the installed Edge.

## M2–M5 — Upload, analysis, report, lifecycle (local workflow)

- **Order.** The analysis schema (M3-T1) and the report predicate (M4-T1) landed together with the call
  list (M2-T7), because the list shows issues, outcomes and review status from the active revision;
  batch upload (M5-T1), retention (M5-T4) and ledger reconcile (M5-T5) landed with the worker because the
  upload dialog and maintenance loop need them. Task IDs are unchanged.
- **Transcripts are their own entity** (`Transcript` → `TranscriptSegment`) referenced by revisions
  instead of belonging to one revision: corrections and retries reuse the same transcript, and the
  retry checkpoint is "an unexpired transcript of the same model version".
- **Upload reservation.** The call row in state `UPLOADING` plus its fingerprint and a `PENDING`
  recording is the reservation; bytes go into `storage_ledger.reservedBytes` with one conditional
  UPDATE; finalize moves them to committed in the transaction that queues the call and inserts the first
  job. `reconcileReservations` (worker) finalizes a reservation whose object exists with the exact size,
  otherwise deletes it and releases the bytes. The cheap fingerprint check runs before ffprobe, so an
  exact re-upload is never probed.
- **Fake inference engine** (`INFERENCE_ENGINE=fake`) is deterministic: the fixture's ID3 comment
  `baztab-fake:<scenario>` picks a scripted Persian call (standard, escalated, multi-issue, insufficient
  evidence, uncategorized, transient failure, invalid output, silence). It is refused in production unless
  `INFERENCE_ALLOW_FAKE_IN_PRODUCTION=true` (synthetic staging only).
- **Invalid model output** is a transient failure: retried with backoff within `WORKER_MAX_ATTEMPTS`,
  then FAILED with `invalid_output` and تلاش دوباره offered. Invented evidence rejects the whole output.
  A score that cites no agent-attributed segment is downgraded to شواهد ناکافی rather than rejected.
- **Eligibility inputs are stored.** `IssueFinding.eligible` and `hasEvidence` are set at publish, so a
  category correction after expiry (evidence rows deleted) still decides eligibility correctly.
- **One report predicate** is a Prisma `IssueFindingWhereInput` (`eligibleFindingWhere`); the drill-down
  filters calls with `findings: { some: <same predicate> }`. Integration tests assert each rank's count
  equals its drill-down rows.
- **Optimistic concurrency for review** is a guarded `UPDATE calls … WHERE activeRevisionId = <seen>` as
  the first statement of the transaction; it also row-locks the call, so of two concurrent corrections
  exactly one wins and the other gets the stale conflict. Confirming a review sets review metadata on the
  active revision; it changes no finding.
- **Real 404s.** The template's catch-all `(app)/loading.tsx` made every page stream, which turns
  `notFound()` into a soft 200. It was removed; the list's skeleton lives in the `calls/(list)` route
  group, so `/calls/[id]` answers a foreign or missing call with HTTP 404 (tech spec §4.6).
- **Expiry hides at read time.** The call detail withholds transcript, evidence, reason text and
  explanations as soon as `expiresAt` passes; the worker's deletion task then removes them. Jobs still
  queued for an expired recording are cancelled.
- **Hand-written SQL** (one-active-job partial index, ledger CHECKs, composite FKs on nullable columns)
  is protected by `npm run lint:migrations`, because Prisma's generated drafts propose dropping it.
- **Egress** is counted in-app (`egress_usage`, per UTC month) for playback and worker fetches, with a
  70 % alert in the logs; provider metrics remain the authority (tech spec §10).
- **Worker bootstrap.** `src/worker/main.ts` sets `PROCESS_ROLE=worker` before importing anything, then
  starts `index.ts`; `--conditions=react-server` makes `server-only` an empty module (plan A7). The bundle
  (`npm run worker:build`, esbuild) keeps packages external.
- **E2E** runs the real dev server and the real worker against `E2E_DATABASE_URL`, with
  `WORKER_BACKOFF_BASE_SECONDS=1`; each run provisions a fresh random organization so fixture uploads
  never collide with earlier runs.
