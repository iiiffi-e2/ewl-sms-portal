-- Enable trigram matching so case-insensitive substring search (ILIKE '%term%')
-- on message bodies is index-backed instead of a sequential scan.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Production-deploy note: this plain CREATE INDEX takes a lock that blocks writes
-- to "Message" while the GIN index builds. This is fine for fresh/empty or small
-- tables. For the first deploy to an environment that already has a large
-- "Message" table, build the index out-of-band (non-locking) BEFORE deploying and
-- mark this migration resolved so `migrate deploy` skips it — see
-- prisma/manual/create-message-body-index-concurrently.sql.
CREATE INDEX IF NOT EXISTS "message_body_trgm_idx"
  ON "Message" USING gin ("body" gin_trgm_ops);
