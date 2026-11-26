# Baztab (بازتاب) — Product Reference

**Last updated:** 2026-11-26

> The single source of truth for what the product is. Agents read it before making product
> decisions and update it when a change is product-visible (new module, route, behaviour, data
> model). Keep it a reference, not a changelog. Full detail lives in `docs/specs/`
> ([index](specs/README.md)); when this file and the technical specification disagree, the
> technical specification wins.

## What it is

Baztab helps the product team of a B2B digital signature product find the problems customers report
most often. An organization member uploads Persian MP3 call recordings exported from the phone
system; self-managed AI transcribes each call, extracts why the customer called, which issues they
hit and how each issue ended (Resolved / Unresolved / Unknown), and scores how the support agent
handled the call on a three-criterion rubric. Baztab groups similar issues and ranks them by the
number of distinct calls, and every count, finding and score links back to timestamped transcript
and audio evidence. Uploads accepted before midnight Tehran time are ready by 09:00 Asia/Tehran the
next morning.

## Users

Phase 1 has **no roles**. Every user is an operator-allowlisted **member** of one **organization**
workspace and can do every task:

- **Support team member** — exports recordings from the phone system, uploads them, checks processing status.
- **Support manager / quality reviewer** — explores the issue report, inspects calls, optionally confirms or corrects findings and scores.
- **Operator** (internal, not a UI user) — provisions and revokes organizations and members, issues one-time initial passwords out of band, runs reprocessing and deletion commands.

Members sign in with **organization national ID (شناسه ملی سازمان, 11 digits) + mobile + password**.
Data is isolated per organization; scope always comes from the session.

Operators work through `npm run operator -- provision | reset | revoke | revoke-org`; each command
is audited without secrets. The starter's username accounts, roles, `/admin/users`, `/components`
gallery and seeded admin were removed (decision [008](decisions/008-organization-membership-auth.md)).

## Locale

One locale profile (`src/lib/locale.ts`): Persian, RTL, Jalali calendar, Persian numerals, `Asia/Tehran`, toman.
Call dates are stored as Gregorian `DATE` and displayed in Jalali (filename prefix `20261019` → **۱۴۰۵/۰۷/۲۷**).
Persian and Latin digits are accepted in identifiers, mobile numbers and call-ID search; passwords are printable ASCII only.

## Modules & routes

<!-- Add a line per module or route as it lands. Keep it to what exists today. -->

What exists today:

| Route              | Who                 | What                                                                                                              |
| ------------------ | ------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `/login`           | everyone            | ورود به بازتاب: national ID + mobile + password, Persian-keyboard warning, forgotten-password help                |
| `/change-password` | must-change session | Forced replacement of the operator-issued initial password; every other route redirects here until it is replaced |
| `/`                | member              | Redirects to `/reports/issues`                                                                                    |
| `/reports/issues`  | member              | گزارش مشکلات (landing page)                                                                                       |
| `/calls`           | member              | فهرست تماس‌ها                                                                                                     |
| `/api/health`      | ops                 | Readiness probe (database check), no auth                                                                         |

Planned for Phase 1 (see `docs/specs/design-scope.md` for screens and states; paths are proposals):

| Screen / endpoint                                                  | What                                                                                                                                   |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| ورود به بازتاب (`/login`)                                          | National ID + mobile + password; forced change of the operator-issued initial password; Persian-keyboard warning on password fields    |
| گزارش مشکلات (`/reports/issues`, landing page; `/` redirects here) | Analyzed-call total and issue groups ranked by distinct eligible calls for a Jalali date range; each rank opens the filtered call list |
| فهرست تماس‌ها (`/calls`)                                           | Search by call ID / filename / issue, filter by state, issue and date; removable issue filter; تاریخ بارگذاری label for fallback dates |
| بارگذاری فایل‌های تماس (from `/calls`)                             | Batch MP3 upload (≤ 50 files, ≤ 10 MiB each), per-file accepted / duplicate / rejected result, expected ready time                     |
| جزئیات تماس (`/calls/[id]`)                                        | Findings, AI scores, transcript + audio with timestamp seeking, retry, optional review, expiry notice                                  |
| `POST /api/calls/uploads`                                          | Streaming multipart upload of one MP3                                                                                                  |
| `GET /api/calls`, `GET /api/calls/:id`                             | Cursor-paged search; call detail with date source, state, expected ready time, audio/transcript availability                           |
| `GET /api/calls/:id/audio`                                         | Session-authorized same-origin Range playback (200/206/416), `private, no-store`                                                       |
| `GET /api/reports/issues`                                          | Report data for date bounds with drill-down filters                                                                                    |

Sidebar (right side): **گزارش مشکلات**, **فهرست تماس‌ها**, **خروج**.

## Behaviour worth knowing

- **Processing states:** در صف (Queued) → در حال پردازش (Processing) → آماده (Ready) or ناموفق (Failed). Queued and Processing show the expected ready time: 09:00 Tehran on the day after the call's operational reporting day (Tehran local time of acceptance).
- **Upload:** the filename never causes a rejection. A strict leading `YYYYMMDD` (not followed by another digit, not in the future, not before 2020-01-01) sets the call date; otherwise the upload date is used and labeled **تاریخ بارگذاری**. Exact duplicates (SHA-256 per organization) are skipped. Retrying a failure keeps the same call.
- **No usable speech** (silence, music, another language) fails permanently with no retry and is excluded from the analyzed-call total.
- **Outcomes** are per issue: حل‌شده / حل‌نشده / نامشخص. Escalated or handed-off issues are حل‌نشده.
- **Scores:** درک مشکل, اطلاعات یا اقدام درست, پایان روشن تماس; each برآورده شد (۲) / تا حدی برآورده شد (۱) / برآورده نشد (۰) or شواهد ناکافی. Total out of ۶ only when all three are assessed, otherwise ناقص. Scores are independent of the outcome.
- **Report:** a finding is eligible when it has ≥ 1 validated evidence segment and a mapped category, whatever its outcome. Each call counts once per eligible category; a call can count under several. The total includes ready calls with no reportable issue. Report and drill-down share one predicate, tenant scope and inclusive date bounds. Review is optional and never gates inclusion; a correction updates counts after commit.
- **Corrections** never edit a published revision: they create a child revision (reason `correction`), flag human-set fields and write a structured audit (who, field, old, new, when).
- **Retention:** audio, transcript, explanations and evidence are removed after the configured number of days (pilot **10**, target 90 after a storage upgrade). Categories, outcomes, ratings, the original filename and the access log remain; historical counts do not change. Call detail shows the removal date before expiry.
- **Storage budget:** 800 MB app-managed budget on Supabase Free; alert at 70 %, pause uploads at 100 % with a clear message.

- **Sign-in:** an operator reset or revoke ends every session of the member at once; revoking an organization ends all of its sessions. Sessions expire after 24 h idle or 7 days absolute. An initial password expires after 7 days and cannot be chosen again as the new password.

## Data model

<!-- One line per model. Point to prisma/schema.prisma for fields. -->

Today (`prisma/schema.prisma`; opaque IDs, UTC instants, tenant-consistent composite keys):

- `Organization` — unique normalized national ID (string, leading zeros kept), name, active, retention days
- `Membership` — organization, normalized mobile (unique per organization), Argon2id hash, must-change flag, initial-password expiry, activation/revocation
- `MemberSession` — membership (composite tenant FK), token hash, idle (24 h) and absolute (7 d) expiry
- `AuthRateLimit` — hashed account/source key, failure count, window, expiry
- `OperatorAudit` — operator, action, target IDs, structured detail (no secrets)

Planned (tech spec §5):

- `Call` — organization, accepted-at, nullable filename date, effective date, date source, original filename (restricted), state, active revision, row version
- `Recording` — call, generated object key, bytes, duration, content type, expiry, storage state
- `RecordingFingerprint` — organization + SHA-256 (unique), owning call; deleted at expiry
- `ProcessingJob` — call, operation, attempt, state, next run, lease token/expiry, error code; one active job per call and operation
- `TranscriptSegment` — revision, index, start/end ms, speaker (agent / customer / unknown), Persian text
- `AnalysisRevision` — call, version, reason (initial / retry / reprocess / correction), parent, schema/model/prompt/rubric/taxonomy versions, status
- `IssueCategory`, `IssueFinding` — stable tenant-scoped categories; finding with category, outcome, stored `eligible` flag (set at publish, never recomputed), explanation, evidence refs
- `Score`, `Evidence` — one rating per criterion per revision, explanation, validated segment refs
- `CorrectionAudit` — source/result revision, actor, field, previous/new structured value, time
- Access log and operator audit — playback and transcript views; provisioning actions (no secrets)

## Server actions

| Action                 | Auth                | Description                                                         |
| ---------------------- | ------------------- | ------------------------------------------------------------------- |
| `signInAction`         | none                | Validate identifiers and password, throttle, open a session         |
| `changePasswordAction` | must-change session | Replace the initial password, clear the flag, revoke other sessions |
| `logoutAction`         | member              | Revoke the current session                                          |

## Non-functional

<!-- Only what has actually been decided. -->

- **Privacy:** customer audio and transcripts are never sent to an external AI API; inference is self-managed. Recordings and transcripts protected in transit and at rest. Filenames, call content, credentials and customer identifiers never appear in logs, object keys or telemetry.
- **Auth:** allowlisted memberships only; Argon2id; passwords 10–128 printable ASCII, not equal to the national ID or mobile, not on a common-password list; rate limits kept in PostgreSQL (5 failures/account and 30/source per 15 min, increasing delay); HttpOnly + Secure + SameSite=Lax cookie; origin check on unsafe methods; generic 404 for foreign records. `SKIP_AUTH` is refused in production.
- **Processing:** one durable PostgreSQL queue (`SKIP LOCKED`, leases, fenced writes), one private worker at concurrency one; atomic revision publish. Feasibility gate: ≈ 7 min or less per 3-minute call on the chosen host.
- **Infrastructure:** web and worker as Docker images on Hamravesh Darkube; PostgreSQL and a private bucket on Supabase Free (S3 keys only, never service-role/anon keys; Supavisor session mode). Migrations run as a separate release step, not on web start-up.
- **Security headers:** HSTS, frame-deny, nosniff, referrer policy, permissions policy.
- **Quality gate:** lint + typecheck + unit + build + e2e + Docker build in CI on every push.

## Roadmap

Phase 1, in the order of tech spec §12 ("Implementation order"):

1. **Infrastructure proof** (runs in parallel with the vertical-slice work; it needs external accounts and samples, not application code) — disposable web + private worker on Darkube; Darkube → Supabase database/storage access; Range streaming; isolated inference run on synthetic audio; per-call feasibility gate; measure the real export bitrate.
2. **Vertical slice** —
   1. Organization/membership auth replacing the template users (operator CLI, initial password, forced change, national-ID validator, Postgres rate limits), and removal of `/admin/users`, `/components` and seeded credentials from production (decision 008).
   2. Tenant scoping (decision 009).
   3. Single-file upload → storage → queue → worker → published revision (decisions 010, 011).
   4. Call detail with playback and the issue report; two-organization isolation demo.
3. **Hardening** — batch upload, retry, optional review and corrections, retention and deletion task, storage budget, access log, report/drill-down consistency, acceptance suite (tech spec §12).
4. **Pilot** — hosting/data permissions, benchmark thresholds, encrypted backups and deletion policy, 10-day retention confirmed against measured bitrate, customer legal basis for recordings.
5. **Launch** — funded storage for 90-day retention at full volume.

Open (from the specs): inference host and size; data and backup locations; production retention for
structured results; pilot quality thresholds; scoring rubric validation with the support lead; final
Persian wording of password rules and the forgotten-password message; redistribution terms of the
bundled YekanBakh font. Later phases: automatic phone-system ingestion, live coaching, FAQ
suggestions, customer satisfaction analysis.
