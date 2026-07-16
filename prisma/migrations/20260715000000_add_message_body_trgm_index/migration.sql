-- Enable trigram matching so case-insensitive substring search (ILIKE '%term%')
-- on message bodies is index-backed instead of a sequential scan.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS "message_body_trgm_idx"
  ON "Message" USING gin ("body" gin_trgm_ops);
