# Baztab Phase 1 — Implementation Plan

**Status:** Draft for execution · **Date:** 2026-11-26 · **Scope:** Phase 1 (pilot, then launch)

Each task below is written so one agent can execute it without re-reading the specs end to end. Quote
the requirement IDs (P1-01 … P1-07) and tech-spec sections (§4 …) in commits and PRs, as `AGENTS.md`
requires. Before a task, read its rows in `docs/specs/tech-spec.md` and `docs/specs/design-scope.md`
and follow the `AGENTS.md` layering rules.

## 1. Scope and source documents

### Documents used

| Document                                              | Role                                                              | Precedence |
| ----------------------------------------------------- | ----------------------------------------------------------------- | ---------- |
| [docs/specs/tech-spec.md](specs/tech-spec.md)         | Architecture, data model, rules, acceptance (20 Nov 2026)         | 1 (wins)   |
| [docs/specs/product-spec.md](specs/product-spec.md)   | Requirements P1-01 … P1-07, rubric, pilot checks                  | 2          |
| [docs/specs/design-scope.md](specs/design-scope.md)   | Screens, Persian labels, required states, handoff checks          | 2          |
| [docs/specs/design-system.md](specs/design-system.md) | Visual tokens only (brand `#7B38C1`, YekanBakh, radii)            | 3          |
| [docs/PRD.md](PRD.md)                                 | Product reference and roadmap order                               | summary    |
| [docs/decisions/008–011](decisions/README.md)         | Where Baztab departs from the starter (auth, tenancy, queue, ops) | binding    |
| [AGENTS.md](../AGENTS.md), [CLAUDE.md](../CLAUDE.md)  | Layering, security, locale, style, workflow                       | binding    |

All three specs exist and were readable; there is one version of each. The working tree has
uncommitted edits to `AGENTS.md`, `README.md`, `docs/PRD.md` and `docs/specs/README.md`; the
working-tree versions were used. The Persian HTML prototype referenced by `design-scope.md` is **not
in the repository**; the specs say not to build from it where it differs, so it is not needed.

### In scope (Phase 1 MVP)

Organization/membership sign-in with operator-issued initial passwords (P1-07); batch MP3 upload with
date parsing, fingerprint de-duplication and ready-time messaging (P1-01); self-managed transcription
and structured analysis in a separate worker (P1-02, P1-03, P1-05); issue report with drill-down
(P1-04); optional review and corrections as child revisions (P1-06); retention, deletion and storage
budget; tenant isolation; access log; split web / worker / migrate deployment on Darkube + Supabase;
the acceptance suite of tech-spec §12.

### Explicitly deferred (not in this plan)

Automatic phone-system ingestion, live call processing, live coaching, FAQ suggestions, customer
satisfaction analysis, SMS, customer-management UI, customer roles, runtime language switching,
RLS (defence in depth only if later added, tech-spec §4), a message broker, an external AI API, and the
90-day retention switch until funded storage exists (M7-T4 is gated, not part of the pilot).

### Repository facts confirmed by inspection

- Next.js 16 / React 19 / Tailwind 4 / Prisma 6 / Vitest 5 / Playwright; one commit (`929f62b`),
  boilerplate already Persian-configured (`src/lib/locale.ts` → `fa`, RTL, Jalali, `Asia/Tehran`).
- The proxy ([src/proxy.ts](../src/proxy.ts)) matcher **excludes `/api/*`**, so every new route handler
  must authenticate itself.
- The schema ([prisma/schema.prisma](../prisma/schema.prisma)) has only `User`, `Session`, `UserRole`
  and one migration `0001_init`.
- Quality commands that exist: `npm run lint:all`, `npm run test`, `npm run build`, `npm run test:e2e`,
  `npm run db:up|db:migrate|db:deploy|db:seed`, `npm run new:module <name>`.
- The claim in tech-spec §3 of "142 unit tests passing" was **not re-verified** for this plan. M1-T1
  starts by establishing a baseline.

## 2. Boilerplate assessment and reuse decisions

| Area                                     | Existing paths (confirmed)                                                                                                             | Decision                                                                                                                                                                                           |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Layered structure + ESLint boundaries    | `src/{actions,services,components,lib}`, `eslint.config.mjs`, `scripts/rtl-smoke-check.mjs`                                            | **Reuse as-is.** New modules follow `npm run new:module` shape.                                                                                                                                    |
| Locale, `t()`, `format`, `persian`       | `src/lib/{locale,t,format,persian}.ts`, `src/messages/fa.ts`                                                                           | **Reuse.** Add keys per screen; Jalali dates and Persian numerals through `@/lib/format`.                                                                                                          |
| UI kit and shell                         | `src/components/ui/*` (incl. `date-picker.tsx` range picker, `table`, `tabs`, `progress`, `stepper`, `sheet`), `components/layout/*`   | **Reuse; adapt shell.** Sidebar becomes 3 items (گزارش مشکلات, فهرست تماس‌ها, خروج). Audio player, transcript list, score/outcome badges are new components under `components/`.                   |
| Validators                               | `src/lib/validators/iran.ts` (`normalizeMobile`, `isValidMobile`, 10-digit `isValidNationalId`)                                        | **Reuse mobile; do not reuse `isValidNationalId`.** Add an 11-digit organization national-ID validator beside it (tech-spec §3, decision 008).                                                     |
| Action pattern                           | `src/lib/action-result.ts`, `src/lib/errors.ts`, `src/actions/*`                                                                       | **Reuse** (`ActionResult`, `ServiceError`).                                                                                                                                                        |
| Auth service, sessions, cookie           | `src/services/auth.service.ts`, `src/lib/auth.ts`, `src/lib/session-cookie.ts`, `src/types/auth.ts`, `src/proxy.ts`                    | **Adapt heavily.** Keep hashed-token cookie model and `session-cookie.ts`; replace bcrypt → Argon2id, in-memory throttle → Postgres, username → org+mobile, roles removed, idle + absolute expiry. |
| Users module, `ADMIN/USER`, admin routes | `src/app/(app)/admin/**`, `src/actions/user.actions.ts`, `src/services/user.service.ts`, `src/lib/validations/user.ts`, user tests/e2e | **Use as a pattern, then delete** (M1-T9).                                                                                                                                                         |
| Gallery and seed                         | `src/app/(app)/components/page.tsx`, `prisma/seed.ts` (`admin/admin123`)                                                               | **Delete or exclude from production** (M1-T9).                                                                                                                                                     |
| `SKIP_AUTH` mock user                    | `src/lib/auth.ts` `MOCK_USER`, `src/lib/env.ts` guard                                                                                  | **Keep the production guard**, rework the mock to a mock membership (UI-only dev).                                                                                                                 |
| Env validation                           | `src/lib/env.ts` (`server-only`, zod)                                                                                                  | **Adapt:** per-process env (web vs worker), storage, limits, retention, budget. `server-only` throws under plain Node, so the worker needs its own entry (M3-T3).                                  |
| Prisma, migrations, mock, factories      | `prisma/*`, `src/__tests__/helpers/prisma-mock.ts`, `src/__tests__/factories/*`                                                        | **Reuse tooling; replace schema and factories.** Composite tenant FKs are new.                                                                                                                     |
| Date range picker, formatters            | `src/components/ui/date-picker.tsx` (`DateRangePicker`), `date-fns-jalali`                                                             | **Reuse** for report/list range (inclusive Gregorian bounds from Jalali input).                                                                                                                    |
| Health route                             | `src/app/api/health/route.ts`                                                                                                          | **Adapt:** liveness separate from DB/schema readiness (tech-spec §11).                                                                                                                             |
| Docker, compose, entrypoint              | `Dockerfile`, `docker-compose.yml`, `docker-entrypoint.sh` (runs `migrate deploy` at start)                                            | **Adapt and split:** web image gains ffprobe, new worker image, new migrate image; remove migrate from web start for deployed envs (decision 011).                                                 |
| CI                                       | `.github/workflows/ci.yml` (quality, e2e, docker)                                                                                      | **Extend:** worker/migrate image builds, integration tests with storage fake, production-guard checks.                                                                                             |
| Logging                                  | `src/lib/logger.ts` (pino)                                                                                                             | **Reuse;** add redaction rules (filenames, mobile, national ID, tokens) and request/job IDs.                                                                                                       |

### Must be built (no boilerplate equivalent)

Organization/membership auth and operator CLI; Postgres rate limiter; 11-digit national-ID validator;
password policy (printable ASCII, Persian-keyboard detection, common-password list); storage service
(Supabase S3); streaming upload route and ffprobe validation; filename date parser and ready-time
calculator; call, recording, fingerprint, job, revision, finding, score, correction and access-log
models with composite tenant keys; job queue and worker with leases; inference adapters, output
schema and validator; report service with a single eligibility predicate; audio Range route; retention
and deletion tasks; storage budget; worker/migrate images; operator reprocess/delete commands.

## 3. Dependency-ordered milestones and tasks

```
M0 Infrastructure proof (external, parallel)  ──────────────┐ gates M3-T8, M6-T6, M7
M1 Organization sign-in ─► M2 Upload & call record ─► M3-T1…T7 Local workflow (fake adapters) ─► M4 Report & isolation
                                                                   │                          └► M5 Hardening ─► M6 Deployment ─► M7 Acceptance & launch gates
                                                                   └► M3-T8, M3-T9 Real-model path (pilot path; needs M0, D1, D2, D10)
```

**Two tracks.** The _local workflow_ (M3-T1…T7, on the fake adapters) is everything M4, M5 and the first
cut of M6 need. The _real-model path_ (M3-T8, M3-T9, and the real-data steps of M0, M7) is on the
pilot path: it gates the pilot, not the vertical slice. A task never waits for real inference unless
it says so in **Blocked by**.

M1 → M4 is the **vertical slice** of tech-spec §12 step 2: provision two organizations, sign in, upload
and process one MP3, play it back, see it in the report, and demonstrate isolation. M0 runs in
parallel from day one because it needs external accounts and sample recordings, not application code.

Conventions for every task:

- **Path markers:** plain paths exist today; **(new)** paths are proposed.
- **Standard checks** (existing commands): `npm run lint:all`, `npm run test`, `npm run build`. UI tasks
  also run `npm run test:e2e` or exercise the screen with the Playwright MCP. Checks marked
  _(proposed)_ need a script or spec the task itself creates.
- Every new string gets a key in `src/messages/fa.ts`. Every new route is added to `src/lib/navigation.ts`
  when it is a nav item. `docs/PRD.md` is updated in one or two sentences when a task adds a route,
  module or visible behaviour.
- Schema changes ship a migration (`npm run db:migrate -- --name <change>`); never reset the database.
  A migration that warns about data loss stops the task and asks (`AGENTS.md`).

---

### M0 — Infrastructure proof and feasibility gates

**Outcome.** Evidence that the chosen hosts can do the job before application code depends on them.
**Covers.** Tech-spec §2, §7 (feasibility gate), §10, §11, §12 (Infrastructure, Overnight capacity,
step 1). **Depends on.** Owner inputs (see §5: D1–D4, D10). Runs in parallel with M1–M2; **blocks**
M3-T8, M6-T6 and M7. The harness and thresholds (M0-T2) need only synthetic fixtures; nothing touches
real recordings until D10 (written approval of the recordings and the processing environment) is
recorded.
**Completion check.** `docs/decisions/012-infrastructure-proof.md` records: measured per-call wall
time against the approved thresholds, selected inference host/size, the measured export size and
bitrate distribution with the retention days that fit the storage budget, Darkube→Supabase
connectivity result and ingress limits, and the go/no-go for the overnight target.

#### M0-T1 — Synthetic fixtures and probe harness

- **Change.** Generate synthetic MP3s (valid, silent, corrupt, 0-byte, over-limit, odd names such as
  Persian characters, spaces, `2026101912…`, `20261019_x.mp3`) and a script that prints bytes, bitrate
  and duration with ffprobe, plus the size distribution (count, mean, p50, p95, max bytes; bitrate and
  duration percentiles) of a folder.
- **Paths.** (new) `scripts/make-fixtures.mjs`, (new) `e2e/fixtures/` (generated, git-ignored except a
  small checked-in set), (new) `scripts/probe-audio.mjs`.
- **Acceptance.** Running the script produces the fixture set; the probe prints bitrate, duration and
  the size distribution for a supplied folder of real exports. M0-T5 uses the distribution to compute
  how many retention days fit the 800 MB budget (see M2-T5 for the headroom rule). The 1.6 MB-per-call
  average that 800 MB allows at 50 calls/day for 10 days is the number to compare against.
- **Checks.** _(proposed)_ `node scripts/make-fixtures.mjs && node scripts/probe-audio.mjs e2e/fixtures`;
  `npm run lint:all`.
- **Parallel.** Independent of everything; reused by M2-T4, M2-T6, M5-T1, M7-T2.

#### M0-T2 — Evaluation harness and approved thresholds (synthetic data only)

- **Change.** Build the evaluation harness first and prove it on synthetic labeled fixtures: it runs a
  pipeline over a labeled folder and emits WER (agreed Persian normalization), per-issue detection and
  outcome agreement, evidence validity, per-criterion agreement (exact and within ±1), wall time per
  call, peak RAM/VRAM and the unknown-speaker share (tech-spec §8). It also contains the versioned
  rubric anchors and a labeling template. Write `docs/evaluation/thresholds.md` **before any model is
  run on real recordings**, and freeze it (changes need a recorded decision).
- **Proposed starting thresholds** (the numbers are proposals for the support lead and product owner to
  confirm or replace under D8; they are not from the specs):
  - Screening a model on the 10 samples passes only if all hold: published findings have 100% valid
    evidence (enforced by the validator, so any failure is a bug); issue detection recall and precision
    each ≥ 80%; outcome agreement ≥ 75%; each score criterion exact agreement ≥ 70% and within one point
    ≥ 90%; WER reported per call and ≤ 30% on the median call (WER is a screening signal, issue quality
    is the decisive measure); agent-dependent criteria with no agent-attributed evidence are rated
    insufficient evidence.
  - Speed: mean wall time per 3-minute call ≤ 6 min and no call above 10 min at concurrency one. The
    spec's ≈ 7 min mean is the hard ceiling: 50 × 7 = 350 min leaves 10 min inside the 6-hour
    engineering target, so 6 min is proposed to keep real headroom for retries and restarts (the
    deadline itself keeps a further 3 hours of recovery, tech-spec §7).
  - Passing the 10-sample screen supports model selection only; the separate representative set
    required by tech-spec §8 is needed before claiming pilot accuracy.
- **Paths.** (new) `scripts/eval/` (extended, not rewritten, by M3-T9), (new) `docs/evaluation/thresholds.md`,
  (new) `docs/evaluation/rubric-v1.md`, synthetic labeled fixtures beside the M0-T1 set.
- **Acceptance.** The harness run on synthetic fixtures reproduces known metric values (a deliberately
  wrong fake output scores below threshold, a perfect one above); `thresholds.md` is approved and
  dated before M0-T6 starts.
- **Checks.** _(proposed)_ `node scripts/eval/run.mjs --fixtures e2e/fixtures/labeled` exits 0 and writes
  the results table; unit tests for the metric functions under `npm run test`.
- **Depends on.** M0-T1 (fixtures); the fake adapters of M3-T4 are a convenient synthetic subject, but
  the harness can start with a stub pipeline. **Not blocked** by D1–D3.

#### M0-T3 — Disposable web and worker workloads on Darkube

- **Change.** Deploy a throwaway web container and a private worker container; verify DB access through
  Supavisor session mode (TLS with hostname verification), S3 access with access keys against an
  isolated Supabase project, and that no service-role/anon key is needed.
- **Paths.** (new) `docs/ops/infrastructure-proof.md`.
- **Acceptance.** Written log of: Darkube plan limits (CPU/RAM/ephemeral disk/GPU), private worker
  without ingress, egress to Supabase DB and Storage, and the fallback host decision if the worker does
  not fit.
- **Checks.** Manual deployment evidence; `/api/health` returns 200 from Darkube.
- **Blocked by.** D3 (Darkube and Supabase accounts, isolated project).

#### M0-T4 — Ingress, streaming and egress checks

- **Change.** Using M0-T1 fixtures: upload at and over the 10 MiB limit, test request timeout, browser
  Range seeking through the real ingress, forwarded headers/origin handling, TLS renewal, and that
  inference works with external routes disconnected.
- **Acceptance.** Each result recorded with the ingress limit values to use in M2-T6/M2-T8 and M6.
- **Depends on.** M0-T3, M2-T6 and M2-T8 for the real routes (a stub route is enough for the proof).

#### M0-T5 — Record the gate outcome

- **Change.** Write decision record 012 and update the open items in `docs/specs/*`, `docs/PRD.md`
  (inference host, bitrate, retention fit) and the assumptions in §5.
- **Acceptance.** Decision 012 exists and `docs/decisions/README.md` lists it; D2 and D4 are closed or
  re-opened with an owner. It states the retention days that fit the storage budget:
  `floor(800 MB − in-flight headroom) ÷ (daily calls × mean bytes per recording)`, using the M0-T1 size
  distribution (headroom proposed as two concurrent 10 MiB uploads plus 5%). If the result is under 10
  days, lowering retention is an explicit recorded decision, never silent (tech-spec §10).
- **Depends on.** M0-T3, M0-T4, M0-T6.

#### M0-T6 — Real-sample model screening and feasibility gate

- **Change.** Run candidate Persian ASR + analysis model(s) over the 10 supplied recordings, using the
  M0-T2 harness and the frozen thresholds, on infrastructure covered by the D10 approval. CPU first; GPU
  only if quality or runtime needs it. Record the gate verdict: pass, or a recorded choice among a
  bigger host, smaller model, higher concurrency, reduced daily volume or later deadline (tech-spec §7)
  followed by a re-run.
- **Paths.** `docs/evaluation/` (results), `scripts/eval/`.
- **Acceptance.** One results table per candidate against `thresholds.md`; exactly one candidate
  recorded as selected, or "none passed" with the next action; recordings never leave the approved
  environment and no external AI API is called.
- **Checks.** _(proposed)_ the M0-T2 command pointed at the real folder exits 0.
- **Blocked by.** D1 (recordings and labels), D2 (inference host), **D10 (written approval to use the
  recordings and the processing environment)**. Until then M0-T2 and M3 run on synthetic fixtures. Not
  blocking M1–M5.

---

### M1 — Organization sign-in and tenant context (P1-07, tech-spec §4)

**Outcome.** An operator can provision an organization member; the member signs in with national ID,
mobile and initial password, is forced to set a new password, reaches the Persian workspace shell, and
the template users/admin/gallery/seed are gone. **Covers.** P1-07 (sign-in, allowlist, password
rules), tech-spec §4 items 1–6, §3 reuse rows, decisions 008 and 009, design-scope sign-in screen.
**Depends on.** none. M0 may run beside it.
**Completion check.** `npm run lint:all`, `npm run test`, `npm run build` pass; `npm run test:e2e`
covers first sign-in → forced change → later sign-in → sign-out; production build refuses
`SKIP_AUTH`, contains no `/admin/users`, `/components` or seeded credentials.

#### M1-T1 — Baseline, national-ID and password validators _(first task)_

- **Change.** Run the baseline (`npm run lint:all`, `npm run test`, `npm run build`) and note results in
  the PR. Add the 11-digit organization national-ID validator (check digit) and the password policy:
  10–128 chars, printable ASCII only, distinct error codes for Persian/Arabic letters, Persian/Arabic
  digits and other non-ASCII, not equal to national ID or mobile, not on a bundled common-password
  list. Provide a pure "keyboard is Persian" detector for the live UI warning.
- **Reuse.** `normalizeDigits`/`normalizeInput` in `src/lib/persian.ts`, `normalizeMobile` in
  `src/lib/validators/iran.ts`, zod schema style of `src/lib/validations/auth.ts`.
- **Paths.** Existing: `src/lib/validators/iran.ts` (read only), `src/lib/validations/auth.ts`,
  `src/messages/fa.ts`. New: `src/lib/validators/organization.ts`, `src/lib/validations/password.ts`,
  `src/lib/data/common-passwords.ts`, `src/__tests__/validators-organization.test.ts`,
  `src/__tests__/lib/password.test.ts`.
- **Contract.** Identifiers are strings (leading zeros preserved). The national-ID check is the
  legal-entity algorithm (weights 29,27,23,19,17 repeated over the first 10 digits, decimal code =
  ninth digit + 2); verify with published valid/invalid vectors in the test.
- **Acceptance.** Valid 11-digit IDs pass, 10-digit personal codes and wrong check digits fail, a
  leading-zero ID round-trips; each rejected password class returns its own message key; Persian digits
  in identifiers normalize to Latin before validation.
- **Checks.** `npm run test`, `npm run lint:all`.
- **Parallel.** Can run alongside M0-T1 and M1-T2.

#### M1-T2 — Per-process environment and production guards

- **Change.** Extend `env.ts` with session settings (idle 24 h, absolute 7 d, initial-password expiry
  7 d), `APP_ORIGIN`, `REPORT_TIME_ZONE`, and a structure that can load a **web** or **worker** profile
  (worker variables arrive in M3-T3). Keep the `SKIP_AUTH`-in-production refusal; add a test.
  Map `DATABASE_URL_WEB` / `DATABASE_URL_MIGRATE` onto Prisma while falling back to `DATABASE_URL` for
  local work.
- **Paths.** `src/lib/env.ts`, `src/lib/prisma.ts`, `.env.example`, `src/__tests__/lib/` (new env test),
  `prisma.config.ts` (migration URL).
- **Acceptance.** Missing/invalid values fail at boot with a readable message; `NODE_ENV=production`
  with `SKIP_AUTH=true` throws; `.env.example` documents every variable.
- **Checks.** `npm run test`, `npm run build` (needs a syntactically valid `DATABASE_URL`).
- **Depends on.** none.

#### M1-T3 — Schema: organizations, memberships, sessions, rate limits, operator audit

- **Change.** Add `Organization` (unique normalized national ID string, name, active, retention days),
  `Membership` (organization, normalized mobile, credential hash, must-change flag, initial-password
  expiry, activation/revocation; unique organization+mobile), a membership-based session model with
  idle and absolute expiry, `AuthRateLimit` (key, window, count, expiry; indexed on expiry), and
  `OperatorAudit` (operator, action, target, time; no secrets). **Keep the old `User`/`Session` for now**
  (distinct `@@map` names) so the tree stays green until M1-T9.
- **Paths.** `prisma/schema.prisma`; (new) `prisma/migrations/<ts>_organization_auth/`.
- **Data.** Index foreign keys and expiry columns; declare `@@unique([organizationId, id])` on
  tenant-owned parents now so later composite FKs are possible (decision 009).
- **Acceptance.** Migration applies on a fresh DB and on the dev DB without data-loss warnings.
- **Checks.** `npm run db:migrate -- --name organization_auth`, `npm run db:generate`, `npm run build`.
  Use the Prisma MCP to review the schema before running.
- **Depends on.** M1-T1 (field formats).

#### M1-T4 — Auth service: Argon2id, sessions, Postgres rate limits

- **Change.** New membership-based service: verify national ID + mobile + password with a constant-time
  dummy hash for unknown identifiers; generic failure; 5 failures per account and 30 per source per 15
  minutes with increasing delay (Postgres-backed, expiring); issue session (random token, store hash,
  idle 24 h / absolute 7 d); resolve session with a per-request check of membership and organization
  active state; revoke one / all sessions; change-initial-password in one transaction (clear flag,
  invalidate initial credential, revoke other sessions). Expired initial password rejected. Benchmark
  Argon2id cost under peak login load and record the parameters.
- **Reuse.** `hashSessionToken`, session-token pattern, `ServiceError`, `prismaMock` tests from
  `src/services/auth.service.ts` / `src/__tests__/services/auth.service.test.ts`.
- **Paths.** `src/services/auth.service.ts` (rewrite), (new) `src/services/rate-limit.service.ts`,
  `src/types/auth.ts`, `package.json` (add an Argon2id library; see assumption A4), tests under
  `src/__tests__/services/`.
- **Acceptance.** Unit tests cover: success, wrong password, unknown ID (same message and similar
  timing path), inactive membership/organization, throttling per account and per source, expired
  initial password, must-change session can only reach the change step, session idle and absolute
  expiry, revocation blocks the next request.
- **Checks.** `npm run test`, `npm run lint:all`. _(proposed)_ `scripts/bench-argon2.mjs` timing output.
- **Depends on.** M1-T1, M1-T3.

#### M1-T5 — Operator CLI: provision, revoke, reset

- **Change.** `scripts/operator.ts` with `provision` (idempotent: creates org/member, random one-time
  password, prints plaintext once, stores Argon2id hash, sets must-change and expiry), `revoke`
  (member or organization; immediate session block), `reset` (new one-time password, invalidates the old
  password and every session). Every command writes an `OperatorAudit` row without secrets. Uses
  the migration/operator database URL, not the web role.
- **Paths.** (new) `scripts/operator.ts`, `package.json` script `operator` _(proposed)_,
  `src/services/operator.service.ts` (new, framework-free).
- **Acceptance.** Re-running `provision` for an existing pair does not create duplicates or print a new
  password unless `reset` is used; audit rows contain no password or hash; a reset kills active sessions.
- **Checks.** Unit tests with `prismaMock`; _(proposed)_ `npm run operator -- provision …` against local
  Postgres (`npm run db:up`).
- **Depends on.** M1-T4.

#### M1-T6 — Session helpers, tenant context and request guards

- **Change.** `getSession`/`requireAuth` return `{ membershipId, organizationId, mobile, mustChangePassword }`;
  remove `requireAdmin`. A must-change session is redirected to the change-password page by
  `requireAuth` for every other route. Add a shared origin check for cookie-authenticated unsafe
  methods (compare to `APP_ORIGIN`) and a `requireSessionForRoute()` helper that route handlers call
  (proxy does not cover `/api/*`). Cookie flags: HttpOnly, Secure, SameSite=Lax (already in
  `session-cookie.ts`; confirm `Secure` in production).
- **Paths.** `src/lib/auth.ts`, `src/lib/session-cookie.ts`, `src/proxy.ts`, (new) `src/lib/origin.ts`,
  `src/types/auth.ts`, `src/__tests__/lib/auth.test.ts`.
- **Acceptance.** Unit tests: unauthenticated → redirect (pages) / 401 (routes); must-change blocked
  elsewhere; origin mismatch rejected on POST; `SKIP_AUTH` mock is a membership and refused in
  production.
- **Checks.** `npm run test`, `npm run lint:all`.
- **Depends on.** M1-T4.

#### M1-T7 — Sign-in and change-password screens and actions

- **Change.** Replace the login form with **ورود به بازتاب**: national ID, mobile, password; forced
  change flow with **رمز عبور جدید** and **تکرار رمز عبور جدید**; password rules shown beside the field;
  immediate Persian-keyboard message on both password fields; forgotten-password link explaining
  support issues a new initial password; all states listed in design-scope (invalid format, generic
  credentials error, too many attempts, initial password expired, change required, not accepted,
  Persian characters, mismatch, signing in, access failure). Server actions return `ActionResult`.
  Success goes to `/reports/issues` (placeholder until M4; for now `/`).
- **Reuse.** `src/app/(auth)/login/*`, `FormField`, `<Ltr>`, `@/lib/persian`, `useActionState` pattern in
  `src/actions/auth.actions.ts`.
- **Paths.** `src/app/(auth)/login/page.tsx`, `login-form.tsx`, (new) `src/app/(auth)/change-password/*`,
  `src/actions/auth.actions.ts`, `src/lib/validations/auth.ts`, `src/messages/fa.ts`.
- **Acceptance.** Each state above is reachable and shows its Persian message near the field; wording of
  the password rules and forgotten-password text is a draft (assumption A9).
- **Checks.** `npm run lint:all`, e2e (below, M1-T10), Playwright MCP screenshots at desktop and
  mobile widths.
- **Depends on.** M1-T5, M1-T6.

#### M1-T8 — Workspace shell for Baztab

- **Change.** Navigation reduced to **گزارش مشکلات** (`/reports/issues`), **فهرست تماس‌ها** (`/calls`),
  **خروج**; remove admin groups and role badges; header shows organization name. Add placeholder pages
  that call `requireAuth()` so M2/M4 can fill them. Root `/` redirects to `/reports/issues`.
- **Paths.** `src/lib/navigation.ts`, `src/components/layout/{Sidebar,Header,AuthProvider}.tsx`,
  `src/app/(app)/layout.tsx`, `src/app/(app)/page.tsx`, (new) `src/app/(app)/reports/issues/page.tsx`,
  (new) `src/app/(app)/calls/page.tsx`, `src/__tests__/lib/navigation.test.ts`, `src/messages/fa.ts`.
- **Acceptance.** Sidebar order is right-aligned in RTL; active-state works; no `adminOnly` code left
  in navigation.
- **Checks.** `npm run test`, `npm run lint:all` (includes `lint:rtl`).
- **Depends on.** M1-T6. Parallel with M1-T7.

#### M1-T9 — Remove template users, admin, gallery and seed

- **Change.** Delete the Users module (`src/app/(app)/admin/**`, `user.actions.ts`, `user.service.ts`,
  `validations/user.ts`, their tests and e2e), the `/components` gallery from the production build
  (delete, or keep behind a development-only flag), `UserRole`, old `User`/`Session` models (second
  migration), seeded `admin/admin123`, and bcrypt dependencies. Replace `prisma/seed.ts` with a
  development-only seed that provisions two synthetic organizations (used by M4-T6). Update
  `AGENTS.md` (Security, Authorisation, Users rows; layout tree) and `docs/PRD.md` to remove
  _(template)_ markers.
- **Paths.** As listed; `prisma/schema.prisma`, new migration `…_drop_template_users`, `prisma/seed.ts`,
  `package.json`, `AGENTS.md`, `docs/PRD.md`, `e2e/auth.setup.ts`, `e2e/helpers/auth.ts`.
- **Acceptance.** `grep` finds no `requireAdmin`, `UserRole`, `bcryptjs`, `admin123`; production build
  has no `/admin` or `/components` routes.
- **Checks.** `npm run lint:all`, `npm run test`, `npm run build` (route list inspected). **Stop and
  ask** if the drop migration warns about data loss on a non-disposable database.
- **Depends on.** M1-T7, M1-T8.

#### M1-T10 — Auth tests and end-to-end spec

- **Change.** Update unit tests and factories to memberships; e2e specs for provisioning (via the
  operator service or seed), first sign-in with initial password, forced change, wrong credentials
  generic message, expired initial password, Persian password rejection, rate limit, sign-out.
- **Paths.** `src/__tests__/factories/*`, `src/__tests__/actions/auth.actions.test.ts`,
  `e2e/auth.spec.ts`, `e2e/auth.setup.ts`, `e2e/helpers/auth.ts`, `e2e/playwright.config.ts`.
- **Acceptance.** All design-scope handoff check 1 steps pass in e2e.
- **Checks.** `npm run test`, `npm run test:e2e` (needs `npm run db:up`).
- **Depends on.** M1-T9.

---

### M2 — Upload, storage and the call record (P1-01 single file, tech-spec §5, §6)

**Outcome.** A signed-in member uploads one MP3; the call is created with the right date and source,
stored privately, a queued job exists, and the call list and detail show Queued with the expected ready
time; audio plays back through an authorized same-origin endpoint. **Covers.** P1-01, tech-spec §5
(Call, Recording, RecordingFingerprint, ProcessingJob, access log), §6, design-scope screens
**بارگذاری فایل‌های تماس**, **فهرست تماس‌ها**, **جزئیات تماس** (queued/failed states).
**Depends on.** M1.
**Completion check.** E2E: upload a fixture MP3, see it in the list as در صف with the 09:00 message, open
detail, play and seek audio, and re-upload the same file to get a "duplicate skipped" result.

#### M2-T1 — Schema: calls, recordings, fingerprints, jobs, access log

- **Change.** Add `Call` (organization, accepted-at, nullable filename date, effective `DATE`, date
  source enum, original filename, visible state, row version; active revision link added in M3-T1),
  `Recording` (object key, bytes, duration, content type, expiry, storage state),
  `RecordingFingerprint` (unique organization + SHA-256), `ProcessingJob` (operation, attempt, state,
  next run, lease token/expiry, stable error code; partial unique index for one active job per call and
  operation), `AccessLog` (membership, call, action, time), and `StorageLedger` (one project-wide row:
  `committedBytes`, `reservedBytes`, check constraint `committedBytes + reservedBytes >= 0`). Composite
  FKs `(organizationId, callId)` everywhere.
- **Paths.** `prisma/schema.prisma`, (new) migration `…_calls_recordings_jobs`.
- **Data.** Indexes per tech-spec §5: organization/effective date/call ID; job state/next run; recording
  expiry. Partial unique index needs hand-written SQL in the migration (Prisma cannot express it).
- **Acceptance.** Inserting a child with another organization's call ID is rejected by the database.
- **Checks.** `npm run db:migrate`, Prisma MCP schema review, `npm run build`, a service test that asserts
  the FK rejection against a real database _(proposed `npm run test:integration`; see A11)_.
- **Depends on.** M1-T9.

#### M2-T2 — Storage service interface and Supabase S3 adapter

- **Change.** `storage.service` interface (`put` from stream, `getRange`, `delete`, `exists`, `usage`) with
  a Supabase S3 adapter (access keys only) and a local filesystem/in-memory test implementation. Object
  keys `organizationId/callId/original.mp3` only. Add `STORAGE_*` and budget variables to `env.ts`.
- **Paths.** (new) `src/services/storage.service.ts`, (new) `src/services/storage/` adapters,
  `src/lib/env.ts`, `.env.example`, `package.json` (S3 client dependency; assumption A5).
- **Acceptance.** Adapter contract tests pass for both implementations; missing object on `delete` counts
  as success; no key or filename is logged.
- **Checks.** `npm run test`; _(proposed)_ contract suite run against an isolated Supabase project when
  D3 is available.
- **Depends on.** M1-T2. Parallel with M2-T1, M2-T3.

#### M2-T3 — Filename date parser and expected-ready-time calculator

- **Change.** Pure functions: strict leading `YYYYMMDD` (not followed by another digit, valid Gregorian,
  not later than the accepted date in Asia/Tehran, not before a configurable minimum default
  2020-01-01), date source (`FILENAME` / `UPLOAD`), and the operational reporting day plus expected
  ready time (09:00 Tehran the next day; 23:59 belongs to that day, 00:00 to the next).
- **Paths.** (new) `src/lib/call-date.ts`, (new) `src/__tests__/lib/call-date.test.ts`,
  `src/lib/format.ts` (reuse for Jalali display), `src/messages/fa.ts`.
- **Acceptance.** `20261019…` → 2026-10-19 shown as ۱۴۰۵/۰۷/۲۷; `2026101912` does not match; malformed,
  future, too-old and over-long prefixes fall back; any filename is accepted; boundary tests at 23:59:59
  and 00:00:00 Tehran and across month ends.
- **Checks.** `npm run test`, `npm run lint:all`.
- **Depends on.** M1-T2 (time zone config).

#### M2-T4 — Media validation with ffprobe

- **Change.** Controlled ffprobe invocation with timeout and memory/scratch limits; require `.mp3`
  extension, valid MP3 stream, positive duration; reject empty/corrupt/unsupported with stable codes
  (`invalid_media`, `too_large`, …) and localized messages. Install ffmpeg/ffprobe in the web image.
- **Paths.** (new) `src/services/media.service.ts`, `Dockerfile` (apt package), `src/messages/fa.ts`,
  tests with M0-T1 fixtures.
- **Acceptance.** Valid fixture accepted with measured duration; corrupt/empty/non-MP3 renamed to `.mp3`
  rejected; temp files removed on every outcome.
- **Checks.** `npm run test`; _(proposed)_ `docker build` shows ffprobe present.
- **Depends on.** M0-T1.

#### M2-T5 — Call service: reserve, commit, reconcile, budget

- **Change.** Upload orchestration in `call.service.ts`: hash while streaming; reserve by unique
  fingerprint (conflict → existing call or "upload in progress" retry response); account bytes against
  the app-managed budget (800 MB, reject at budget); store object; in one transaction mark the call
  queued and insert the first job; reconcile abandoned reservations after checking the exact stored
  object; delete expired unmatched uploads and release bytes; no job claims an uncommitted upload.
- **Paths.** (new) `src/services/call.service.ts`, `src/services/storage.service.ts`,
  `src/lib/validations/call.ts` (new), tests.
- **Contract.** Result is `{ status: 'accepted'|'duplicate'|'in_progress'|'rejected', callId?, effectiveDate?,
dateSource?, state?, readyAt?, errorCode? }`.
- **Acceptance.** Race of two identical files creates one call; storage failure between reservation and
  finalization leaves a reconcilable state and a safe retry; budget exhausted returns the storage-limit
  code; tenant scope comes from the caller's session only.
- **Checks.** `npm run test` with `prismaMock`; _(proposed)_ integration test against Postgres for the
  race.
- **Depends on.** M2-T1, M2-T2, M2-T3, M2-T4.

> **Quota reservation (replaces the plain "account bytes" step above).** The budget check must be one
> atomic statement, not read-then-write: reserve with
> `UPDATE storage_ledger SET reserved_bytes = reserved_bytes + :n WHERE committed_bytes + reserved_bytes + :n <= :cap`
> and treat zero affected rows as the storage-limit result. Finalization moves the bytes from reserved to
> committed inside the transaction that queues the call; a failed or abandoned upload, an expiry and a
> confirmed deletion release them; a reconcile pass recomputes the ledger from `Recording` rows and
> provider usage. The ledger is one project-wide row because the 1 GB Free allowance is per Supabase
> project, not per organization.
>
> **Added acceptance.** Against a real PostgreSQL (the `test:integration` script of A11): with the cap set so
> only one of two **different** files fits, concurrent uploads yield exactly one accepted and one
> storage-limit result; ten parallel uploads near the cap never push `committed + reserved` above the cap;
> a storage failure after reservation releases the bytes; the identical-file race still creates one call.

#### M2-T6 — `POST /api/calls/uploads` streaming route

- **Change.** Route handler (Node runtime) that authenticates itself, checks origin, streams one
  multipart MP3 to scratch (size cap 10 MiB, time cap), calls the call service and returns the contract
  of tech-spec §9. Read `node_modules/next/dist/docs/` on route handlers and request bodies first.
- **Paths.** (new) `src/app/api/calls/uploads/route.ts`, `src/lib/origin.ts`, `package.json` (multipart
  parser, assumption A6), `next.config.ts` only if body limits require it.
- **Acceptance.** 401 without session; 403 on bad origin; oversize and non-MP3 rejected with codes;
  response carries ready time; no filename in logs.
- **Checks.** `npm run test`; _(proposed)_ route test with a fixture; `npm run build`.
- **Depends on.** M2-T5, M1-T6.

#### M2-T7 — Call list, call detail and upload UI (queued/failed)

- **Change.** `/calls` lists the organization's calls (call ID short reference, Jalali date with
  **تاریخ بارگذاری** when date source is upload, filename, state badge) with empty and error states;
  an upload dialog/panel on `/calls` with file picker, selected-file count and per-file result
  (single-file in this task); `/calls/[id]` shows state and the expected-ready-time message for queued
  and processing, and the failed state with reason. Missing/foreign call ID → generic 404. Back
  navigation restores list context (query params).
- **Reuse.** `Table`, `Badge`, `Progress`, `Dialog`, `format` helpers; pattern of the Users page
  (server page → service → client island).
- **Paths.** `src/app/(app)/calls/page.tsx`, (new) `src/app/(app)/calls/[id]/page.tsx`,
  (new) `src/app/(app)/calls/upload-panel.tsx`, `src/components/` (state badge, ready-time notice),
  `src/services/call.service.ts`, `src/messages/fa.ts`.
- **Acceptance.** Design-scope states: empty library, loading, error, upload in progress, duplicate
  skipped, rejected file, storage limit reached; message like «نتایج تا ساعت ۹ صبح فردا، ۱۴۰۵/۰۷/۲۸،
  آماده می‌شود».
- **Checks.** `npm run lint:all`, `npm run test:e2e` _(new spec `e2e/upload.spec.ts`)_, Playwright MCP at
  desktop and mobile widths.
- **Depends on.** M2-T6, M1-T8.

#### M2-T8 — `GET /api/calls/:id/audio` and player

- **Change.** Authenticated same-origin Range endpoint: 200/206/416, `Cache-Control: private, no-store`,
  per-request check of session, organization and expiry, access-log entry per playback session,
  no storage URL exposed. Player component with seek-to-timestamp API (used in M3-T7).
- **Paths.** (new) `src/app/api/calls/[id]/audio/route.ts`, (new) `src/components/AudioPlayer.tsx`,
  `src/services/call.service.ts`, `src/services/storage.service.ts`.
- **Acceptance.** Range requests return correct slices; foreign/missing call → 404; expired → localized
  unavailable state on detail; browser seeking works (verify behind the real ingress in M0-T4).
- **Checks.** `npm run test`; Playwright MCP seeking check; _(proposed)_ route test with Range headers.
- **Depends on.** M2-T5, M2-T7.

---

### M3 — Queue, worker and analysis (P1-02, P1-03, P1-05, tech-spec §7, §8)

**Outcome.** A queued call is claimed by a separate worker, transcribed and analyzed with the pluggable
inference adapter, published atomically as a revision, and the call detail shows findings, outcomes,
scores and a transcript with timestamp seeking. **Covers.** P1-02, P1-03, P1-05, §7, §8, decision 010,
design-scope call detail. **Depends on.** M2.
**Local-workflow completion check (T1–T7, fake adapters; this is what M4, M5 and M6 need).** Upload →
worker run → Ready with transcript, findings, scores; invalid model output is rejected; a killed
worker's job is reclaimed; `no_usable_speech` fails permanently.
**Real-model completion check (T8–T9, pilot path).** The same run on a real sample with the selected
model, plus the harness result against the frozen thresholds. T8 and T9 do not block M4 or M5.

#### M3-T1 — Schema: analysis revisions, findings, scores, evidence

- **Change.** Add `TranscriptSegment`, `AnalysisRevision`, `IssueCategory` (stable tenant-scoped IDs,
  taxonomy version), `IssueFinding` (category nullable, outcome enum, **stored `eligible`**, optional
  explanation), `Score` (criterion enum, rating 0/1/2 or insufficient), `Evidence` (segment refs),
  `CorrectionAudit` (structured values only), active-revision pointer on `Call`. Composite tenant keys,
  indexes for organization/category/revision drill-down.
- **Paths.** `prisma/schema.prisma`, (new) migration `…_analysis_revisions`.
- **Acceptance.** Eligibility is stored at publish (tech-spec §9) so deleting evidence later does not
  change counts.
- **Checks.** `npm run db:migrate`, `npm run build`, Prisma MCP review.
- **Depends on.** M2-T1.

#### M3-T2 — Queue service: claim, lease, fence, backoff

- **Change.** `FOR UPDATE SKIP LOCKED` claim in a short transaction (raw SQL through Prisma); unique lease
  token, renewal, reclaim of expired leases, stale-writer fencing by job ID and lease token, exponential
  backoff for transient errors, permanent failure with stable error codes, retry that converges on one
  active job.
- **Paths.** (new) `src/services/queue.service.ts`, tests.
- **Acceptance.** Two concurrent claimers never get the same job; an expired lease is reclaimed; a stale
  worker's publish is rejected; duplicate retries yield one job.
- **Checks.** `npm run test` (mock) and _(proposed)_ integration test on real Postgres for locking.
- **Depends on.** M2-T1. Parallel with M3-T1, M3-T4.

#### M3-T3 — Worker entrypoint, env profile and build

- **Change.** `src/worker/` entrypoint with concurrency one, heartbeat, graceful shutdown (stop claiming,
  finish within grace or leave for reclaim) and its own env schema (`DATABASE_URL_WORKER`, storage,
  model settings). Solve the `server-only` import (services import `@/lib/env`): bundle the worker with
  an alias for `server-only` or run with the `react-server` condition (assumption A7). Scripts for
  local run.
- **Paths.** (new) `src/worker/index.ts`, `src/lib/env.ts` (profile split), `package.json` scripts
  `worker:dev` / `worker:build` _(proposed)_, `eslint.config.mjs` (worker obeys the services layering).
- **Acceptance.** `npm run worker:dev` starts, claims a queued job, logs job/request IDs without call
  content, exits cleanly on SIGTERM.
- **Checks.** `npm run lint:all` (layering), `npm run build`, _(proposed)_ local worker run against
  `npm run db:up`.
- **Depends on.** M3-T2.

#### M3-T4 — Inference interfaces, output schema and validator, fake adapters

- **Change.** `Transcriber` and `Analyzer` interfaces; zod output schema (reason, distinct issues,
  per-issue outcome, evidence segment IDs, three score criteria with insufficient-evidence option);
  validator for schema, enum values, segment ownership and time bounds; deterministic fake adapters for
  tests and local demo; rule that agent-behavior criteria need agent-attributed evidence or are rated
  insufficient; transcripts treated as untrusted data (no tools or network in the analysis step).
- **Paths.** (new) `src/services/inference/{types,validate,fake}.ts`, (new) `src/lib/validations/analysis.ts`,
  tests under `src/__tests__/services/`.
- **Acceptance.** Invalid or invented evidence is rejected; retry within the attempt budget is possible;
  rubric labels match the specs (درک مشکل / اطلاعات یا اقدام درست / پایان روشن تماس).
- **Checks.** `npm run test`, `npm run lint:all`.
- **Depends on.** M1-T1 (zod conventions). Parallel with M3-T2.

#### M3-T5 — Issue taxonomy v0 and category mapping

- **Change.** Versioned category set with stable IDs per organization (seeded on organization
  provisioning), mapping from model output to category ID, uncategorized findings kept but not eligible.
  Draft categories only; the support-approved taxonomy replaces them before the pilot (D5).
- **Paths.** (new) `src/services/taxonomy.service.ts`, (new) `src/lib/data/taxonomy-v0.ts`,
  `src/services/operator.service.ts` (seed on provision), tests.
- **Acceptance.** Unmapped finding is stored with null category and `eligible = false`.
- **Checks.** `npm run test`.
- **Depends on.** M3-T1.

#### M3-T6 — Pipeline: process job and publish revision

- **Change.** Job handler: fetch audio once per job into bounded scratch, transcribe, checkpoint the
  transcript (reuse only for the same model version), analyze, validate, then publish revision, findings
  (with stored eligibility), scores and job completion **in one transaction fenced by lease token**.
  `no_usable_speech` fails permanently and is excluded from the analyzed-call total. Refuse to publish
  if the recording expired during processing. Retry preserves call ID, recording, fingerprint and
  accepted timestamp.
- **Paths.** (new) `src/services/analysis.service.ts`, `src/worker/index.ts`, tests.
- **Acceptance.** Reports (M4) see either the previous or the complete new revision; killing the worker
  mid-job followed by reclaim publishes once.
- **Checks.** `npm run test`; _(proposed)_ local end-to-end run with fake adapters.
- **Depends on.** M3-T2, M3-T3, M3-T4, M3-T5, M2-T8 (storage reads).

#### M3-T7 — Call detail: findings, scores, transcript, seek

- **Change.** **یافته‌های تماس** (reason, issues, per-issue outcome with explanation and evidence link),
  **امتیاز تماس با هوش مصنوعی** (three ratings, **شواهد ناکافی**, total out of ۶ or **ناقص**),
  **متن و فایل صوتی** (transcript with timestamps and speaker labels, **نامشخص** for unknown; click a
  timestamp to highlight the segment and seek audio). Outcome and closing score are visually distinct
  (handoff check 4). Missing-evidence state. Transcript view writes an access-log entry. Desktop
  side-by-side, mobile stacked.
- **Paths.** `src/app/(app)/calls/[id]/page.tsx`, (new) `src/components/{FindingsPanel,ScorePanel,TranscriptPanel}.tsx`,
  `src/components/AudioPlayer.tsx`, `src/services/call.service.ts`, `src/messages/fa.ts`.
- **Acceptance.** All Ready/Failed/no-usable-speech/missing-evidence states render; an escalated call
  shows **حل‌نشده** with a full closing score; totals follow the six-point rule.
- **Checks.** `npm run lint:all`, `npm run test:e2e` _(new spec)_, Playwright MCP screenshots (desktop
  and mobile).
- **Depends on.** M3-T6, M2-T8.

#### M3-T8 — Real Persian transcription and analysis adapters

- **Change.** Implement the adapters for the model/host chosen in M0 with pinned model artifacts
  (checksum, license, runtime, version), pinned prompts and schema, and no external network calls.
  Record model/prompt/rubric/taxonomy versions on each revision.
- **Paths.** (new) `src/services/inference/<engine>.ts`, `src/worker/index.ts`, `package.json`,
  `.env.example`.
- **Acceptance.** Real sample produces a valid published revision with the network routes to external
  AI APIs disabled.
- **Checks.** _(proposed)_ the M0-T2 harness (extended by M3-T9) on the 10 samples, judged against
  `docs/evaluation/thresholds.md`.
- **Blocked by.** D1, D2, D10, M0-T6. **Depends on.** M3-T6, M3-T9. Pilot path; does not block M4, M5.

#### M3-T9 — Connect the evaluation harness to the real pipeline

- **Change.** The harness itself is built in M0-T2. This task adds the adapter that drives the real
  worker pipeline (selected model, pinned prompts) through the harness, so the same metrics and the
  frozen thresholds judge the real adapters, and stores each result with the revision's model, prompt,
  rubric and taxonomy versions.
- **Paths.** `scripts/eval/` (extend), `docs/evaluation/`.
- **Acceptance.** Running it on the fake adapters reproduces the M0-T2 synthetic results; running it on
  the real adapters writes a results table against `thresholds.md`.
- **Checks.** _(proposed)_ the M0-T2 command with the pipeline flag set to `real`.
- **Depends on.** M0-T2, M3-T4, M3-T6. Verification of M3-T8 uses it; real-data runs also need D10.

---

### M4 — Issue report, call list filters and tenant isolation (P1-04, P1-07 isolation)

**Outcome.** The landing page ranks issues for a Jalali date range; each rank opens the call list
filtered to the same calls; two organizations (including the same mobile) cannot see each other's data
anywhere. **Covers.** P1-04, tech-spec §9 report consistency, §12 P1-04 and P1-07 isolation, design-scope
**گزارش مشکلات** and **فهرست تماس‌ها**. **Depends on.** M3-T1…T7 (the local workflow on fake
adapters), specifically M3-T6 for the report and M3-T7 for the call detail. It does **not** wait for
M3-T8 or M3-T9.
**Completion check.** E2E "vertical slice": provision two orgs → sign in → upload → worker → report →
drill-down → isolation checks. Unit tests prove report and drill-down use one predicate.

#### M4-T1 — Report service with one eligibility predicate

- **Change.** `report.service.ts`: analyzed-call total (ready calls in range, including calls with zero
  reportable categories, excluding `no_usable_speech`), ranks by distinct eligible calls per category
  with deterministic tie-breaking, drill-down filter per rank. A single exported predicate (tenant,
  active revision, date bounds, eligibility) is used by both report and call list.
- **Paths.** (new) `src/services/report.service.ts`, `src/services/call.service.ts`,
  `src/__tests__/services/report.service.test.ts`.
- **Acceptance.** Multi-issue call counts once per category; Unknown outcomes counted; uncategorized and
  no-evidence findings excluded; total includes ready calls without issues; boundaries inclusive.
- **Checks.** `npm run test`; _(proposed)_ `EXPLAIN` on 90-day volume seed.
- **Depends on.** M3-T6.

#### M4-T2 — Call list: cursor paging, search, filters

- **Change.** Cursor paging in service and table together (stable ordering by effective date + call ID);
  search by short call ID (Persian or Latin digits), filename or issue; filters for processing state,
  issue and inclusive date bounds; removable active-issue chip; no-match, empty, loading and error
  states; optional review status column.
- **Paths.** `src/services/call.service.ts`, `src/app/(app)/calls/page.tsx`, (new)
  `src/app/(app)/calls/call-table.tsx`, `src/components/ui/pagination.tsx` (reuse), `src/messages/fa.ts`.
- **Acceptance.** Count shown for a rank equals rows in its drill-down; filters survive back navigation.
- **Checks.** `npm run lint:all`, `npm run test`, e2e.
- **Depends on.** M4-T1. Parallel with M4-T3.

#### M4-T3 — Issue report page

- **Change.** `/reports/issues` with Jalali `DateRangePicker` (default range decided in A10), **تماس‌های
  تحلیل‌شده** and **گروه‌های مشکل**, ranked list linking to `/calls?issue=…&from=…&to=…`, report generation
  time, states (data, no analyzed calls, analyzed calls with no reportable issue, loading,
  unavailable). Sign-in lands here.
- **Paths.** `src/app/(app)/reports/issues/page.tsx`, (new) `report-view.tsx`, `src/components/ui/date-picker.tsx`
  (reuse), `src/lib/navigation.ts`, `src/messages/fa.ts`.
- **Acceptance.** Jalali range converts to inclusive Gregorian bounds; month boundaries correct.
- **Checks.** `npm run lint:all`, e2e, Playwright MCP screenshots.
- **Depends on.** M4-T1.

#### M4-T4 — Thin API handlers for the logical contracts

- **Change.** `GET /api/calls`, `GET /api/calls/:id`, `GET /api/reports/issues` as thin session-guarded
  handlers over the same services (assumption A8), `Cache-Control: private, no-store`.
- **Paths.** (new) `src/app/api/calls/route.ts`, `src/app/api/calls/[id]/route.ts`,
  `src/app/api/reports/issues/route.ts`.
- **Acceptance.** Responses match tech-spec §9 field lists (date source, expected ready time,
  availability of audio/transcript and removal date, rank filters); generic 404 for foreign IDs.
- **Checks.** `npm run test`, `npm run build`.
- **Depends on.** M4-T1, M4-T2.

#### M4-T5 — Two-organization isolation suite

- **Change.** Dev seed of two organizations sharing one mobile; service tests asserting every read/write
  filters by session organization; e2e that org B cannot open org A's call, audio, API responses, list,
  or report; composite-FK rejection test.
- **Paths.** `prisma/seed.ts`, `src/__tests__/services/*`, (new) `e2e/isolation.spec.ts`.
- **Acceptance.** Foreign records are indistinguishable from missing ones (404).
- **Checks.** `npm run test`, `npm run test:e2e`.
- **Depends on.** M4-T3, M4-T4.

---

### M5 — Hardening: batch, retry, review, lifecycle (P1-01, P1-06, tech-spec §5, §7, §10)

**Outcome.** Uploads work in batches, failed calls can be retried, members can optionally confirm or
correct findings, and recordings and derived text expire on schedule while counts remain. **Covers.**
P1-01 batch/retry, P1-06, P1-05 expiry behaviour, tech-spec §4 (access log, offboarding), §10.
**Depends on.** M4. Tasks T1–T3 can run in parallel with T4–T6.
**Completion check.** Matching rows of tech-spec §12 for P1-01, P1-06 and Lifecycle pass.

#### M5-T1 — Batch upload

- **Change.** Multi-select up to 50 files, bounded concurrency (2), per-file accepted / duplicate /
  rejected results, selected-count text, in-progress state, submission failure, storage-limit-paused
  state; new records appear in the list on completion.
- **Paths.** `src/app/(app)/calls/upload-panel.tsx`, `src/messages/fa.ts`, `e2e/upload.spec.ts`.
- **Acceptance.** Mixed batch (valid, corrupt, duplicate, Persian filename, no date prefix) gives the
  right result per file; no-date and Persian names raise no warning.
- **Checks.** `npm run test:e2e` using M0-T1 fixtures.
- **Depends on.** M2-T7.

#### M5-T2 — Retry failed processing

- **Change.** **تلاش دوباره** server action for recoverable failures while the recording is retained;
  concurrent submissions return the same job; `no_usable_speech` shows reason with no retry. Retry keeps
  call ID, recording, fingerprint and timestamps.
- **Paths.** `src/actions/call.actions.ts` (new), `src/services/call.service.ts`, `src/services/queue.service.ts`,
  call detail page.
- **Acceptance.** Double-click creates one job; no duplicate call is created.
- **Checks.** `npm run test`, e2e.
- **Depends on.** M3-T6, M3-T7.

#### M5-T3 — Optional review and corrections

- **Change.** **تأیید بازبینی** and **ویرایش یافته‌ها و امتیازها**: server action requiring the active
  revision version; stale revision → conflict message and reload; correction creates a child revision
  (reason `correction`), copies unchanged values, flags human-set fields, writes `CorrectionAudit`
  with structured values only, all in one transaction; reports update after commit. Corrections work
  after expiry without evidence. Review status shown separately from processing status.
- **Paths.** `src/actions/review.actions.ts` (new), `src/services/review.service.ts` (new),
  `src/lib/validations/review.ts` (new), call detail page, `src/messages/fa.ts`.
- **Acceptance.** Concurrent edit detected; report count changes; history lists who/what/when; ready
  calls never require review.
- **Checks.** `npm run test`, e2e.
- **Depends on.** M4-T3.

#### M5-T4 — Retention, expiry authorization and deletion task

- **Change.** `retentionDays` per organization from config (pilot 10); expiry computed from accepted
  time; every read (audio, transcript, evidence, explanations) checks expiry; idempotent worker
  maintenance task deletes object, transcript segments, excerpts, scratch data, fingerprint,
  explanations and evidence references, with retried failures and release of budget only after
  confirmed deletion; in-flight worker cannot republish after expiry; detail page shows the removal
  date before expiry and the Persian expiry notice after.
- **Paths.** `src/services/retention.service.ts` (new), `src/worker/index.ts`, `src/services/call.service.ts`,
  `src/lib/env.ts`, call detail page.
- **Acceptance.** Historical counts unchanged after expiry; filename and access log kept; re-upload of
  an expired file creates a new call.
- **Checks.** `npm run test`; _(proposed)_ time-travel integration test.
- **Depends on.** M3-T6.

#### M5-T5 — Storage budget and egress alerts

- **Change.** App-managed 800 MB budget counting committed and in-flight objects, reconcile against
  provider usage, 70% alert and 100% upload stop with localized message; egress tracking with 70% alert.
- **Paths.** `src/services/storage.service.ts`, `src/services/call.service.ts`, `src/worker/index.ts`,
  `src/lib/logger.ts`.
- **Acceptance.** Cap enforced through the atomic ledger reservation of M2-T5 (this task adds the
  reconcile pass and alerts, not a second check); the ledger is released only after a confirmed
  deletion; alerts logged without customer data; reconcile repairs a deliberately corrupted ledger.
- **Checks.** `npm run test`; _(proposed)_ `test:integration` reconcile case.
- **Depends on.** M2-T5, M5-T4.

#### M5-T6 — Operator reprocess and delete-organization commands

- **Change.** `reprocess` creates a new revision, activates it only when the active revision has no
  human-set fields, otherwise stores a candidate that an audited command activates or discards;
  `delete-org` removes the organization's records, results and objects; both audited without secrets.
  `delete-org` is a two-phase, resumable command: phase 1 sets `Organization.state = DELETING`, revokes
  every session and membership and cancels pending jobs in one transaction; phase 2 deletes objects
  from the stored manifest, then the database rows, then releases the ledger bytes, and finishes
  with state `DELETED`. Adds the `state` column and a migration.
- **Paths.** `scripts/operator.ts`, `src/services/operator.service.ts`, `src/services/queue.service.ts`,
  `prisma/schema.prisma` (+ migration), tests.
- **Acceptance (reprocess).** Reprocessing never overrides human-set fields without the explicit command.
- **Acceptance (delete-org).**
  - After phase 1, every existing session of that organization is rejected on its next request (pages,
    API, audio), new sign-ins fail, and uploads are refused.
  - An in-flight job cannot publish: the fenced publish transaction and the job claim both check the
    organization state, so a worker that finishes after phase 1 writes nothing; pending jobs are cancelled.
  - A partial object-storage failure (inject failures on some deletes) leaves the organization in
    `DELETING` with its database rows and manifest intact, exits non-zero, and re-running the command
    completes the deletion; a missing object counts as already deleted; the ledger is released only for
    confirmed deletions.
  - A second organization's calls, objects, sessions and ledger share are untouched.
  - The audit row exists and contains no secrets, filenames or call content.
- **Checks.** `npm run test`; _(proposed)_ `test:integration` cases for the publish fence and for the
  injected storage failure plus re-run; CLI run against local DB.
- **Depends on.** M5-T3, M5-T4, M5-T5, M2-T2, M3-T2.

---

### M6 — Deployment and operations (tech-spec §11, decision 011)

**Outcome.** Three versioned images, a staging deployment on Darkube + Supabase, health/readiness,
operations signals, and a documented release and rollback path. **Depends on.** M3 for the worker;
M0-T3 for the real environment; M5 for the full feature set.
**Completion check.** Staging runs the same images that will be promoted: login → upload → worker
completion → report → playback works, a rolling restart and image rollback succeed.

#### M6-T1 — Worker image

- **Change.** Separate Dockerfile with pinned runtime, ffmpeg/ffprobe, approved models (or controlled
  fetch), bounded ephemeral storage, explicit entrypoint, non-root.
- **Paths.** (new) `Dockerfile.worker`, `docker-compose.yml` (worker service for local), CI.
- **Acceptance.** Container starts, claims a job in compose, logs no call content.
- **Checks.** _(proposed)_ `docker build -f Dockerfile.worker .`, compose run.
- **Blocked by.** D2. **Depends on.** M3-T8 (or M3-T6 with fake adapters for a first cut).

#### M6-T2 — Web and migrate images; remove migrations from web start

- **Change.** `docker-entrypoint.sh` stops running `migrate deploy` for deployed environments; new
  migrate image/task with `DATABASE_URL_MIGRATE`; web image keeps standalone output, non-root, port
  3000, includes ffprobe.
- **Paths.** `Dockerfile`, `docker-entrypoint.sh`, (new) `Dockerfile.migrate`, `docker-compose.yml`,
  `.github/workflows/ci.yml`.
- **Acceptance.** Web starts without migration credentials; migrate image applies migrations once.
- **Checks.** `docker build`, compose smoke, CI docker job.
- **Depends on.** M1-T9.

#### M6-T3 — Database roles, grants and secrets contract

- **Change.** SQL for least-privileged web and worker roles (no ownership, no BYPASSRLS) and a separate
  migration role; private schemas outside the Data API; connection pool sizes (web ≤ 3, worker ≤ 2);
  document env/secrets per workload; prove the service-role and anon keys are absent.
- **Paths.** (new) `docs/ops/database-roles.sql`, `.env.example`, `src/lib/env.ts`.
- **Acceptance.** Web role cannot run DDL; worker role cannot read other workloads' secrets; all runtime
  settings validated at boot.
- **Checks.** _(proposed)_ role test script against local Postgres.
- **Depends on.** M1-T2, M6-T2.

#### M6-T4 — Health, readiness, heartbeat and operational signals

- **Change.** Process-only liveness separate from DB/schema readiness; worker heartbeat; structured
  log fields for queue depth, oldest job age, lease expiries, stage latency, failures, storage/egress,
  failed deletions; deadline-risk signal; logger redaction of filenames, mobiles, national IDs,
  tokens.
- **Paths.** `src/app/api/health/route.ts`, (new) `src/app/api/health/live/route.ts`, `src/lib/logger.ts`,
  `src/worker/index.ts`, `e2e/health.spec.ts`.
- **Acceptance.** Readiness fails when schema is behind; logs contain no call content.
- **Checks.** `npm run test`, `npm run test:e2e`.
- **Depends on.** M3-T3.

#### M6-T5 — CI extension

- **Change.** CI builds web/worker/migrate images, runs unit and integration tests, checks that the
  production build rejects `SKIP_AUTH` and contains no template routes or default credentials, and
  scans images.
- **Paths.** `.github/workflows/ci.yml`, `package.json` scripts.
- **Acceptance.** Failing guard fails the pipeline.
- **Checks.** CI run.
- **Depends on.** M6-T1, M6-T2.

#### M6-T6 — Staging deployment and release runbook

- **Change.** Deploy to Darkube staging with immutable tags and recorded digests; verify HTTPS, forwarded
  headers, origin handling, probes, rolling restart, image rollback; runbook for pausing uploads,
  draining the worker, restoring services and retrying affected calls; confirm the bundled font's
  redistribution terms.
- **Paths.** (new) `docs/ops/release-runbook.md`, `public/` font files.
- **Acceptance.** Staging passes the Infrastructure and resilience row of tech-spec §12.
- **Checks.** Manual evidence in the runbook.
- **Blocked by.** D3, D6. **Depends on.** M6-T5.

#### M6-T7 — Backup and restore rehearsal

- **Change.** Approve backup policy (proposed 24 h RPO, restore within one business day, copies ≤ 7
  days), encrypted logical backups, object manifest reconciliation, restore into an isolated
  environment that does not revive revoked memberships or sessions or expired data; rehearse Supabase
  pause/unpause.
- **Paths.** (new) `docs/ops/backup-restore.md`, operator scripts.
- **Acceptance.** Successful restore log; expired data absent after restore.
- **Checks.** Manual rehearsal evidence.
- **Blocked by.** D3, D7. **Depends on.** M6-T6.

---

### M7 — Acceptance and launch gates (tech-spec §12)

**Outcome.** Every acceptance row of tech-spec §12 has an automated or recorded manual result and the
pilot/launch preconditions are checked. **Depends on.** M5, M6.
**Completion check.** `docs/acceptance-report.md` lists each §12 row with evidence and any open gap.

#### M7-T1 — Automated acceptance suite

- **Change.** Fill gaps so each §12 row maps to a spec: P1-01 (race, storage failure, pre/post-midnight
  ready times), P1-02/03 (invalid output, unknown speaker, offline inference), P1-04 (counts, empty,
  Jalali, malformed filename dates, month boundaries), P1-05 (each rating, insufficient, escalated),
  P1-06 (stale edit, child revision, operator reprocess), P1-07 (two orgs same mobile, initial
  password, expiry, reset, non-ASCII, session expiry, origin, rate limits, access log, redaction),
  Lifecycle and quotas.
- **Paths.** `src/__tests__/**`, `e2e/**`, (new) `docs/acceptance-report.md`.
- **Acceptance.** Mapping table in the report has no empty cell.
- **Checks.** `npm run lint:all`, `npm run test:coverage`, `npm run test:e2e`.
- **Depends on.** M5.

#### M7-T2 — Overnight capacity benchmark

- **Change.** Run the 10 representative samples through the selected model, then 50 call-equivalents
  on staging with a midnight burst, at least two injected transient failures that must retry, at least
  one worker restart mid-job, and one injected `no_usable_speech` file. Record completion time, quality,
  hardware use and egress.
- **Paths.** (new) `scripts/load/`, `docs/evaluation/`.
- **Pass/fail (proposed; the owners confirm under D8 before the run).** The run is timed from the last
  upload commit of the burst. Pass requires all of:
  - at least 49 of the 50 valid call-equivalents reach Ready within 6 hours (the engineering target; the
    hard deadline leaves 3 more hours), counting every failed, stuck or late call as **not completed**;
    a fast failure never counts toward the total, and the injected `no_usable_speech` file is the only
    exclusion;
  - zero duplicate calls, zero stale-lease publishes, zero calls stuck in Processing after the run;
  - the speed and quality thresholds of `docs/evaluation/thresholds.md` hold on the batch (mean ≤ 6 min
    per call, quality at or above the screening thresholds on the labeled subset);
  - the restart and retry cases finish without operator action.
- **Pilot-blocking outcomes.** Fewer than 49 completions in 6 hours, any threshold miss, any duplicate
  or stale publish, or a cross-organization leak seen during the run. A blocked run triggers one of the
  tech-spec §7 options (larger host, smaller model, higher concurrency, reduced volume, later deadline)
  and a full re-run; no pilot with customer data until a run passes.
- **Acceptance.** The result table states pass/fail for each criterion above; failures are listed
  separately from completions.
- **Checks.** _(proposed)_ load script run on staging, output archived in `docs/evaluation/`.
- **Blocked by.** D1, D2, D10. **Depends on.** M6-T6, M0-T6.

#### M7-T3 — Pilot readiness checklist

- **Change.** Confirm with owners: hosting and data permissions, quality thresholds approved and frozen
  (M0-T2), backup and deletion policy, 10-day retention fits the measured size distribution
  (decision 012), customer legal basis and caller notice, support-approved taxonomy loaded, rubric
  validated with the support lead, M7-T2 passed, quota race and organization-deletion tests green.
- **Paths.** (new) `docs/pilot-checklist.md`.
- **Acceptance.** Each item has an owner and a date or an explicit waiver. Waivers are not allowed for:
  M7-T2 pass, isolation tests, evidence validity, and the legal-basis confirmation.
- **Blocked by.** D4, D5, D8. **Depends on.** M7-T1, M7-T2, M6-T7.

#### M7-T4 — Launch: retention to 90 days _(gated)_

- **Change.** After a funded storage plan: set retention to 90 days, re-verify quota headroom,
  overnight processing, isolation, recovery and rollback before opening full-volume uploads.
- **Paths.** Configuration only, `docs/PRD.md`.
- **Blocked by.** D9. **Depends on.** M7-T3.

---

## 4. Requirements-to-task mapping

| Requirement                                          | Tasks                                                                               |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------- |
| P1-01 upload, status, duplicates, date, ready time   | M2-T1, M2-T3, M2-T4, M2-T5, M2-T6, M2-T7, M5-T1, M5-T2, M7-T1                       |
| P1-02 transcription with timestamps and speakers     | M3-T4, M3-T6, M3-T7, M3-T8                                                          |
| P1-03 reason, issues, outcomes, evidence             | M3-T1, M3-T4, M3-T5, M3-T6, M3-T7                                                   |
| P1-04 issue report and drill-down                    | M4-T1, M4-T2, M4-T3, M4-T4                                                          |
| P1-05 AI call scoring                                | M3-T1, M3-T4, M3-T6, M3-T7, M5-T4 (expiry behaviour)                                |
| P1-06 human review and history                       | M5-T3, M5-T6                                                                        |
| P1-07 access, sign-in, isolation, privacy, retention | M1-T1…M1-T10, M2-T8 (access log), M4-T5, M5-T4, M5-T6, M6-T3, M6-T4                 |
| Tech-spec §4 auth and organization access            | M1-T1…M1-T10, M2-T8, M3-T7 (access log), M5-T6 (offboarding)                        |
| §5 data model and invariants                         | M1-T3, M2-T1, M3-T1, M4-T5                                                          |
| §6 upload, dates, media                              | M2-T2, M2-T3, M2-T4, M2-T5, M2-T6, M2-T8                                            |
| §7 worker lifecycle and overnight target             | M0-T2, M0-T6, M3-T2, M3-T3, M3-T6, M7-T2                                            |
| §8 AI and evaluation                                 | M0-T2, M0-T6, M3-T4, M3-T5, M3-T8, M3-T9                                            |
| §9 interfaces and report consistency                 | M2-T6, M2-T8, M4-T1, M4-T4                                                          |
| §10 retention, capacity, availability                | M5-T4, M5-T5, M6-T7, M7-T4                                                          |
| §11 Docker, Darkube, Supabase                        | M0-T3, M0-T4, M6-T1…M6-T6                                                           |
| §12 acceptance and release criteria                  | M7-T1, M7-T2, M7-T3, M7-T4                                                          |
| Design-scope: sign-in screen and states              | M1-T7                                                                               |
| Design-scope: report, call list, upload, detail      | M2-T7, M3-T7, M4-T2, M4-T3, M5-T1                                                   |
| Design handoff checks 1–6                            | 1: M1-T10 · 2: M5-T1/M5-T2 · 3: M4-T2/M4-T3 · 4: M3-T7 · 5: M5-T3 · 6: M3-T7, M5-T4 |

**Tasks that exist only as implementation dependencies:** M1-T2 (env), M1-T3 (schema), M1-T9
(template removal required by decision 008 and tech-spec §3), M2-T2 (storage interface), M3-T2/T3
(queue/worker), M6-T2/T5 (release split, CI), M0-T1 (fixtures for §12 tests).

Review of the mapping: every P1 requirement and every tech-spec section 4–12 has at least one task; no
task lacks a spec row or a dependency role. Tech-spec §1–§3 are decisions and boilerplate guidance,
covered by §2 of this plan, M1-T9 and M6-T2.

## 5. Assumptions, conflicts and open decisions

### Spec conflicts: all resolved

Every conflict below is settled in the source documents, not only here. Where the resolution changes
code that does not exist yet, the document states the target and names the plan task that delivers it.

| ID  | Conflict                                                                                                                                                                                             | Resolution                                                                                                    | Tasks           |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | --------------- |
| C1  | `AGENTS.md` still says bcrypt 12 rounds, in-memory login throttle, `ADMIN/USER`, `/components` gallery; tech-spec §4 and decisions 008/009 say Argon2id, Postgres limits, no roles, gallery excluded | Tech spec wins (as `AGENTS.md` and `specs/README.md` state). `AGENTS.md` is updated when M1 lands.            | M1-T4, M1-T9    |
| C2  | Tech-spec §9 lists `GET /api/calls`-style endpoints while `AGENTS.md` says pages read through services and mutations are server actions                                                              | Both: pages use services; thin GET handlers expose the logical contracts (A8). Mutations stay server actions. | M4-T4           |
| C3  | `src/proxy.ts` matcher skips `/api/*`, but tech-spec §4.5 says revocation must block API and playback                                                                                                | Each route handler authenticates itself via a shared helper.                                                  | M1-T6, M2-T6/T8 |
| C4  | `DATABASE_URL` (boilerplate, Prisma schema) vs `DATABASE_URL_WEB/WORKER/MIGRATE` (tech-spec §11)                                                                                                     | Env layer maps the role-specific URL onto Prisma; plain `DATABASE_URL` stays valid locally.                   | M1-T2, M6-T3    |
| C5  | `server-only` in `src/lib/env.ts` throws under plain Node, but the worker reuses services (decision 010)                                                                                             | Worker gets its own env profile and a bundling alias or `react-server` condition (A7).                        | M3-T3           |
| C6  | Design scope says sign-in opens **گزارش مشکلات**; PRD calls `/reports/issues` the landing page; boilerplate home is `/`                                                                              | `/` redirects to `/reports/issues`.                                                                           | M1-T8           |
| C7  | Tech-spec §10 deletes evidence references and explanations at expiry, yet reports count by eligible findings                                                                                         | `eligible` is stored at publish (tech-spec §9) and never recomputed.                                          | M3-T1, M3-T6    |
| C8  | Tech-spec §3 says the Persian prototype was not updated; design scope references it                                                                                                                  | Ignored; specs and `design-scope.md` labels are used.                                                         | all UI tasks    |
| C9  | Tech-spec §12 step order puts the infrastructure proof first; it needs external inputs                                                                                                               | Run it as a parallel track (M0); application work starts with M1 and does not wait.                           | M0, M1          |

**Where each resolution is recorded:** C1 and C3 to C5 in `AGENTS.md` (Security bullets, and new rows in
"Baztab against this table"); C2, C6 and C7 in `AGENTS.md` rows and in `docs/PRD.md` (landing route, stored
`eligible` flag); C8 in `docs/specs/README.md` (prototype not used); C9 in the `docs/PRD.md` roadmap
(infrastructure proof runs in parallel). The tech spec is unchanged because every resolution follows it.

### Assumptions (easy to reverse)

| ID  | Assumption                                                                                                                                                                                                     | Affects             |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| A1  | Operator CLI output is English; only the member-facing UI is Persian.                                                                                                                                          | M1-T5               |
| A2  | Initial-password expiry 7 days, session 24 h idle / 7 d absolute, rate limits 5/30 per 15 min, upload limits 50 files / 2 concurrent / 10 MiB: spec "proposed" values taken as defaults and made configurable. | M1-T2, M1-T4, M5-T1 |
| A3  | Minimum filename date default 2020-01-01, configurable.                                                                                                                                                        | M2-T3               |
| A4  | Argon2id library: a prebuilt-binary package (for example `@node-rs/argon2`) compatible with the Debian-slim image; confirm in the worker and web images before merging.                                        | M1-T4, M6-T1/T2     |
| A5  | S3 client: AWS SDK v3 `@aws-sdk/client-s3` against the Supabase S3 endpoint; verify Range support in M0-T3.                                                                                                    | M2-T2               |
| A6  | Multipart parsing with a streaming parser (for example `busboy`) rather than `request.formData()`, to honour the scratch-space and streaming rules; confirm against the bundled Next docs.                     | M2-T6               |
| A7  | The worker is bundled (esbuild or tsx build) with `server-only` aliased to an empty module; `tsx` is already a dev dependency.                                                                                 | M3-T3               |
| A8  | Thin GET API handlers sit over the same services; they add no new business logic.                                                                                                                              | M4-T4               |
| A9  | Persian wording for password rules and forgotten-password text is drafted by the implementer and reviewed later (open in `design-scope.md`).                                                                   | M1-T7               |
| A10 | Default report range is the most recent 30 days in Jalali, adjustable by the picker.                                                                                                                           | M4-T3               |
| A11 | A small `test:integration` script runs service tests against the local Docker Postgres for locking, composite FKs and races, because `prismaMock` cannot prove them.                                           | M2-T1, M2-T5, M3-T2 |
| A12 | Until D5 resolves, issue taxonomy v0 uses draft categories seeded per organization.                                                                                                                            | M3-T5               |
| A13 | The storage ledger is one project-wide row (the Supabase allowance is per project); organizations share the 800 MB budget.                                                                                     | M2-T1, M2-T5, M5-T5 |
| A14 | The numeric quality and speed thresholds in M0-T2 and the pass/fail rule in M7-T2 are proposals, not spec values; they become binding only when the owners approve them (D8).                                  | M0-T2, M0-T6, M7-T2 |

### Open decisions and blockers

A blocker only stops the listed tasks; everything else proceeds.

| ID  | Decision / input needed                                                                                                                      | Blocks (hard)                          | Does not block                 |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | ------------------------------ |
| D1  | The 10 supplied sample recordings and labels, plus real phone-export samples for bitrate                                                     | M0-T6, M3-T8, M3-T9 (real data), M7-T2 | M1, M2, M3-T1…T7               |
| D2  | Inference host and size (CPU/GPU), model choice, passing the §7 feasibility gate                                                             | M3-T8, M6-T1, M7-T2                    | Fake-adapter work in M3        |
| D3  | Darkube and Supabase accounts, an isolated Supabase project, registry, domain                                                                | M0-T3, M0-T4, M6-T6, M6-T7             | All local development          |
| D4  | Data locations, backup location, production retention for structured results, backup policy approval                                         | M6-T7, M7-T3                           | Feature work                   |
| D5  | Support-approved issue taxonomy and validated rubric anchors with the support lead                                                           | M7-T3 (real pilot)                     | M3-T5 uses draft v0 (A12)      |
| D6  | Redistribution terms of the bundled YekanBakh font                                                                                           | M6-T6 (shipping)                       | Development                    |
| D7  | Recovery point/time targets (proposed 24 h / one business day)                                                                               | M6-T7                                  | Feature work                   |
| D8  | Customer legal basis for recordings, caller notice; approval of the quality and overnight pass/fail thresholds (proposed in M0-T2 and M7-T2) | M0-T6 (thresholds only), M7-T2, M7-T3  | Everything before pilot        |
| D10 | Written approval to use the 10 sample recordings and to process them in a named environment (data location, who may access)                  | M0-T6, M3-T8, M3-T9 (real data), M7-T2 | Harness and all synthetic work |
| D9  | Funded storage plan for 90-day retention                                                                                                     | M7-T4                                  | Pilot at 10 days               |

No decision blocks M1 or the vertical slice up to M3-T7; only real-inference work and deployment are
gated on D1–D3.

## 6. First task that can start immediately

**M1-T1 — Baseline, national-ID and password validators.**

Prerequisites (all already satisfied in this checkout):

- `node_modules` is installed and Node `>=22` is on the PATH.
- Read `AGENTS.md` and `docs/specs/tech-spec.md` §3, §4 and §12 (P1-07), and
  `docs/decisions/008-organization-membership-auth.md`.
- First step of the task: run `npm run lint:all`, `npm run test`, `npm run build` and record any
  failures that predate the work; do not fix unrelated failures, report them.

M0-T1 (fixtures) and M1-T2 (environment) can start at the same time because they touch different files.
M0-T2 (harness and thresholds) also needs no external input, only M0-T1, so it can follow immediately.
Real-data work (M0-T6) waits for D1, D2 and D10; infrastructure work (M0-T3, M0-T4) waits for D3. Those
inputs are the owners' to supply and are not agent tasks.
