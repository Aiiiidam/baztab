/**
 * Worker bootstrap: fix the process role before any module reads the
 * environment, then start the loop (see ./index.ts).
 */
process.env.PROCESS_ROLE ??= 'worker';

void import('./index').then(
  ({ startWorker }) => startWorker(),
  (error: unknown) => {
    console.error(error);
    process.exit(1);
  },
);
