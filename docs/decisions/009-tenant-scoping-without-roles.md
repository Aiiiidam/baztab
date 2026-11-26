# 009 — Every record is organization-scoped from the session; Phase 1 has no roles

**Decision.** Tenant-owned tables carry `organizationId`, and relationships use composite keys so a
child cannot point at another organization's parent. Services take the organization from the
authenticated session (never from client input) and include it in every query predicate. A missing or
foreign record returns a generic 404 after authentication. All members of an organization can do
every task. Browser-side database access and Supabase Auth are not used; private schemas stay outside
the Supabase Data API, and web, worker and migration each use a least-privileged database role. RLS,
if added later, is defence in depth with transaction-scoped tenant context and tested against the real
roles and pooler.

**Why.** Tech spec §4.6 and §5. One customer must never see another's calls, and the same mobile number
can be a member of two organizations, so isolation cannot rest on the user alone.

**Consequences.** `requireAuth()` returns the membership and organization; there is no
`requireAdmin()` in product code. Service tests cover a second organization for every read and
write, and the acceptance suite uses two organizations sharing one mobile. Operator tasks are CLI
commands with their own credentials, not admin pages.
