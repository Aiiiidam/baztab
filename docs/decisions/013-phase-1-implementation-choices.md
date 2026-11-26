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
