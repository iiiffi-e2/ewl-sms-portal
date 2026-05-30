-- CreateEnum
CREATE TYPE "ConsentStatus" AS ENUM ('none', 'opted_in', 'opted_out');

-- CreateEnum
CREATE TYPE "ConsentEventType" AS ENUM ('intro_sent', 'intro_delivered', 'intro_failed', 'opted_out');

-- AlterTable
ALTER TABLE "Contact" ADD COLUMN     "consentStatus" "ConsentStatus" NOT NULL DEFAULT 'none',
ADD COLUMN     "consentUpdatedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "isConsentIntro" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "ConsentEvent" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "messageId" TEXT,
    "userId" TEXT,
    "type" "ConsentEventType" NOT NULL,
    "twilioSid" TEXT,
    "detail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ConsentEvent_contactId_createdAt_idx" ON "ConsentEvent"("contactId", "createdAt");

-- CreateIndex
CREATE INDEX "ConsentEvent_type_idx" ON "ConsentEvent"("type");

-- AddForeignKey
ALTER TABLE "ConsentEvent" ADD CONSTRAINT "ConsentEvent_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentEvent" ADD CONSTRAINT "ConsentEvent_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentEvent" ADD CONSTRAINT "ConsentEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
