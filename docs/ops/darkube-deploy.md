# Deploying Baztab to Darkube (synthetic staging)

Plan tasks M0-T3, M0-T4 and M6-T6. This first deployment proves the infrastructure with **synthetic
data only**: the worker runs the fake engine, because no production inference engine exists yet
(M3-T8) and the OpenAI engine is refused in production (decision 014). Never upload real customer
calls to this deployment.

## What gets deployed

| Workload         | Dockerfile           | Port | Public?                   | Health check                                         |
| ---------------- | -------------------- | ---- | ------------------------- | ---------------------------------------------------- |
| `baztab-web`     | `Dockerfile`         | 3000 | Yes, HTTPS on a domain    | liveness `/api/health/live`, readiness `/api/health` |
| `baztab-worker`  | `Dockerfile.worker`  | 3100 | **No** ingress            | liveness `/health`                                   |
| `baztab-migrate` | `Dockerfile.migrate` | —    | No; runs once, then exits | exit code 0                                          |

Database and storage are the existing Supabase project (schema `baztab`, roles from
`scripts/supabase-roles.sql`).

## Steps in the Darkube panel

1. **Connect the repository.** Give Darkube access to `github.com/Aiiiidam/baztab` and use branch
   `phase-1/implementation` (switch to `main` after the pull request merges).
2. **Create `baztab-migrate`** from `Dockerfile.migrate`. Secret: everything in
   `.env.darkube-migrate`. Run it once; its log must end with "All migrations have been successfully
   applied" or "No pending migrations to apply".
3. **Create `baztab-worker`** from `Dockerfile.worker`, 1 replica, **no domain or ingress**.
   - Secret: everything in `.env.darkube-worker`.
   - Add `INFERENCE_ENGINE=fake` and `INFERENCE_ALLOW_FAKE_IN_PRODUCTION=true` (synthetic staging only).
     The image already sets `WORKER_HEALTH_PORT=3100`.
   - Liveness probe: HTTP GET `/health` on port 3100.
   - Resources to start: 0.5 CPU, 512 MiB RAM.
4. **Create `baztab-web`** from `Dockerfile`, 1 replica, port 3000.
   - Secret: everything in `.env.darkube-web`. Set `APP_ORIGIN` to the real HTTPS address (for
     example `https://baztab.<your-domain>`), not the placeholder.
   - Domain with HTTPS (Let's Encrypt) on that same address.
   - Ingress: request body limit **11 MiB** (one 10 MiB recording per request plus form overhead),
     read timeout **120 s**.
   - Liveness probe: HTTP GET `/api/health/live` on port 3000. Readiness probe: HTTP GET `/api/health`.
   - Resources to start: 0.5 CPU, 512 MiB RAM.
5. **Provision a sign-in** for the staging organization from your laptop (it talks to the same
   Supabase database):
   `npm run operator -- provision --national-id <id> --name <name> --mobile <mobile>`.

The migrate secret (`DATABASE_URL_MIGRATE`) goes only to `baztab-migrate`, never to web or worker.
Run `baztab-migrate` before each release that adds a migration.

## Checks after deployment

Send the HTTPS address back; these run from outside and are recorded in
`docs/ops/infrastructure-proof.md`:

- `/api/health` returns 200 with `database: ok`.
- Sign-in, forced password change, then upload of the synthetic files in `e2e/fixtures/audio/`.
- An 11 MiB file is refused with the product's message, not an ingress error page.
- Audio seeking works (HTTP 206 range responses through the ingress).
- The worker processes the uploads (calls become ready) and has no public address.
- Rolling restart of web and worker keeps the app available; a queued call finishes after a worker
  restart.

Also record the Darkube plan limits shown in the panel (CPU, RAM, disk, GPU availability): they decide
whether a self-managed model can run there (D2).
