import { ConversationStatus, MessageDirection, MessageStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { fetchCommStackDirectHistory, getCommStackPortalUserId, isCommStackConfigured } from "@/lib/commstack";

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
    const createdAt = item.createdAt ? new Date(item.createdAt) : new Date();

    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        body: item.text,
        direction: isOutbound ? MessageDirection.outbound : MessageDirection.inbound,
        status: isOutbound ? MessageStatus.sent : MessageStatus.received,
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
