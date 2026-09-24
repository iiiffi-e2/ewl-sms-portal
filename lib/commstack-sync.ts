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
import {
  CONVERSATION_SYNC_COOLDOWN_MS,
  INBOX_SYNC_COOLDOWN_MS,
  inboxSyncDecision,
  shouldSyncConversation,
} from "@/lib/commstack-sync-gate";
import { isIngestibleCommStackMessage, isVoiceCommStackMessage } from "@/lib/voice-messages";

/** Max Notify threads to backfill per inbox sync pass. */
const INBOX_SYNC_LIMIT = 25;

const conversationSyncStartedAt = new Map<string, number>();
let inboxSyncInFlight: Promise<{ synced: number; imported: number }> | null = null;
let inboxSyncFinishedAt = 0;

function rememberConversationSync(conversationId: string, now: number) {
  if (conversationSyncStartedAt.size > 200) {
    for (const [id, startedAt] of conversationSyncStartedAt) {
      if (now - startedAt >= CONVERSATION_SYNC_COOLDOWN_MS) {
        conversationSyncStartedAt.delete(id);
      }
    }
  }
  conversationSyncStartedAt.set(conversationId, now);
}

export async function syncCommStackConversation(conversationId: string): Promise<number> {
  if (!isCommStackConfigured()) {
    return 0;
  }

  const now = Date.now();
  if (!shouldSyncConversation(now, conversationSyncStartedAt.get(conversationId))) {
    return 0;
  }
  rememberConversationSync(conversationId, now);

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

  const historyIds = history
    .map((item) => item.messageId)
    .filter((id): id is string => Boolean(id));
  const existingRows = historyIds.length
    ? await prisma.message.findMany({
        where: { commStackMessageId: { in: historyIds } },
        select: {
          commStackMessageId: true,
          attachment: { select: { id: true } },
        },
      })
    : [];
  const existingById = new Map(
    existingRows.flatMap((row) =>
      row.commStackMessageId ? [[row.commStackMessageId, row] as const] : [],
    ),
  );

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
    const existing = existingById.get(item.messageId);

    // CareText already writes portal outbound on send. Re-importing history echoes
    // creates duplicate bubbles (especially when ackId and history messageId differ).
    if (isOutbound) {
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
              ...(orphan.status === MessageStatus.queued
                ? { status: MessageStatus.sent }
                : {}),
            },
          });
        }
      }
      continue;
    }

    const needsAttachment =
      isVoiceCommStackMessage({
        type: item.type,
        file: item.file,
      }) && !existing?.attachment;
    if (existing && !needsAttachment) {
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
async function syncCommStackInboxNow(options?: {
  limit?: number;
}): Promise<{ synced: number; imported: number }> {
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

export async function syncCommStackInbox(options?: {
  limit?: number;
}): Promise<{ synced: number; imported: number; skipped?: boolean }> {
  if (!isCommStackConfigured()) {
    return { synced: 0, imported: 0 };
  }

  if (inboxSyncInFlight) {
    return inboxSyncInFlight;
  }

  const decision = inboxSyncDecision(Date.now(), {
    inFlight: false,
    lastFinishedAt: inboxSyncFinishedAt,
  }, INBOX_SYNC_COOLDOWN_MS);
  if (decision === "skip") {
    return { synced: 0, imported: 0, skipped: true };
  }

  const run = syncCommStackInboxNow(options);
  inboxSyncInFlight = run;
  void run.finally(() => {
    inboxSyncFinishedAt = Date.now();
    if (inboxSyncInFlight === run) {
      inboxSyncInFlight = null;
    }
  });
  return run;
}
