# Baztab specifications

The source documents for Phase 1. `docs/PRD.md` is the short reference that agents read first; these
files hold the full detail behind it. When they disagree, the order below decides.

| Document                                 | What it settles                                                                                                                 | Precedence |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| [tech-spec.md](tech-spec.md)             | Architecture, auth, data model and invariants, upload/date/media rules, worker and queue, AI, retention, deployment, acceptance | 1 (wins)   |
| [product-spec.md](product-spec.md)       | Requirements P1-01 … P1-07, call analysis fields, scoring rubric, pilot checks                                                  | 2          |
| [design-scope.md](design-scope.md)       | Screens, Persian labels, required states, layout and accessibility, design handoff checks                                       | 2          |
| [design-system.md](design-system.md)     | Visual tokens: brand purple `#7B38C1`, YekanBakh type scale, spacing, radii, single-tier shadow                                 | 3          |

Notes:

- The tech spec states that its decisions take precedence over the product spec and the design scope,
  and that both were updated to match.
- The HTML prototype referenced in `design-scope.md` is not in the repository and still shows the old
  SMS sign-in and old outcome/score labels. Do not build from it where it differs from these files.
- `design-system.md` was measured from one marketing page. It has no status colours and no dark theme
  of its own; the app keeps the UI kit's semantic colours (`src/app/globals.css`) and maps only the
  brand hue, font and radii.
