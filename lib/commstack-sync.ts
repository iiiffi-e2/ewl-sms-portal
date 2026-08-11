import {
  ConversationStatus,
  MessageDirection,
  MessageStatus,
  MessageType,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  fetchCommStackChannelHistory,
  fetchCommStackDirectHistory,
  getContactCommStackConfig,
  hasContactCommStackConfig,
  isCommStackConfigured,
} from "@/lib/commstack";
import {
  outboundEchoMatchFilter,
  persistInboundCommStackMessage,
} from "@/lib/commstack-voice-ingest";
import { isIngestibleCommStackMessage } from "@/lib/voice-messages";

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

  const contact = conversation?.contact;
  if (!contact || !hasContactCommStackConfig(contact)) {
    return 0;
  }

  const isChannel = Boolean(contact.notifyChannelId);
  const isIndividual = Boolean(contact.notifyClientId);
  if (!isChannel && !isIndividual) {
    return 0;
  }

  const config = getContactCommStackConfig(contact);
  const history = isChannel
    ? await fetchCommStackChannelHistory(config, {
        channelId: contact.notifyChannelId!,
        limit: 50,
      })
    : await fetchCommStackDirectHistory(config, {
        otherUserId: contact.notifyClientId!,
        limit: 50,
      });

  let imported = 0;
  for (const item of history) {
    if (
      !item.messageId ||
      !isIngestibleCommStackMessage({
        type: item.type,
        text: item.text,
        file: item.file,
      })
    ) {
      continue;
    }

    const isOutbound = item.sender === config.portalUserId;

    // CareText already writes portal outbound on send. Re-importing history echoes
    // creates duplicate bubbles (especially when ackId and history messageId differ).
    if (isOutbound) {
      const existing = await prisma.message.findUnique({
        where: { commStackMessageId: item.messageId },
        select: { id: true },
      });
      if (existing) continue;

      const echoMatch = outboundEchoMatchFilter({
        type: item.type,
        text: item.text,
        file: item.file,
      });
      if (echoMatch) {
        const orphan = await prisma.message.findFirst({
          where: {
            conversationId: conversation.id,
            direction: MessageDirection.outbound,
            body: echoMatch.body,
            ...("messageType" in echoMatch && echoMatch.messageType === "voice"
              ? { messageType: MessageType.voice }
              : {}),
            commStackMessageId: null,
            status: {
              in: [MessageStatus.queued, MessageStatus.sent, MessageStatus.delivered],
            },
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
      }
      continue;
    }

    const result = await persistInboundCommStackMessage({
      conversationId: conversation.id,
      config,
      item: {
        messageId: item.messageId,
        type: item.type,
        text: item.text,
        file: item.file,
        duration: item.duration,
        sender: item.sender,
        createdAt: item.createdAt,
      },
    });
    if (result === "created") {
      imported += 1;
    }
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
      contact: {
        OR: [{ notifyClientId: { not: null } }, { notifyChannelId: { not: null } }],
        commStackAppId: { not: null },
      },
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
