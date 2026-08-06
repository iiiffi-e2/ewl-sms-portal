import {
  ConversationStatus,
  MessageDirection,
  MessageStatus,
  Prisma,
} from "@prisma/client";
import type { RealtimeMessage } from "@notify/commstack-sdk";
import {
  ensurePortalCommStackUser,
  getCommStackPortalUserId,
  getScopedCommStackClient,
  isCommStackConfigured,
} from "@/lib/commstack";
import { prisma } from "@/lib/prisma";

let startPromise: Promise<void> | null = null;
let connected = false;
let lastError: string | null = null;
let handlersBound = false;

async function ingestRealtimeDirectMessage(message: RealtimeMessage): Promise<void> {
  const portalUserId = getCommStackPortalUserId();
  const messageId = message.message_id != null ? String(message.message_id) : null;
  const text = message.text?.trim();
  const sender = message.sender?.trim();

  if (!messageId || !text || !sender) {
    return;
  }

  const existing = await prisma.message.findUnique({
    where: { commStackMessageId: messageId },
    select: { id: true },
  });
  if (existing) {
    return;
  }

  // Echo of our own outbound send — already stored locally by /api/messages/send.
  if (sender === portalUserId) {
    const orphan = await prisma.message.findFirst({
      where: {
        direction: MessageDirection.outbound,
        body: text,
        commStackMessageId: null,
        status: { in: [MessageStatus.queued, MessageStatus.sent, MessageStatus.delivered] },
      },
      orderBy: { createdAt: "desc" },
    });
    if (orphan) {
      await prisma.message.update({
        where: { id: orphan.id },
        data: {
          commStackMessageId: messageId,
          status: MessageStatus.sent,
        },
      });
    }
    return;
  }

  const contact = await prisma.contact.findUnique({
    where: { notifyClientId: sender },
  });
  if (!contact) {
    console.warn(
      `[commstack] inbound DM from unknown Notify user ${sender}; message ${messageId} ignored`,
    );
    return;
  }

  let conversation = await prisma.conversation.findFirst({
    where: {
      contactId: contact.id,
      status: { not: ConversationStatus.closed },
      archivedAt: null,
    },
    orderBy: { lastMessageAt: "desc" },
  });

  if (!conversation) {
    conversation = await prisma.conversation.create({
      data: {
        contactId: contact.id,
        status: ConversationStatus.new,
      },
    });
  }

  const createdAt = message.created_at ? new Date(message.created_at) : new Date();

  try {
    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        body: text,
        direction: MessageDirection.inbound,
        status: MessageStatus.received,
        commStackMessageId: messageId,
        createdAt: Number.isNaN(createdAt.getTime()) ? undefined : createdAt,
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return;
    }
    throw error;
  }

  await prisma.conversation.update({
    where: { id: conversation.id },
    data: {
      lastMessageAt: new Date(),
      status: ConversationStatus.replied,
    },
  });
}

/**
 * Open a long-lived CommStack realtime connection as the shared portal user.
 * Safe to call multiple times; only one connection is established per process.
 */
export async function startCommStackRealtime(): Promise<void> {
  if (connected) return;
  if (startPromise) return startPromise;

  if (!isCommStackConfigured()) {
    console.info("[commstack] realtime skipped — CommStack env is not configured");
    return;
  }

  startPromise = (async () => {
    lastError = null;
    await ensurePortalCommStackUser();
    const portalUserId = getCommStackPortalUserId();
    const comms = await getScopedCommStackClient();

    const connectAsPortal = async () => {
      await comms.realtime.connect({
        userId: portalUserId,
        userName: "CareText Portal",
      });
      connected = Boolean(comms.realtime.connected);
      if (connected) {
        lastError = null;
      }
    };

    // Register handlers before connect so early messages are not missed.
    // Only bind once — reconnect reuses the same client/handlers.
    if (!handlersBound) {
      handlersBound = true;

      comms.realtime.on("directMessage", (message) => {
        void ingestRealtimeDirectMessage(message).catch((error) => {
          console.error("[commstack] failed to ingest directMessage", error);
        });
      });

      comms.realtime.on("error", (error) => {
        lastError = error instanceof Error ? error.message : String(error);
        console.error("[commstack] realtime error", error);
      });

      comms.realtime.on("disconnected", (reason) => {
        connected = false;
        lastError = `disconnected: ${reason}`;
        console.warn("[commstack] realtime disconnected:", reason, "— reconnecting in 3s");
        setTimeout(() => {
          void connectAsPortal().catch((error) => {
            lastError = error instanceof Error ? error.message : String(error);
            console.error("[commstack] realtime reconnect failed", error);
          });
        }, 3000);
      });

      comms.realtime.on("connected", () => {
        connected = true;
        lastError = null;
        console.info("[commstack] realtime connected as", portalUserId);
      });
    }

    await connectAsPortal();
  })()
    .catch((error) => {
      startPromise = null;
      connected = false;
      lastError = error instanceof Error ? error.message : String(error);
      console.error("[commstack] failed to start realtime", error);
      throw error;
    });

  await startPromise;
}

export function isCommStackRealtimeConnected(): boolean {
  return connected;
}

export function getCommStackRealtimeError(): string | null {
  return lastError;
}
