-- CreateTable
CREATE TABLE "VoicePresence" (
    "userId" TEXT NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VoicePresence_pkey" PRIMARY KEY ("userId")
);

-- CreateIndex
CREATE INDEX "VoicePresence_lastSeenAt_idx" ON "VoicePresence"("lastSeenAt");

-- AddForeignKey
ALTER TABLE "VoicePresence" ADD CONSTRAINT "VoicePresence_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
