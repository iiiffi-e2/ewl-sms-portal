-- CreateEnum
CREATE TYPE "AlertType" AS ENUM ('Alert', 'Clear');

-- CreateEnum
CREATE TYPE "AlertStatus" AS ENUM ('open', 'cleared', 'unmatched');

-- AlterTable Contact: phone optional, notifyClientId added
ALTER TABLE "Contact" ALTER COLUMN "phone" DROP NOT NULL;

ALTER TABLE "Contact" ADD COLUMN "notifyClientId" TEXT;

CREATE UNIQUE INDEX "Contact_notifyClientId_key" ON "Contact"("notifyClientId");

CREATE INDEX "Contact_notifyClientId_idx" ON "Contact"("notifyClientId");

ALTER TABLE "Contact" ADD CONSTRAINT "Contact_phone_xor_notifyClientId_check" CHECK (
  ("phone" IS NOT NULL AND "notifyClientId" IS NULL)
  OR ("phone" IS NULL AND "notifyClientId" IS NOT NULL)
);

-- AlterTable Message
ALTER TABLE "Message" ADD COLUMN "commStackMessageId" TEXT;

CREATE UNIQUE INDEX "Message_commStackMessageId_key" ON "Message"("commStackMessageId");

-- CreateTable Alert
CREATE TABLE "Alert" (
    "id" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "type" "AlertType" NOT NULL,
    "status" "AlertStatus" NOT NULL DEFAULT 'open',
    "eventDateTime" TIMESTAMP(3) NOT NULL,
    "ackDateTime" TIMESTAMP(3),
    "facilityCode" TEXT,
    "locationName" TEXT,
    "locationBuilding" TEXT,
    "residentFirstName" TEXT,
    "residentLastName" TEXT,
    "deviceName" TEXT,
    "deviceType" TEXT,
    "payload" JSONB,
    "contactId" TEXT,
    "conversationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Alert_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Alert_externalId_eventDateTime_key" ON "Alert"("externalId", "eventDateTime");

CREATE INDEX "Alert_status_idx" ON "Alert"("status");

CREATE INDEX "Alert_eventDateTime_idx" ON "Alert"("eventDateTime");

CREATE INDEX "Alert_contactId_idx" ON "Alert"("contactId");

CREATE INDEX "Alert_conversationId_idx" ON "Alert"("conversationId");

CREATE INDEX "Alert_facilityCode_idx" ON "Alert"("facilityCode");

ALTER TABLE "Alert" ADD CONSTRAINT "Alert_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Alert" ADD CONSTRAINT "Alert_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
