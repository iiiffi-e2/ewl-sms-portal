-- Enable trigram matching so case-insensitive substring search (ILIKE '%term%')
-- on message bodies is index-backed instead of a sequential scan.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Production-deploy note: this plain CREATE INDEX takes a lock that blocks writes
-- to "Message" while the GIN index builds. On a large table, build it out-of-band
-- with CREATE INDEX CONCURRENTLY (which cannot run inside Prisma's migration
-- transaction) and mark it applied via `prisma migrate resolve --applied`, or run
-- this migration during a maintenance window.
CREATE INDEX IF NOT EXISTS "message_body_trgm_idx"
  ON "Message" USING gin ("body" gin_trgm_ops);
