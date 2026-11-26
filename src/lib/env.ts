import 'server-only';
import { parseEnv } from '@/lib/env-schema';

/**
 * Validated environment. Import `env` instead of touching `process.env` in
 * server code; a missing or malformed variable fails at boot with a readable
 * message instead of deep inside Prisma or a storage call.
 *
 * `next build` also evaluates this module, so CI and Docker builds must
 * provide a placeholder DATABASE_URL (see Dockerfile and .github/workflows).
 * The worker bundle aliases `server-only` away and reads the same schema with
 * PROCESS_ROLE=worker (see src/worker/).
 */
export type { Env } from '@/lib/env-schema';

export const env = parseEnv(process.env, {
  building: process.env.NEXT_PHASE === 'phase-production-build',
});
