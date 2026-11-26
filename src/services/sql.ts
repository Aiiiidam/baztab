import { Prisma } from '@prisma/client';

/**
 * Raw-SQL helpers. Prisma stores DateTime as `timestamp(3)` holding UTC. A JS
 * Date bound into raw SQL arrives as timestamptz, and Postgres converts it to
 * the *session* time zone when writing a `timestamp` column, so a server in
 * Asia/Tehran would store values 3h30 ahead. Always bind instants through
 * `utc()` in hand-written SQL, and never use CURRENT_TIMESTAMP / now() there.
 */
export function utc(date: Date): Prisma.Sql {
  return Prisma.sql`(${date.toISOString()}::timestamptz AT TIME ZONE 'UTC')`;
}
