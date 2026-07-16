-- Out-of-band creation of the pg_trgm GIN index on "Message"."body" WITHOUT
-- locking writes. Use this for the FIRST deploy to an environment whose
-- "Message" table already holds significant data (e.g. production), INSTEAD of
-- letting `prisma migrate deploy` run migration
-- 20260715000000_add_message_body_trgm_index (which uses a plain, lock-taking
-- CREATE INDEX).
--
-- Runbook:
--   1. Run this file against the target DB over a DIRECT (non-pooled) connection.
--      CREATE INDEX CONCURRENTLY cannot run inside a transaction, so run it
--      directly and do NOT wrap it in BEGIN/COMMIT:
--        psql "$DIRECT_URL" -f prisma/manual/create-message-body-index-concurrently.sql
--   2. Mark the equivalent migration as already applied so `migrate deploy`
--      skips its lock-taking CREATE INDEX:
--        npx prisma migrate resolve --applied 20260715000000_add_message_body_trgm_index
--
-- Notes:
--   - CONCURRENTLY builds without blocking reads/writes, at the cost of a slower
--     build and a second table scan.
--   - If a build is interrupted it can leave an INVALID index; drop it
--     (`DROP INDEX CONCURRENTLY "message_body_trgm_idx";`) and re-run.
--   - Prisma 7.4+ supports CREATE INDEX CONCURRENTLY directly in migrations; on
--     the current 6.x line this out-of-band path is required for large tables.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX CONCURRENTLY IF NOT EXISTS "message_body_trgm_idx"
  ON "Message" USING gin ("body" gin_trgm_ops);
