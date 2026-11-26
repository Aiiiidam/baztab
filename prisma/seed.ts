/**
 * Development-only seed: two synthetic organizations whose members share one
 * mobile number, for local work and the isolation checks (tech spec §12
 * P1-07). It provisions through the operator service, so it behaves exactly
 * like `npm run operator -- provision`: each new member gets a one-time
 * initial password, printed once, that must be changed at first sign-in.
 * Re-running is idempotent and prints no password; use
 * `npm run operator -- reset …` for a fresh one.
 *
 * Refuses to run when NODE_ENV=production: no seeded credentials ship.
 */
import 'dotenv/config';

process.env.PROCESS_ROLE = 'cli';
process.env.LOG_LEVEL = 'warn';

const ORGANIZATIONS = [
  { nationalId: '10380284790', name: 'شرکت امضای نمونه الف' },
  { nationalId: '14006278561', name: 'شرکت امضای نمونه ب' },
];
const SHARED_MOBILE = '09120000000';

async function main() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('prisma/seed.ts is for development only and refuses NODE_ENV=production.');
  }
  const { provisionMember } = await import('@/services/operator.service');
  const { prisma } = await import('@/lib/prisma');
  try {
    for (const organization of ORGANIZATIONS) {
      const result = await provisionMember({
        operator: 'dev-seed',
        nationalId: organization.nationalId,
        organizationName: organization.name,
        mobile: SHARED_MOBILE,
      });
      console.log(
        `${organization.name}: national ID ${organization.nationalId}, mobile ${SHARED_MOBILE}`,
      );
      console.log(
        result.initialPassword
          ? `  initial password (shown once): ${result.initialPassword}`
          : '  already provisioned; run `npm run operator -- reset` for a new initial password',
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
