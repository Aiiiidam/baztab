# CLAUDE.md — baztab

@AGENTS.md

The file above holds the architecture, layering, database, locale and style rules.
This file adds the workflow Claude Code follows and the tooling it should reach for.

## Workflow

- Before building a Phase 1 feature, read its rows in `docs/specs/tech-spec.md` and
  `docs/specs/design-scope.md` (screens, Persian labels, required states), then `AGENTS.md` ›
  "Baztab against this table" for where it goes. The tech spec wins when the documents disagree.
- Keep changes scoped to what was asked. If you discover related work, mention it rather than doing it.
- Before reporting done: `npm run lint:all`, `npm run test`, `npm run build`; exercise the change in the
  browser (Playwright MCP) or add an e2e spec. Say what you tested.
- `docs/PRD.md` describes what the product is and does. When a change adds a route, module, or
  user-visible behaviour, update it in a sentence or two. It is a living reference, not a changelog.

## Tooling

Reach for these proactively when the context matches; skip them for trivial edits.

### MCP servers (configured in `.mcp.json`)

| MCP            | Use when                                                                                                            |
| -------------- | ------------------------------------------------------------------------------------------------------------------- |
| **Playwright** | Verifying or debugging the running app at `localhost:3000`: screenshots, form flows, console errors.                |
| **Prisma**     | Introspecting the schema, relations, or generating queries before editing `schema.prisma`.                          |
| **Context7**   | Fetching current docs for a third-party npm library. For Next.js itself, read `node_modules/next/dist/docs/` first. |

### Skills (`.claude/skills/`, invoke with `/name` or the Skill tool)

| Skill                                | Use when                                                                                                          |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| **next-best-practices**              | Creating or changing pages, layouts, route handlers, metadata, loading/error states, RSC boundaries.              |
| **shadcn**                           | Adding, composing, or fixing UI components. Read its "In this repo" section: imports go through the local barrel. |
| **ui-ux-pro-max**                    | Design decisions: palette, spacing, layout, dark mode, RTL. Run its search script from the repo root.             |
| **playwright-best-practices**        | Writing or fixing e2e specs, flaky tests, CI config.                                                              |
| **webapp-testing**                   | One-off visual verification with Python Playwright scripts (the Playwright MCP is usually quicker).               |
| **supabase-postgres-best-practices** | Schema design, indexes, query performance. Skip the RLS/Supabase-only parts.                                      |
| **simplify**                         | After a non-trivial implementation, review the diff for reuse and simplification.                                 |

Each vendored skill has a `SOURCE.md` with upstream repo, commit and license, and an "In this repo" section at the end of `SKILL.md`.

### Decision flow

```
Which requirement is this?         → docs/specs/ (tech-spec wins), PRD roadmap for the order
Spec mentions something new?       → AGENTS.md "Baztab against this table" / "What ships, what does not"
New feature?                       → npm run new:module <name>, then follow AGENTS.md "How a feature is built"
Touching a route or layout?        → next-best-practices, then bundled Next docs
Touching the schema or a query?    → Prisma MCP, supabase-postgres-best-practices
Building or changing UI?           → shadcn (barrel!), ui-ux-pro-max for design calls
Done implementing?                 → simplify, then Playwright MCP to verify in the browser
```

## Permissions

`.claude/settings.json` allows the npm/prisma commands the workflow needs and denies
destructive Prisma commands. Put personal overrides in `.claude/settings.local.json` (git-ignored).
