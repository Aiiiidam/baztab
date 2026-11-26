# 008 — Organization memberships with operator-issued passwords replace username accounts

**Decision.** Members sign in with organization national ID (11-digit شناسه ملی with check digit),
mobile and password. There is no self-registration and no SMS: an internal operator command
provisions or revokes an organization/member pair (idempotent, audited without secrets), generates a
random one-time initial password, stores only its Argon2id hash and shows the plaintext once. The
first sign-in can only set a new password; setting it clears the flag and invalidates the initial
credential in one transaction. Resets reuse the same command and revoke every session. Passwords are
10–128 printable ASCII characters, differ from the national ID and mobile, and are not on a bundled
common-password list. Rate limits (5 failures per account and 30 per source per 15 minutes, increasing
delay, no hard lockout) live in PostgreSQL. Sessions keep the hashed-token cookie of decision 002 with
a 24-hour idle and 7-day absolute expiry, and every request re-checks membership and organization.

**Why.** Tech spec §4 and product spec P1-07: only allowlisted members of a customer organization may
see its recordings, and knowing the national ID and mobile must never be enough. Argon2id and a shared
throttle store replace bcrypt and the in-memory throttle because the web app may run more than one
replica and restart at any time.

**Consequences.** Supersedes the bcrypt, username and in-memory-throttle parts of decision 002 and of
`AGENTS.md` › Security once implemented; the session-token model stays. The `User` model, `ADMIN` /
`USER` roles, `/admin/users`, the `/components` gallery, `prisma/seed.ts` default credentials and
`admin` / `admin123` are removed from the production build when this lands. The Users module remains
the code pattern to copy until then. The bundled `@/lib/validators/iran` national-ID check is for the
10-digit personal code and must not be reused for organizations; identifiers are strings so leading
zeros survive.
