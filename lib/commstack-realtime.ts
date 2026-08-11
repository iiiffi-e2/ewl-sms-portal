import {
  ConversationStatus,
  MessageDirection,
  MessageStatus,
  MessageType,
} from "@prisma/client";
import type { RealtimeMessage } from "@notify/commstack-sdk";
import {
  ensurePortalCommStackUser,
  getContactCommStackConfig,
  getScopedCommStackClient,
  hasContactCommStackConfig,
  isCommStackConfigured,
  type ContactCommStackConfig,
} from "@/lib/commstack";
import {
  outboundEchoMatchFilter,
  persistInboundCommStackMessage,
} from "@/lib/commstack-voice-ingest";
import { isSoftDeleted } from "@/lib/contact-soft-delete";
import { prisma } from "@/lib/prisma";
import { isIngestibleCommStackMessage } from "@/lib/voice-messages";

type ConnectionState = {
  key: string;
  config: ContactCommStackConfig;
  connected: boolean;
  lastError: string | null;
  handlersBound: boolean;
  startPromise: Promise<void> | null;
};

const connections = new Map<string, ConnectionState>();
let ensureAllPromise: Promise<void> | null = null;

function connectionKey(config: ContactCommStackConfig): string {
  return `${config.baseUrl}|${config.appId}|${config.portalUserId}`;
}

function toIngestItem(message: RealtimeMessage, messageId: string, sender: string) {
  return {
    messageId,
    type: message.type ?? "text",
    text: message.text ?? "",
    file: message.file ?? "",
    duration: Number(message.duration ?? 0),
    sender,
    createdAt: message.created_at,
  };
}

async function attachOutboundEcho(
  messageId: string,
  message: RealtimeMessage,
): Promise<boolean> {
  const echoMatch = outboundEchoMatchFilter({
    type: message.type,
    text: message.text,
    file: message.file,
  });
  if (!echoMatch) return false;

  const orphan = await prisma.message.findFirst({
    where: {
      direction: MessageDirection.outbound,
      body: echoMatch.body,
      ...("messageType" in echoMatch && echoMatch.messageType === "voice"
        ? { messageType: MessageType.voice }
        : {}),
      commStackMessageId: null,
      status: { in: [MessageStatus.queued, MessageStatus.sent, MessageStatus.delivered] },
    },
    orderBy: { createdAt: "desc" },
  });
  if (!orphan) return false;
  await prisma.message.update({
    where: { id: orphan.id },
    data: {
      commStackMessageId: messageId,
      status: MessageStatus.sent,
    },
  });
  return true;
}

async function ingestInboundForContact(
  config: ContactCommStackConfig,
  contact: {
    id: string;
    commStackAppId: string | null;
    commStackPortalUserId: string | null;
  },
  message: RealtimeMessage,
): Promise<void> {
  if (
    contact.commStackAppId !== config.appId ||
    contact.commStackPortalUserId !== config.portalUserId
  ) {
    return;
  }

  const messageId = String(message.message_id);
  const sender = message.sender?.trim() ?? "";

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

  const result = await persistInboundCommStackMessage({
    conversationId: conversation.id,
    config,
    item: toIngestItem(message, messageId, sender),
  });

  if (result !== "created") {
    return;
  }

  await prisma.conversation.update({
    where: { id: conversation.id },
    data: {
      lastMessageAt: new Date(),
      status: ConversationStatus.replied,
    },
  });
}

async function ingestRealtimeDirectMessage(
  config: ContactCommStackConfig,
  message: RealtimeMessage,
): Promise<void> {
  const portalUserId = config.portalUserId;
  const messageId = message.message_id != null ? String(message.message_id) : null;
  const sender = message.sender?.trim();

  if (
    !messageId ||
    !sender ||
    !isIngestibleCommStackMessage({
      type: message.type,
      text: message.text,
      file: message.file,
    })
  ) {
    return;
  }

  // Echo of our own outbound send — already stored locally by /api/messages/send.
  if (sender === portalUserId) {
    const existing = await prisma.message.findUnique({
      where: { commStackMessageId: messageId },
      select: { id: true },
    });
    if (existing) return;
    await attachOutboundEcho(messageId, message);
    return;
  }

  let contact = await prisma.contact.findUnique({
    where: { notifyClientId: sender },
  });
  if (!contact) {
    console.warn(
      `[commstack] inbound DM from unknown Notify user ${sender}; message ${messageId} ignored`,
    );
    return;
  }
  if (isSoftDeleted(contact)) {
    contact = await prisma.contact.update({
      where: { id: contact.id },
      data: { deletedAt: null },
    });
  }

  await ingestInboundForContact(config, contact, message);
}

async function ingestRealtimeChannelMessage(
  config: ContactCommStackConfig,
  message: RealtimeMessage,
): Promise<void> {
  const portalUserId = config.portalUserId;
  const messageId = message.message_id != null ? String(message.message_id) : null;
  const sender = message.sender?.trim();
  const channelId = message.channel_id?.trim();

  if (
    !messageId ||
    !sender ||
    !channelId ||
    !isIngestibleCommStackMessage({
      type: message.type,
      text: message.text,
      file: message.file,
    })
  ) {
    return;
  }

  if (sender === portalUserId) {
    const existing = await prisma.message.findUnique({
      where: { commStackMessageId: messageId },
      select: { id: true },
    });
    if (existing) return;
    await attachOutboundEcho(messageId, message);
    return;
  }

  let contact = await prisma.contact.findUnique({
    where: { notifyChannelId: channelId },
  });
  if (!contact) {
    console.warn(
      `[commstack] inbound channel message for unknown channel ${channelId}; message ${messageId} ignored`,
    );
    return;
  }
  if (isSoftDeleted(contact)) {
    contact = await prisma.contact.update({
      where: { id: contact.id },
      data: { deletedAt: null },
    });
  }

  await ingestInboundForContact(config, contact, message);
}

async function startConnection(config: ContactCommStackConfig): Promise<void> {
  const key = connectionKey(config);
  let state = connections.get(key);
  if (state?.connected) return;
  if (state?.startPromise) return state.startPromise;

  if (!state) {
    state = {
      key,
      config,
      connected: false,
      lastError: null,
      handlersBound: false,
      startPromise: null,
    };
    connections.set(key, state);
  }

  state.startPromise = (async () => {
    state!.lastError = null;
    await ensurePortalCommStackUser(config);
    const comms = await getScopedCommStackClient(config);

    const connectAsPortal = async () => {
      await comms.realtime.connect({
        userId: config.portalUserId,
        userName: "EyeWatch LIVE",
      });
      state!.connected = Boolean(comms.realtime.connected);
      if (state!.connected) {
        state!.lastError = null;
      }
    };

    if (!state!.handlersBound) {
      state!.handlersBound = true;

      comms.realtime.on("directMessage", (message) => {
        void ingestRealtimeDirectMessage(config, message).catch((error) => {
          console.error("[commstack] failed to ingest directMessage", error);
        });
      });

      comms.realtime.on("message", (message) => {
        void ingestRealtimeChannelMessage(config, message).catch((error) => {
          console.error("[commstack] failed to ingest channel message", error);
        });
      });

      comms.realtime.on("error", (error) => {
        state!.lastError = error instanceof Error ? error.message : String(error);
        console.error("[commstack] realtime error", key, error);
      });

      comms.realtime.on("disconnected", (reason) => {
        state!.connected = false;
        state!.lastError = `disconnected: ${reason}`;
        console.warn("[commstack] realtime disconnected:", key, reason, "— reconnecting in 3s");
        setTimeout(() => {
          void connectAsPortal().catch((error) => {
            state!.lastError = error instanceof Error ? error.message : String(error);
            console.error("[commstack] realtime reconnect failed", key, error);
          });
        }, 3000);
      });

      comms.realtime.on("connected", () => {
        state!.connected = true;
        state!.lastError = null;
        console.info("[commstack] realtime connected as", config.portalUserId, "app", config.appId);
      });
    }

    await connectAsPortal();
  })()
    .catch((error) => {
      if (state) {
        state.startPromise = null;
        state.connected = false;
        state.lastError = error instanceof Error ? error.message : String(error);
      }
      console.error("[commstack] failed to start realtime", key, error);
      throw error;
    });

  await state.startPromise;
}

/** Ensure a realtime socket for this contact's CommStack community. */
export async function ensureCommStackRealtimeForConfig(
  config: ContactCommStackConfig,
): Promise<void> {
  if (!isCommStackConfigured()) {
    return;
  }
  await startConnection(config);
}

async function loadDistinctConfigs(): Promise<ContactCommStackConfig[]> {
  const contacts = await prisma.contact.findMany({
    where: {
      OR: [{ notifyClientId: { not: null } }, { notifyChannelId: { not: null } }],
      commStackAppId: { not: null },
      commStackAppName: { not: null },
      commStackBaseUrl: { not: null },
      commStackPortalUserId: { not: null },
    },
    select: {
      commStackAppId: true,
      commStackAppName: true,
      commStackBaseUrl: true,
      commStackPortalUserId: true,
    },
  });

  const byKey = new Map<string, ContactCommStackConfig>();
  for (const contact of contacts) {
    if (!hasContactCommStackConfig(contact)) continue;
    try {
      const config = getContactCommStackConfig(contact);
      byKey.set(connectionKey(config), config);
    } catch {
      // Skip malformed contact rows.
    }
  }
  return [...byKey.values()];
}

/**
 * Open long-lived CommStack realtime connections for each distinct
 * community (baseUrl + appId + portalUserId) found on Notify contacts.
 */
export async function startCommStackRealtime(): Promise<void> {
  if (!isCommStackConfigured()) {
    console.info("[commstack] realtime skipped — CommStack env is not configured");
    return;
  }

  if (ensureAllPromise) return ensureAllPromise;

  ensureAllPromise = (async () => {
    const configs = await loadDistinctConfigs();
    if (configs.length === 0) {
      console.info("[commstack] realtime skipped — no Notify contacts with CommStack config");
      return;
    }

    const results = await Promise.allSettled(configs.map((config) => startConnection(config)));
    for (const result of results) {
      if (result.status === "rejected") {
        console.error("[commstack] realtime community connect failed", result.reason);
      }
    }
  })().finally(() => {
    ensureAllPromise = null;
  });

  await ensureAllPromise;
}

export function isCommStackRealtimeConnected(): boolean {
  for (const state of connections.values()) {
    if (state.connected) return true;
  }
  return false;
}

export function getCommStackRealtimeError(): string | null {
  const errors = [...connections.values()]
    .map((state) => state.lastError)
    .filter((value): value is string => Boolean(value));
  return errors[0] ?? null;
}

export function getCommStackRealtimeStatus(): {
  connections: Array<{
    baseUrl: string;
    appId: string;
    portalUserId: string;
    connected: boolean;
    lastError: string | null;
  }>;
} {
  return {
    connections: [...connections.values()].map((state) => ({
      baseUrl: state.config.baseUrl,
      appId: state.config.appId,
      portalUserId: state.config.portalUserId,
      connected: state.connected,
      lastError: state.lastError,
    })),
  };
}
