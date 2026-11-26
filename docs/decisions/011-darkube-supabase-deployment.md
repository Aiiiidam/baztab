# 011 — Web, worker and migrations deploy separately: Darkube for containers, Supabase for data

**Decision.** Three release artifacts: `baztab-web` (standalone Next.js, non-root, port 3000),
`baztab-worker` (pinned runtime, ffmpeg/ffprobe and approved models) and `baztab-migrate` (one-shot
`prisma migrate deploy` with its own credentials, run once before a compatible rollout). Web and
worker run on Hamravesh Darkube from immutable image tags; PostgreSQL and a private recordings bucket
run on Supabase Free through Supavisor session mode over TLS, with separate `DATABASE_URL_WEB`,
`DATABASE_URL_WORKER` and `DATABASE_URL_MIGRATE`. Storage is reached only with S3 access keys; the
service-role and anon keys are never deployed. Audio reaches the browser only through an
authenticated same-origin Range endpoint.

**Why.** Tech spec §10 and §11. Running migrations on every web start races between replicas and needs
migration credentials in the runtime; the worker has different resource and image needs from the web
app.

**Consequences.** Replaces the starter's "migrations applied on container start"
(`docker-entrypoint.sh`) for deployed environments; local `docker compose` may keep it for convenience.
`src/lib/env.ts` gains validated storage, origin, retention, upload-limit and budget settings, and the
Supabase Free limits (1 GB storage, 5 GB egress, pause on inactivity, no automatic backups) are
tracked against an 800 MB app budget. Staging is deployed first and the same images are promoted.
