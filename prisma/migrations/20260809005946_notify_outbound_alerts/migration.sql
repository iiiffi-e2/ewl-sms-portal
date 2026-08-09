-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AlertStatus" ADD VALUE 'sent';
ALTER TYPE "AlertStatus" ADD VALUE 'failed';

-- AlterTable
ALTER TABLE "Alert" ADD COLUMN     "errorMessage" TEXT,
ADD COLUMN     "note" TEXT,
ADD COLUMN     "sourceMessageId" TEXT;

-- AlterTable
ALTER TABLE "Contact" ADD COLUMN     "notifyFacilityCode" TEXT;

-- CreateIndex
CREATE INDEX "Alert_sourceMessageId_idx" ON "Alert"("sourceMessageId");
