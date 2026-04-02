ALTER TABLE "Conversation"
ADD COLUMN "archivedAt" TIMESTAMP(3);

CREATE INDEX "Conversation_archivedAt_idx" ON "Conversation"("archivedAt");
