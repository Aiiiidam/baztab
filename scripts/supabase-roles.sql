-- Baztab database roles and grants for a Supabase project (tech spec §11, decision 011).
-- Run once per project as `postgres` (SQL editor or Management API). Idempotent.
-- Passwords are set separately (ALTER ROLE … PASSWORD) and never committed.
--
-- baztab_migrate  owns the `baztab` schema; used only by `prisma migrate deploy`.
-- baztab_web      DML on application tables; no DDL.
-- baztab_worker   DML on application tables; no DDL.
--
-- The app lives in its own schema rather than `public`, so Supabase's Data API
-- (which exposes `public` to the anon and authenticated keys) never sees it.

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'baztab_migrate') THEN
    CREATE ROLE baztab_migrate LOGIN NOINHERIT CONNECTION LIMIT 2;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'baztab_web') THEN
    -- 3 per replica (§11); headroom for one rolling restart.
    CREATE ROLE baztab_web LOGIN NOINHERIT CONNECTION LIMIT 6;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'baztab_worker') THEN
    CREATE ROLE baztab_worker LOGIN NOINHERIT CONNECTION LIMIT 4;
  END IF;
END
$$;

-- On Supabase `postgres` is not a superuser; PostgreSQL 16+ needs SET membership
-- to give baztab_migrate a schema and default privileges. INHERIT stays off.
GRANT baztab_migrate TO postgres WITH INHERIT FALSE, SET TRUE;

CREATE SCHEMA IF NOT EXISTS baztab AUTHORIZATION baztab_migrate;
ALTER SCHEMA baztab OWNER TO baztab_migrate;

-- Prisma's first migration runs `CREATE SCHEMA IF NOT EXISTS "public"`, which
-- checks CREATE on the database even when the schema exists.
GRANT CONNECT, CREATE ON DATABASE postgres TO baztab_migrate;
GRANT CONNECT ON DATABASE postgres TO baztab_web, baztab_worker;

-- Runtime roles see only what migrate creates in `baztab`.
REVOKE CREATE ON SCHEMA public FROM baztab_web, baztab_worker;

-- Grants on the schema and its objects are the owner's to give: issued by
-- postgres they are silently skipped ("no privileges were granted").
SET ROLE baztab_migrate;
REVOKE ALL ON SCHEMA baztab FROM PUBLIC;
GRANT USAGE ON SCHEMA baztab TO baztab_web, baztab_worker;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA baztab TO baztab_web, baztab_worker;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA baztab TO baztab_web, baztab_worker;
ALTER DEFAULT PRIVILEGES IN SCHEMA baztab
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO baztab_web, baztab_worker;
ALTER DEFAULT PRIVILEGES IN SCHEMA baztab
  GRANT USAGE, SELECT ON SEQUENCES TO baztab_web, baztab_worker;

-- Migration history is the migrate role's business.
DO $$
BEGIN
  IF to_regclass('baztab._prisma_migrations') IS NOT NULL THEN
    REVOKE ALL ON baztab._prisma_migrations FROM baztab_web, baztab_worker;
  END IF;
END
$$;
RESET ROLE;

ALTER ROLE baztab_migrate SET search_path = baztab;
ALTER ROLE baztab_web SET search_path = baztab;
ALTER ROLE baztab_worker SET search_path = baztab;
