-- CreateEnum
CREATE TYPE "CallDirection" AS ENUM ('outbound', 'inbound');

-- CreateEnum
CREATE TYPE "CallMode" AS ENUM ('browser', 'phone');

-- CreateEnum
CREATE TYPE "CallStatus" AS ENUM ('initiating', 'ringing', 'in_progress', 'completed', 'failed', 'no_answer', 'busy', 'canceled');

-- AlterTable
ALTER TABLE "CallLog" ADD COLUMN     "direction" "CallDirection" NOT NULL DEFAULT 'outbound',
ADD COLUMN     "durationSeconds" INTEGER,
ADD COLUMN     "mode" "CallMode" NOT NULL DEFAULT 'browser',
ADD COLUMN     "recordingSid" TEXT,
ADD COLUMN     "recordingUrl" TEXT,
ADD COLUMN     "status" "CallStatus" NOT NULL DEFAULT 'initiating';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "phoneNumber" TEXT;

-- CreateIndex
CREATE INDEX "CallLog_status_idx" ON "CallLog"("status");
