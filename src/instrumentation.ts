/**
 * Runs once when a Next.js server starts (plan M1-T2): validate the
 * environment at boot, so a missing or unsafe setting (for example SKIP_AUTH
 * in production) stops the process instead of failing the first request.
 * Node-only code lives in ./instrumentation-node (this file is also compiled
 * for the Edge runtime).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { validateEnvAtBoot } = await import('./instrumentation-node');
    validateEnvAtBoot();
  }
}
