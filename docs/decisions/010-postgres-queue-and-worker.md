# 010 — A PostgreSQL job queue and one private worker run transcription and analysis

**Decision.** Accepted uploads insert a `ProcessingJob` in the same transaction that marks the call
queued. A separate worker process (no public ingress, concurrency one to start) claims jobs with a
short `FOR UPDATE SKIP LOCKED` transaction, holds a renewable lease token, processes outside the
transaction, and publishes the analysis revision and job completion in one transaction fenced by job
ID and lease token. Transient failures back off exponentially; permanent ones (for example
`no_usable_speech`) fail the call. Stage checkpoints let a retry reuse a still-valid transcript. The
worker also runs the bounded retention-deletion and reconciliation tasks. Speech recognition and
analysis run on self-managed inference; transcripts are untrusted input to a model with no tools or
network access, and output is schema-validated before publishing.

**Why.** Tech spec §2, §7 and §8: about 50 calls a day do not justify a broker, the queue must survive
restarts and crashes, and customer audio may not leave for an external AI API. Next.js request
handlers cannot hold multi-minute work.

**Consequences.** Fills the "Background" gap in `AGENTS.md` › What ships. Worker code lives in its own
entrypoint (proposed `src/worker/`) and reuses `services/`; it obeys the services layering (no
`next/*`, no React). Queue access and object storage sit behind interfaces so a broker or another
store can replace them without touching the domain model. A second Docker image is built for the
worker.
