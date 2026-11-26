# AGENTS.md — baztab

Rules for any coding agent (Claude Code, Cursor, Codex, Copilot) working in this repository.
`CLAUDE.md` adds the Claude-specific workflow and tooling on top of this file.

## What this is

Baztab (بازتاب): a Persian web application that turns uploaded support-call recordings into ranked
customer issues and agent scores, with timestamped evidence. Built on Next.js 16 (App Router),
React 19, Tailwind CSS 4, Prisma 6 and PostgreSQL, plus a separate analysis worker. One language:
Persian / RTL / Jalali. Cookie sessions, no external auth provider.

- `docs/PRD.md` describes the product; read it before making product decisions.
- `docs/specs/` holds the full Phase 1 specifications. `tech-spec.md` wins over `product-spec.md` and
  `design-scope.md` when they differ; `design-system.md` holds the visual tokens. Quote requirement
  IDs (P1-01 … P1-07) and tech-spec sections (§4, §5 …) in commits and PRs.
- `docs/decisions/` records why the big choices were made; 008–011 are where Baztab departs from the
  starter's defaults.

Framework docs matching the installed Next.js version are bundled at
`node_modules/next/dist/docs/`. Prefer them over training data.

## What ships, what does not

Match a spec against this table before designing. "Not included" means it does not exist here in
any generic form; the last column says where it would go so the layering stays intact.

| Area          | Included                                                                                                                                                                                                                                                                                                                                                        | Not included → where it would go                                                                                                                                              |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auth          | Organization national ID + mobile + password (decision 008): operator-issued Argon2id initial password, forced change, httpOnly cookie sessions with hashed tokens and 24 h idle / 7 d absolute expiry (`@/lib/auth`, `auth.service.ts`), PostgreSQL sign-in throttle (`rate-limit.service.ts`), operator CLI (`npm run operator`), `SKIP_AUTH` for UI-only dev | OAuth / SSO / OTP / SMS, self-service password reset, "remember me" → `auth.service.ts` plus a provider service under `services/`                                             |
| Authorisation | No roles (decision 009): every member can do every task; `requireAuth()` returns the member and its organization, `authenticateRoute()` guards route handlers (session, origin, forced change)                                                                                                                                                                  | Roles or permissions → an enum on `Membership`, a `requireRole()` in `@/lib/auth`, checks in services                                                                         |
| Members       | Operator CLI only: `provision` (idempotent), `reset`, `revoke`, `revoke-org`, each audited in `OperatorAudit` without secrets                                                                                                                                                                                                                                   | Customer-management UI, self-registration, profile page → out of Phase 1 scope (tech spec §1)                                                                                 |
| Data          | Prisma 6 + PostgreSQL, committed migrations, seed, `prismaMock` and factories for unit tests, `ServiceError` for expected failures                                                                                                                                                                                                                              | Soft delete, audit log, multi-tenancy, full-text search, transactions helpers → schema + services per module; nothing generic exists                                          |
| UI            | Local shadcn kit behind one barrel, app shell (sidebar, header, theme toggle, Toaster), forms via `react-hook-form` + `FormField`, `<Ltr>`                                                                                                                                                                                                                      | Server-side data tables (paging, sorting, filtering), charts, rich text, file pickers, drag and drop → a component under `components/ui/`, exported from the barrel           |
| Locale        | One profile: language, direction, calendar, numerals, time zone, currency; `t()` / `tp()` dictionary; `@/lib/format` for numbers, dates, currency, relative time                                                                                                                                                                                                | Runtime language switching, per-user locale, translation management → out of scope by design (decision 003)                                                                   |
| Files, email  | —                                                                                                                                                                                                                                                                                                                                                               | Upload / storage, email, SMS, push → one service per provider under `services/`, keys through `env.ts`, called from actions or route handlers, never from components          |
| Background    | —                                                                                                                                                                                                                                                                                                                                                               | Cron, queues, scheduled jobs, inbound webhooks → route handler under `app/api/` (inbound) or an external scheduler calling one (outbound); long work stays out of the request |
| API           | `/api/health`; all mutations are server actions returning `ActionResult`                                                                                                                                                                                                                                                                                        | REST / GraphQL for external clients, API keys, CORS → route handlers under `app/api/` with their own auth (sessions are cookie-only)                                          |
| Public pages  | `/login` only (`PUBLIC_ROUTES` in `src/proxy.ts`)                                                                                                                                                                                                                                                                                                               | Landing / marketing / public content → a route group outside `(app)` and its path added to `PUBLIC_ROUTES`                                                                    |
| Ops           | Docker image + compose, CI (lint, unit, build, e2e, image), Renovate, pino logging, security headers, health probe                                                                                                                                                                                                                                              | Error tracking, metrics, feature flags → `@/lib/logger` is the seam; config through `env.ts`                                                                                  |
| Persian       | `@/lib/persian` input normalisation, `@/lib/validators/iran` (personal national ID, mobile, SHEBA, card, postal code), `@/lib/validators/organization` (11-digit organization national ID), Persian digits and Jalali dates through the profile                                                                                                                 | —                                                                                                                                                                             |

### Baztab against this table

The Phase 1 specs need these gaps filled. Each row says where the work goes; the decision record
explains any rule it changes. Build them in the PRD's roadmap order.

| Need (spec)                                                                    | Where it goes                                                                                                                                                   |
| ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Organization + membership sign-in, initial password, forced change (§4, P1-07) | `Organization` / `Membership` models replace `User`; `auth.service.ts` + `@/lib/auth`; Argon2id; Postgres rate-limit table; operator CLI under `scripts/` (008) |
| Organization national ID (11 digits + check digit)                             | New validator beside `@/lib/validators/iran`; do not reuse the 10-digit personal-code check                                                                     |
| Tenant isolation, no roles (§4.6, §5)                                          | `organizationId` on every tenant table, composite FKs, scope from the session in every service query; `requireAdmin()` leaves product code (009)                |
| MP3 upload, fingerprint, filename date (§6, P1-01)                             | Streaming route handler `app/api/calls/uploads/route.ts` → `call.service.ts`; storage behind a `storage.service.ts` interface (Supabase S3); ffprobe validation |
| Audio playback (§6)                                                            | `app/api/calls/[id]/audio/route.ts`, Range 200/206/416, `private, no-store`, access-log entry                                                                   |
| Queue, worker, AI pipeline (§7, §8, P1-02, P1-03, P1-05)                       | `ProcessingJob` table; worker entrypoint (proposed `src/worker/`) using `services/`; inference adapter behind an interface; schema-validated output (010)       |
| Revisions, review, corrections (§5, P1-06)                                     | `AnalysisRevision` + `CorrectionAudit`; correction is a server action with optimistic concurrency on the active revision                                        |
| Issue report and drill-down (§9, P1-04)                                        | `report.service.ts` with one eligibility predicate shared by report and call list; Jalali range via the existing date-range picker                              |
| Paged, searchable call list                                                    | Cursor paging in the service and table together; see the UI row above                                                                                           |
| Retention, deletion, storage budget (§10)                                      | Worker maintenance task + config in `env.ts`; authorization checks expiry on every read                                                                         |
| Separate web / worker / migrate releases, Darkube + Supabase (§11)             | Second Dockerfile for the worker; migrations leave web start-up; new env vars validated in `env.ts` (011)                                                       |
| Role-specific database URLs (§11)                                              | `env.ts` maps `DATABASE_URL_WEB` / `_WORKER` / `_MIGRATE` onto Prisma per process; plain `DATABASE_URL` stays valid for local work                              |
| Worker reuses services (010)                                                   | Worker has its own env profile; `server-only` is aliased to an empty module when the worker is bundled, because it throws under plain Node                      |
| Logical API reads (§9)                                                         | Pages read through services; `GET /api/calls`, `/api/calls/:id`, `/api/reports/issues` are thin handlers over the same services, with no extra business logic   |
| Landing page                                                                   | `/` redirects to `/reports/issues`; sign-in success opens it                                                                                                    |
| Stored eligibility (§9)                                                        | `IssueFinding.eligible` is written at publish and never recomputed, so expiry cannot change historical counts                                                   |

## Layout of the code

```
src/
  app/
    layout.tsx        Document shell only: html/body, font, theme, DirectionProvider, Toaster
    (auth)/           Bare pages (no app chrome): login/, change-password/
    (app)/            Authenticated area: layout.tsx runs requireAuth() and renders the shell
    api/health/       Readiness probe, excluded from auth
  actions/            Server actions: authorise → validate (zod) → call a service → revalidate
  services/           Business logic. Framework-free: no next/*, no React, no cookies
  components/
    ui/               Locally owned shadcn components (RTL mode); the only place UI primitives are imported
    UiComponents.tsx  Barrel: the single UI import surface for app code
    layout/           App shell: Sidebar, Header, Logo, providers
  lib/
    locale.ts         Locale profile (lang, dir, calendar, numerals, tz, currency) — source of truth
    t.ts              t() / tp() message lookup; strings live in src/messages/
    format.ts         Intl formatting: numbers, currency, dates, relative time, lists, plural, sort
    persian.ts        Input normalisation (digits, Arabic/Persian characters)
    validators/       Iranian identifiers (national ID, mobile, SHEBA, card, postal code)
    validations/      zod schemas per module, shared by server and client
    env.ts            Validated environment (server-only)
    auth.ts           getSession / requireAuth / authenticateRoute (server-only)
    action-result.ts  ActionResult<T>, ok(), fail(), fromZodError(), fromError()
    errors.ts         ServiceError
    navigation.ts     Single nav config for sidebar and header title
    prisma.ts, logger.ts, session-cookie.ts, preferences.ts, app-config.ts, theme.ts, utils.ts
  messages/           User-facing strings: index.ts exports the project's one dictionary
  types/              Shared TypeScript types
  __tests__/          Vitest unit tests (mirrors src/) + factories + prisma mock
prisma/               schema.prisma, migrations/, seed.ts; prisma.config.ts at the root
e2e/                  Playwright config and specs (locators read copy through t())
scripts/              operator.ts (CLI), new-module.mjs scaffold, rtl-smoke-check.mjs, bench-argon2.mjs
.claude/              Claude Code settings and vendored skills (committed on purpose)
```

**The reference module is Auth**: `lib/validations/{auth,password}.ts` → `services/auth.service.ts` →
`actions/auth.actions.ts` → `app/(auth)/*` → unit tests under `src/__tests__/`, integration tests
under `src/__tests__/integration/` and `e2e/auth.spec.ts`. `npm run new:module <name>` scaffolds a
new module in the same shape.

## Layering (enforced by ESLint)

| Layer                                       | May import                                               | Must not import                                                                |
| ------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `components/**`, client islands in `app/**` | `@/components`, `@/lib` (non-server), `@/actions`, types | `@/lib/prisma`, `@/services/*`, `@prisma/client` values, UI primitive packages |
| `app/**/page.tsx`, `layout.tsx`, `route.ts` | services (reads), `@/lib/auth`, components               | `@/lib/prisma` directly                                                        |
| `actions/**`                                | services, `@/lib/*`, validations                         | components, `@/lib/prisma`                                                     |
| `services/**`                               | `@/lib/prisma`, `@/lib/env`, `@/lib/t`, other services   | `next/*`, `react`, components, actions                                         |
| `lib/**`                                    | other lib modules                                        | components, actions, services                                                  |
| `components/ui/**`                          | `@radix-ui/*`, `sonner`, `react-day-picker`, `input-otp` | — (the only place these may be imported)                                       |

Type-only imports are always allowed. `npm run lint` fails on violations.

## How a feature is built

1. **Scaffold**: `npm run new:module <name>` creates validation, service, action, page, client island and test stubs.
2. **Schema**: add the model to `prisma/schema.prisma`, run `npm run db:migrate -- --name <change>`. Commit the migration.
3. **Strings**: add keys to the dictionary in `src/messages/`. Components call `t('key')`; never inline text.
4. **Validation**: zod schemas in `src/lib/validations/<module>.ts` with `t()` messages. Shared by server and client.
5. **Service**: pure functions. Throw `ServiceError(t('...'), 'CODE')` for expected failures.
6. **Action**: `'use server'` file. `requireAuth` → `schema.safeParse(input)` → service → `revalidatePath` → `ActionResult`. Inputs are typed `unknown`.
7. **UI**: server `page.tsx` calls `requireAuth()` itself, reads through the service, passes data down; client islands call actions and show `toast` on the result. Forms: `react-hook-form` + `zodResolver` + `FormField`.
8. **Tests**: service tests with `prismaMock` + factories; action tests mock the service; an e2e spec for the happy path using `t()` for locators.
9. **Nav**: add the route to `src/lib/navigation.ts`.

## Non-negotiable rules

### Database

- Never run `prisma db push --force-reset` or `prisma migrate reset`. If a migration warns about data loss, stop and ask.
- Every schema change ships with a migration under `prisma/migrations/`.
- Index foreign keys and common filters (`@@index`).

### Security

- Passwords: Argon2id at m=19 MiB, t=2, p=1 (decision 008, tech spec §4; `node scripts/bench-argon2.mjs` re-measures). Policy: 10–128 printable ASCII, not the national ID or mobile, not on `src/lib/data/common-passwords.ts`. Session cookies carry a random token; the database stores its SHA-256.
- Sign-in is throttled in `rate-limit.service.ts` with PostgreSQL-backed state (5 failures per account and 30 per source per 15 minutes, increasing delay; decision 008). Keys are hashed; no identifier is stored.
- Raw SQL binds instants through `utc()` from `services/sql.ts`, never a bare `Date` or `now()`: a database whose session time zone is not UTC would shift `timestamp` columns.
- Every server action authorises first and validates with zod before touching a service.
- Pages guard their own data access (layouts and pages render in parallel).
- Route handlers under `app/api/` authenticate themselves (session, organization, origin on unsafe methods): `src/proxy.ts` does not run for `/api/*`.
- Server-only modules import `'server-only'`. Environment is read through `src/lib/env.ts`, never `process.env` in app code (the proxy is the one exception).
- User-facing error messages come from `ServiceError` or zod; unexpected errors are logged and replaced by `t('errors.unexpected')`.

### Locale and direction

- `src/lib/locale.ts` decides language, direction, calendar, numerals, time zone and currency (fixed at project setup). Never hardcode a direction, a BCP-47 tag, a numbering system or a calendar; read the profile.
- Strings go through `t()` / `tp()`. Numbers, dates and currency through `@/lib/format`.
- The UI kit is written with logical Tailwind utilities (`ms- me- ps- pe- start- end- border-s border-e rounded-s rounded-e text-start text-end`) and logical overlay sides (`side="start" | "end"` on Tooltip, Popover, DropdownMenu, Sheet content). Keep new code in the same style.

### Persian and RTL

- `npm run lint:rtl` rejects physical utilities (`ml- pl- left- text-left …`) and `side="left|right"`; it runs inside `lint:all`.
- Directional icons flip: chevrons and arrows get `rtl:rotate-180`; panel icons get `rtl:-scale-x-100`.
- Free-text input is normalised with `@/lib/persian` and gets `dir="auto"`. Inline Latin runs (usernames, codes, phones) are wrapped in `<Ltr>`. Iranian identifiers are checked with `@/lib/validators/iran`.

### UI

- Import from `@/components/UiComponents` or `@/components/ui/*`. Primitive packages are blocked elsewhere by lint.
- Theme colours come from CSS variables in `src/app/globals.css`; no hex colours in components.
- Icon-only buttons need `aria-label`. Form fields go through `FormField` so labels and errors are wired.

### Code style

- TypeScript strict. `npm run lint:all` = ESLint + RTL check + `tsc` + Prettier; it must pass before you report done.
- camelCase functions/variables, PascalCase components/types, kebab-case files. `@/*` alias; no `../../` chains.
- Keep files small and named after what they export.

## Commands

| Command                                                  | What it does                                                                                                                          |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run dev`                                            | Dev server on :3000                                                                                                                   |
| `npm run db:up` / `db:migrate` / `db:deploy` / `db:seed` | Postgres via docker compose / create a migration / apply migrations / dev-only seed of two synthetic organizations sharing one mobile |
| `npm run operator -- <command>`                          | Operator CLI: `provision`, `reset`, `revoke`, `revoke-org` (prints one-time initial passwords)                                        |
| `npm run test:integration`                               | Vitest against a real PostgreSQL (`TEST_DATABASE_URL`, default local `app_test`)                                                      |
| `npm run new:module <name>`                              | Scaffold a module in the reference shape                                                                                              |
| `npm run lint:all`                                       | ESLint, RTL check, typecheck, Prettier                                                                                                |
| `npm run test` / `test:coverage`                         | Vitest unit tests                                                                                                                     |
| `npm run test:e2e`                                       | Playwright (needs Postgres; `PORT=3001` to run beside another dev server)                                                             |
| `npm run build`                                          | Production build (needs a syntactically valid `DATABASE_URL`)                                                                         |
| `npm run deps:update`                                    | Bump dependencies to latest minor/patch (Renovate does this weekly in CI)                                                             |

## Definition of done

Build passes, `lint:all` passes, unit tests pass, the feature was exercised in the browser
(or an e2e spec covers it), every new string has a dictionary key, and `docs/PRD.md` reflects any
product-visible change.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
