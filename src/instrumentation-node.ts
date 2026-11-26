import { parseEnv } from '@/lib/env-schema';

/** Exit with the readable message when the environment is invalid (Node runtime only). */
export function validateEnvAtBoot(): void {
  try {
    parseEnv(process.env, { building: process.env.NEXT_PHASE === 'phase-production-build' });
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
