-- CreateEnum
CREATE TYPE "ConversationType" AS ENUM ('direct', 'group');

-- CreateEnum
CREATE TYPE "ParticipantStatus" AS ENUM ('pending_intro', 'active', 'removed');

-- AlterEnum
ALTER TYPE "ConsentEventType" ADD VALUE 'group_intro_sent';

-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN     "title" TEXT,
ADD COLUMN     "twilioConversationSid" TEXT,
ADD COLUMN     "twilioProjectedAddress" TEXT,
ADD COLUMN     "type" "ConversationType" NOT NULL DEFAULT 'direct',
ALTER COLUMN "contactId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "authorPhone" TEXT,
ADD COLUMN     "isSystemNote" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "twilioConversationSid" TEXT;

-- CreateTable
CREATE TABLE "ConversationParticipant" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "twilioParticipantSid" TEXT,
    "status" "ParticipantStatus" NOT NULL DEFAULT 'pending_intro',
    "removedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConversationParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ConversationParticipant_conversationId_idx" ON "ConversationParticipant"("conversationId");

-- CreateIndex
CREATE INDEX "ConversationParticipant_contactId_idx" ON "ConversationParticipant"("contactId");

-- CreateIndex
CREATE UNIQUE INDEX "ConversationParticipant_conversationId_contactId_key" ON "ConversationParticipant"("conversationId", "contactId");

-- CreateIndex
CREATE UNIQUE INDEX "Conversation_twilioConversationSid_key" ON "Conversation"("twilioConversationSid");

-- CreateIndex
CREATE INDEX "Conversation_type_idx" ON "Conversation"("type");

-- AddForeignKey
ALTER TABLE "ConversationParticipant" ADD CONSTRAINT "ConversationParticipant_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationParticipant" ADD CONSTRAINT "ConversationParticipant_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
