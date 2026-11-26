/**
 * Baztab analysis worker (tech spec §7, decision 010). A separate process with
 * no public ingress:
 *
 *   npm run worker:dev                             (local, tsx)
 *   node --conditions=react-server dist/worker.mjs (image, after worker:build)
 *
 * - concurrency one: claim → process → repeat; poll when idle;
 * - lease heartbeat every third of the lease; a lost lease aborts the job;
 * - maintenance every WORKER_MAINTENANCE_SECONDS: lease reclaim, abandoned
 *   upload reservations, retention expiry and deletion, ledger reconcile,
 *   expired sessions and rate-limit rows;
 * - SIGTERM/SIGINT: stop claiming, let the running job finish within the grace
 *   period, otherwise exit and leave it to lease reclaim;
 * - optional GET /health on WORKER_HEALTH_PORT for the container probe.
 *
 * Services are reused as they are. They import `server-only`, which resolves to
 * an empty module under the `react-server` export condition used here.
 */
import { createServer } from 'node:http';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import { processJob } from '@/services/analysis.service';
import { createEngine } from '@/services/inference';
import { runMaintenance } from '@/services/maintenance.service';
import * as queue from '@/services/queue.service';

const log = logger.child({ component: 'worker' });
const engine = createEngine();
let stopping = false;
let current: Promise<unknown> | null = null;
let lastHeartbeat = new Date();
let wake: (() => void) | null = null;
let health: ReturnType<typeof createServer> | null = null;

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    wake = () => {
      clearTimeout(timer);
      resolve();
    };
  });

async function runOne(): Promise<boolean> {
  const job = await queue.claimNextJob();
  if (!job) return false;

  const controller = new AbortController();
  const heartbeat = setInterval(
    () => {
      void queue.renewLease(job).then(
        (owned) => {
          if (!owned) {
            log.warn({ jobId: job.id }, 'Lease lost during processing');
            controller.abort();
          }
        },
        (err: unknown) => log.error({ err, jobId: job.id }, 'Lease renewal failed'),
      );
    },
    Math.max(1_000, (env.WORKER_LEASE_SECONDS * 1000) / 3),
  );

  const started = Date.now();
  try {
    const outcome = await processJob(job, engine, controller.signal);
    log.info(
      { jobId: job.id, callId: job.callId, outcome: outcome.status, ms: Date.now() - started },
      'Job finished',
    );
  } finally {
    clearInterval(heartbeat);
  }
  return true;
}

async function maintenanceLoop() {
  while (!stopping) {
    try {
      const report = await runMaintenance();
      const stats = await queue.queueStats();
      const risk = await queue.deadlineRisk();
      log.info({ ...report, ...stats, deadlineAtRisk: risk.atRisk }, 'Maintenance pass');
      if (risk.atRisk > 0) log.warn({ atRisk: risk.atRisk }, 'deadline_risk');
    } catch (err) {
      log.error({ err }, 'Maintenance pass failed');
    }
    await new Promise((resolve) => setTimeout(resolve, env.WORKER_MAINTENANCE_SECONDS * 1000));
  }
}

async function workLoop() {
  while (!stopping) {
    lastHeartbeat = new Date();
    try {
      current = runOne();
      const worked = await current;
      current = null;
      if (!worked) await sleep(env.WORKER_POLL_SECONDS * 1000);
    } catch (err) {
      current = null;
      log.error({ err }, 'Worker loop error');
      await sleep(env.WORKER_POLL_SECONDS * 1000);
    }
  }
}

function startHealthServer() {
  if (!env.WORKER_HEALTH_PORT) return null;
  const server = createServer((request, response) => {
    if (request.url !== '/health') {
      response.writeHead(404).end();
      return;
    }
    // Liveness: the loop has turned recently (a long job renews its lease instead).
    const idleMs = Date.now() - lastHeartbeat.getTime();
    const alive = !stopping && (current !== null || idleMs < (env.WORKER_POLL_SECONDS + 60) * 1000);
    response
      .writeHead(alive ? 200 : 503, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      })
      .end(JSON.stringify({ status: alive ? 'alive' : 'stalled', busy: current !== null }));
  });
  server.listen(env.WORKER_HEALTH_PORT, '0.0.0.0');
  return server;
}

async function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  wake?.();
  log.info({ signal }, 'Stopping: no new jobs will be claimed');
  const grace = new Promise((resolve) =>
    setTimeout(resolve, env.WORKER_SHUTDOWN_GRACE_SECONDS * 1000),
  );
  await Promise.race([current ?? Promise.resolve(), grace]);
  health?.close();
  await prisma.$disconnect();
  log.info('Worker stopped');
  process.exit(0);
}

/** Run until SIGTERM/SIGINT. Started by src/worker/main.ts. */
export async function startWorker(): Promise<void> {
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
  health = startHealthServer();
  log.info(
    { engine: engine.transcriber.modelVersion, concurrency: env.WORKER_CONCURRENCY },
    'Worker started',
  );
  void maintenanceLoop();
  await workLoop();
}
