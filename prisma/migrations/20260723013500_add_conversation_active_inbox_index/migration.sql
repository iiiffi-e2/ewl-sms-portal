-- Composite index for the inbox list query:
--   SELECT ... FROM "Conversation" WHERE "archivedAt" IS NULL
--   ORDER BY "lastMessageAt" DESC LIMIT 50
--
-- The pre-existing single-column "Conversation_lastMessageAt_idx" forces Postgres
-- to scan past every recently-archived row to find the newest non-archived ones,
-- a scan that grows without bound as conversations are archived and eventually
-- pushes the query past Accelerate's query-duration limit (P6004). This composite
-- index lets the planner seek directly to the archivedAt IS NULL rows already
-- ordered by lastMessageAt.
--
-- Authored by hand (kept in sync with @@index([archivedAt, lastMessageAt]) in
-- schema.prisma). IF NOT EXISTS keeps it idempotent.
CREATE INDEX IF NOT EXISTS "Conversation_archivedAt_lastMessageAt_idx"
  ON "Conversation" ("archivedAt", "lastMessageAt");
