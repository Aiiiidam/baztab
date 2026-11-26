# بازتاب · Baztab

Baztab helps the product team of a B2B digital signature product find the problems customers report
most often. Organization members upload Persian MP3 support-call recordings; self-managed AI
transcribes each call, extracts the reason, the issues and their outcomes, and scores how the agent
handled the call. Issues are grouped and ranked by distinct calls, and every finding links back to
timestamped transcript and audio evidence. Product reference: [`docs/PRD.md`](docs/PRD.md) · full
specifications: [`docs/specs/`](docs/specs/README.md).

Next.js 16 · React 19 · Tailwind CSS 4 · Prisma 6 · PostgreSQL, plus a separate analysis worker. One
locale profile (see "Locale and direction" below). Rules for coding agents are in `AGENTS.md` and
`CLAUDE.md`.

## Quick start

Requirements: Node LTS (`.nvmrc`), PostgreSQL 14+ (Docker via `npm run db:up`, or a local install),
and ffmpeg/ffprobe on the PATH (or `FFPROBE_PATH` in `.env`) for upload validation.

```bash
cp .env.example .env      # DATABASE_URL points at the docker-compose Postgres
npm ci && npm run db:generate
npm run db:up             # Postgres in Docker (or edit DATABASE_URL in .env)
npm run db:deploy         # apply migrations
npm run db:seed           # two synthetic organizations; prints one-time initial passwords (dev only)
npm run dev               # http://localhost:3000
npm run worker:dev        # analysis worker (second terminal), deterministic fake engine
```

Sign in with the organization national ID, mobile `09120000000` and the printed initial password; you
are asked to choose a new one. Members are provisioned with the operator CLI, never through the UI:
`npm run operator -- provision --national-id <id> --name <name> --mobile <mobile>` (also `reset`,
`revoke`, `revoke-org`, `reprocess`, `delete-org`; see `scripts/operator.ts`).

Upload the synthetic recordings in `e2e/fixtures/audio/` from **فهرست تماس‌ها** to see the whole flow.
`docker compose up --build` runs the same three images that deploy (migrate → web + worker).

**No database?** Set `SKIP_AUTH=true` in `.env` to skip login and run UI-only (development only).

Every environment variable is documented in `.env.example` and validated at boot by `src/lib/env.ts`.

## Building a feature

Open your coding agent in the project root (Claude Code reads `CLAUDE.md`; other agents read
`AGENTS.md`). Work follows the roadmap in `docs/PRD.md`; each item points to the requirement IDs
(P1-01 … P1-07) and tech-spec sections in `docs/specs/`. Describe the feature in product terms, for
example:

> Build the call list (فهرست تماس‌ها) from design-scope and tech spec §9: cursor-paged search by call
> ID, filename or issue, filters for state, issue and Jalali date range, and the تاریخ بارگذاری label.

The agent runs `npm run new:module <name>`, adds the Prisma model and migration, writes the strings,
validation, service, action, page and tests in the shape of the Users module, wires the nav item,
and finishes with `npm run lint:all`, `npm run test` and a check in the browser. That sequence is
spelled out in `AGENTS.md` under "How a feature is built", and the lint rules make the layering hard
to get wrong.

## Stack

| Layer    | Technology                                                                                                                   |
| -------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Frontend | Next.js 16 App Router, React 19 (React Compiler), Tailwind CSS 4                                                             |
| UI       | Locally owned shadcn components generated in RTL mode, one import barrel                                                     |
| Locale   | One profile (`src/lib/locale.ts`) drives direction, calendar, numerals, time zone, currency; `t()` messages; Intl formatting |
| Backend  | Server Actions + route handlers, zod validation, framework-free services                                                     |
| Database | PostgreSQL via Prisma 6, migrations committed                                                                                |
| Auth     | Organization national ID + mobile + password, Argon2id, forced initial-password change, PostgreSQL throttle, no roles        |
| Tests    | Vitest (unit, mocked Prisma), Playwright (e2e against a real DB, locale-aware)                                               |
| Ops      | Docker multi-stage image, docker-compose, GitHub Actions CI, Renovate                                                        |

Phase 1 (decisions 008–011, 013): a PostgreSQL job queue and a private analysis worker behind
self-managed inference interfaces (today a deterministic fake engine; the real Persian model is plan
task M3-T8), Supabase PostgreSQL and private S3 storage, separate web / worker / migrate images for
Hamravesh Darkube. Status per acceptance row: [`docs/acceptance-report.md`](docs/acceptance-report.md).

## Project structure

```
src/
  app/
    layout.tsx        document shell (html/body, font, theme, direction)
    (auth)/           bare pages: login/, change-password/
    (app)/            authenticated shell: reports/issues/, calls/ (list, [id] detail)
    api/              calls/ (uploads, list, detail, audio), reports/issues/, health/ (+ live/)
  worker/             analysis worker (main.ts → index.ts)
  actions/            server actions: authorise → validate → service → revalidate
  services/           business logic, framework-free
  components/         ui/ primitives · UiComponents.tsx barrel · layout/ shell
  lib/                locale, t, format, persian, validators, validations, env, auth, prisma, …
  messages/           index.ts + the project's one dictionary (fa.ts)
  __tests__/          unit tests, factories, prisma mock
prisma/               schema, migrations, seed · prisma.config.ts at the root
e2e/                  Playwright config and specs
scripts/              operator.ts CLI · eval/ harness · fixtures and probe · migration guard · scaffold
docs/                 PRD, specs/ (Phase 1 specifications), decision records, checklists
.claude/              settings.json + vendored skills for Claude Code
AGENTS.md             rules for any coding agent · CLAUDE.md adds the Claude workflow
```

The **Auth** module (`lib/validations/{auth,password}.ts` → `services/auth.service.ts` →
`actions/auth.actions.ts` → `app/(auth)/`) is the reference shape; `calls` and `review` follow it. `npm run new:module <name>` scaffolds
a new one in the same shape; `AGENTS.md` walks through the steps.

## Common tasks

| I want to…                          | Do this                                                                                                                                                                   |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Add a feature module                | `npm run new:module <name>`, then follow the printed next steps (see "Building a feature").                                                                               |
| Add a page                          | Create `src/app/(app)/<route>/page.tsx`. It is behind login automatically; call `requireAuth()` in the page and read data through a service.                              |
| Add a table                         | Add the model to `prisma/schema.prisma`, run `npm run db:migrate -- --name <change>`, commit the migration folder.                                                        |
| Add a user-facing string            | Add a key to the dictionary in `src/messages/`, read it with `t('key')` (or `tp()` for plurals). Never inline text.                                                       |
| Add a form                          | `react-hook-form` + `zodResolver` + `FormField`, schema in `src/lib/validations/`. See `src/app/(auth)/login/login-form.tsx`.                                             |
| Add a shadcn component              | `npx shadcn@latest add <name>` (`components.json` is in RTL mode), export it from `src/components/UiComponents.tsx`, then `npm run lint:rtl` to catch physical utilities. |
| Add a sidebar item                  | Edit `NAV_ITEMS` in `src/lib/navigation.ts`; the header title follows.                                                                                                    |
| Change the app name or logo         | `src/lib/app-config.ts` (name, description) and `src/components/layout/Logo.tsx` (mark).                                                                                  |
| Change the brand colours            | The hue/saturation variables at the top of `src/app/globals.css` (Baztab purple: hue 270, 55 %; tokens in `docs/specs/design-system.md`).                                 |
| Give someone access                 | `npm run operator -- provision …` prints a one-time initial password to deliver out of band.                                                                              |
| Run e2e beside a running dev server | `PORT=3001 npm run test:e2e`                                                                                                                                              |
| Update dependencies                 | `npm run deps:update` (minor/patch) or `npm run deps:update:major` (interactive). Renovate opens the same PRs weekly.                                                     |

## Scripts

| Command                                                                      | Description                                                                         |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `npm run dev` / `build` / `start`                                            | Development server / production build / serve the build                             |
| `npm run new:module <name>`                                                  | Scaffold validation, service, action, page, client island and test                  |
| `npm run lint` · `lint:rtl` · `typecheck` · `format`                         | ESLint · logical-direction and UI-boundary check · `tsc` · Prettier                 |
| `npm run lint:all`                                                           | All of the above (CI gate)                                                          |
| `npm run test` · `test:watch` · `test:coverage`                              | Vitest                                                                              |
| `npm run test:e2e`                                                           | Playwright (needs Postgres; `PORT=3001 npm run test:e2e` beside another dev server) |
| `npm run db:up`                                                              | Start Postgres with docker compose                                                  |
| `npm run db:migrate` · `db:deploy` · `db:seed` · `db:studio` · `db:generate` | Prisma                                                                              |
| `npm run deps:update` · `deps:update:major` · `reinstall`                    | Dependency upkeep                                                                   |

## Locale and direction

One locale profile per project, set once in `src/lib/locale.ts`:

| Profile | Direction | Intl tag | Calendar | Numerals       | Time zone     | Currency             |
| ------- | --------- | -------- | -------- | -------------- | ------------- | -------------------- |
| `fa`    | RTL       | `fa-IR`  | Jalali   | Persian digits | `Asia/Tehran` | IRR (shown as toman) |

`<html lang dir>`, the `DirectionProvider`, the font, Playwright's browser locale, every formatter and
every `t()` string follow the profile. Rules that keep this working (logical utilities,
`side="start|end"`, `t()` for all strings, `<Ltr>` for inline Latin) are in `AGENTS.md` and enforced by
`npm run lint:rtl`.

## Working with AI agents

- **Claude Code**: `CLAUDE.md` holds the workflow and the tooling table. `.claude/settings.json`
  pre-approves the safe commands and denies destructive Prisma commands. Skills under `.claude/skills/`
  are vendored with attribution (`SOURCE.md` in each).
- **Other agents** (Cursor, Codex, Copilot): read `AGENTS.md`.
- Framework docs matching the installed Next.js version are in `node_modules/next/dist/docs/`.
- `docs/decisions/` explains why the big choices were made, so nobody has to re-derive them.

## Troubleshooting

| Symptom                                                                     | Cause and fix                                                                                                                                                    |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm ci` fails with "lockfile out of sync" or "Cannot find native binding"  | An incremental `npm install` dropped optional platform packages from the lockfile (npm bug). Run `npm run reinstall`, which regenerates it from a clean install. |
| `npm run build` fails with "Invalid environment variables: DATABASE_URL"    | The build evaluates `src/lib/env.ts`. Any syntactically valid `postgresql://` URL will do; it is not connected to during the build.                              |
| `npm run db:up` fails: port 5432 already in use                             | A local Postgres is running. Either use it (edit `DATABASE_URL` in `.env`) or change the host port in `docker-compose.yml`.                                      |
| Direction, calendar or strings look wrong after editing `src/lib/locale.ts` | The profile is inlined at build time. Restart `npm run dev` or rebuild.                                                                                          |
| `npm run test:e2e` says the browser is missing                              | `npx playwright install chromium` once per machine.                                                                                                              |
| Prisma engine download fails (blocked network)                              | Set `PRISMA_ENGINES_MIRROR=https://registry.npmmirror.com/-/binary/prisma` before `npm ci`; the Dockerfile already does.                                         |
| `apt-get` fails inside `docker build`                                       | Uncomment one of the Debian mirrors at the top of the `Dockerfile`.                                                                                              |
| A page renders a raw key like `invoices.title`                              | The key is missing from the dictionary. Development also logs `[t] missing message key`.                                                                         |
| ESLint: "import of `@/services/...` is restricted"                          | Components and client islands may not touch services or Prisma. Read through a server `page.tsx` and pass data down, or call a server action.                    |
| `npm run lint:rtl` rejects `ml-`, `pl-`, `left-`, `side="left"`             | Use logical utilities (`ms-`, `ps-`, `start-`) and `side="start \| end"` so the layout works in both directions.                                                 |

## Deployment

Today: `docker compose up --build` builds the standalone image, waits for Postgres, runs `prisma migrate deploy`
and starts the server. The image exposes `/api/health` for orchestrator probes. CI
(`.github/workflows/ci.yml`) runs lint, typecheck, unit tests, build, the e2e suite against a Postgres
service, and a Docker image build on every push and pull request. Renovate (`renovate.json`) groups
dependency updates weekly.

Target (tech spec §11, decision 011): separate `baztab-web`, `baztab-worker` and `baztab-migrate`
releases on Hamravesh Darkube against Supabase (Supavisor session mode, private bucket via S3 keys),
staging first, immutable image tags, migrations as a one-shot release step.

## License

MIT. See `LICENSE`. Built on [mhp-nextjs-boilerplate](https://github.com/amirmhp98/mhp-nextjs-boilerplate)
(commit `a6228062`). Vendored skills carry their own licenses inside `.claude/skills/*/`. The bundled
YekanBakh font's redistribution terms must be verified before shipping (tech spec §3).
