import { ConversationStatus, MessageDirection, MessageStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { fetchCommStackDirectHistory, getCommStackPortalUserId, isCommStackConfigured } from "@/lib/commstack";

/** Max Notify threads to backfill per inbox sync pass. */
const INBOX_SYNC_LIMIT = 25;

export async function syncCommStackConversation(conversationId: string): Promise<number> {
  if (!isCommStackConfigured()) {
    return 0;
  }

  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: { contact: true },
  });

  if (!conversation?.contact?.notifyClientId) {
    return 0;
  }

  const portalUserId = getCommStackPortalUserId();
  const history = await fetchCommStackDirectHistory({
    otherUserId: conversation.contact.notifyClientId,
    limit: 50,
  });

  let imported = 0;
  for (const item of history) {
    if (!item.messageId || !item.text?.trim()) continue;

    const existing = await prisma.message.findUnique({
      where: { commStackMessageId: item.messageId },
      select: { id: true },
    });
    if (existing) continue;

    const isOutbound = item.sender === portalUserId;

    // CareText already writes portal outbound on send. Re-importing history echoes
    // creates duplicate bubbles (especially when ackId and history messageId differ).
    if (isOutbound) {
      const orphan = await prisma.message.findFirst({
        where: {
          conversationId: conversation.id,
          direction: MessageDirection.outbound,
          body: item.text,
          commStackMessageId: null,
          status: { in: [MessageStatus.queued, MessageStatus.sent, MessageStatus.delivered] },
        },
        orderBy: { createdAt: "desc" },
      });
      if (orphan) {
        await prisma.message.update({
          where: { id: orphan.id },
          data: {
            commStackMessageId: item.messageId,
            status: MessageStatus.sent,
          },
        });
      }
      continue;
    }

    const createdAt = item.createdAt ? new Date(item.createdAt) : new Date();

    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        body: item.text,
        direction: MessageDirection.inbound,
        status: MessageStatus.received,
        commStackMessageId: item.messageId,
        createdAt: Number.isNaN(createdAt.getTime()) ? undefined : createdAt,
      },
    });
    imported += 1;
  }

  if (imported > 0) {
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        lastMessageAt: new Date(),
        status: ConversationStatus.replied,
      },
    });
  }

  return imported;
}

/**
 * Pull CommStack history for recent Notify conversations so inbound replies
 * appear in the inbox list even when those threads are not open in the UI.
 * Realtime ingest covers this when the Node socket is connected; this is the
 * reliable backfill for multi-instance / disconnected cases.
 */
export async function syncCommStackInbox(options?: {
  limit?: number;
}): Promise<{ synced: number; imported: number }> {
  if (!isCommStackConfigured()) {
    return { synced: 0, imported: 0 };
  }

  const limit = options?.limit ?? INBOX_SYNC_LIMIT;
  const conversations = await prisma.conversation.findMany({
    where: {
      archivedAt: null,
      contact: { notifyClientId: { not: null } },
    },
    orderBy: { lastMessageAt: "desc" },
    take: limit,
    select: { id: true },
  });

  let imported = 0;
  for (const conversation of conversations) {
    imported += await syncCommStackConversation(conversation.id);
  }

  return { synced: conversations.length, imported };
}
