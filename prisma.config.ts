import 'dotenv/config';
import { defineConfig } from 'prisma/config';

// Release-only migration credentials (tech spec §11). The schema reads
// DATABASE_URL, so the migrate role's URL replaces it for every Prisma CLI run;
// the web and worker processes never see DATABASE_URL_MIGRATE.
if (process.env.DATABASE_URL_MIGRATE) {
  process.env.DATABASE_URL = process.env.DATABASE_URL_MIGRATE;
}

/** Prisma CLI configuration (replaces the deprecated `package.json#prisma` block). */
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx --conditions=react-server prisma/seed.ts',
  },
});
