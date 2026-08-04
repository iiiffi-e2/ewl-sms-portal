/**
 * CareText wrapper around the official @notify/commstack-sdk.
 * Keeps a small app-facing API so routes don't depend on SDK internals.
 */

import { CommStack, CommStackError } from "@notify/commstack-sdk";

export { CommStackError };

type CommStackConfig = {
  baseUrl: string;
  sdkToken: string;
  appId: string;
  portalUserId: string;
  timeoutMs?: number;
};

type CommStackUser = {
  userId: string;
  name?: string | null;
  role?: string | null;
};

type CommStackMessage = {
  messageId: string;
  type: string;
  text: string;
  sender: string;
  senderName?: string | null;
  receiver?: string | null;
  channelId?: string | null;
  createdAt?: string | Date | null;
  readAt?: string | Date | null;
};

function readConfig(): CommStackConfig {
  const baseUrl = process.env.COMM_STACK_BASE_URL?.trim();
  const sdkToken = process.env.COMM_STACK_SDK_TOKEN?.trim();
  const appId = process.env.COMM_STACK_APP_ID?.trim();
  const portalUserId = process.env.COMM_STACK_PORTAL_USER_ID?.trim();

  if (!baseUrl || !sdkToken || !appId || !portalUserId) {
    throw new CommStackError(
      "INVALID_REQUEST",
      "CommStack is not configured. Set COMM_STACK_BASE_URL, COMM_STACK_SDK_TOKEN, COMM_STACK_APP_ID, and COMM_STACK_PORTAL_USER_ID.",
    );
  }

  return {
    // SDK accepts host, host:port, or host:port/api/v1 (scheme/path filled in).
    baseUrl: baseUrl.replace(/^https?:\/\//, "").replace(/\/$/, ""),
    sdkToken,
    appId,
    portalUserId,
    timeoutMs: Number(process.env.COMM_STACK_TIMEOUT_MS ?? 15000),
  };
}

function getScopedClient() {
  const config = readConfig();
  return new CommStack({
    baseUrl: config.baseUrl,
    sdkToken: config.sdkToken,
    timeout: config.timeoutMs,
  }).forApplication(config.appId);
}

export function isCommStackConfigured(): boolean {
  return Boolean(
    process.env.COMM_STACK_BASE_URL?.trim() &&
      process.env.COMM_STACK_SDK_TOKEN?.trim() &&
      process.env.COMM_STACK_APP_ID?.trim() &&
      process.env.COMM_STACK_PORTAL_USER_ID?.trim(),
  );
}

export function getCommStackPortalUserId(): string {
  return readConfig().portalUserId;
}

export async function ensureCommStackUser(input: {
  userId: string;
  name?: string | null;
}): Promise<CommStackUser> {
  const comms = getScopedClient();
  try {
    const user = await comms.users.create({
      userId: input.userId,
      name: input.name ?? undefined,
      role: "mobile user",
    });
    return {
      userId: user.userId,
      name: user.name,
      role: user.role,
    };
  } catch (error) {
    if (error instanceof CommStackError && error.code === "ALREADY_EXISTS") {
      const user = await comms.users.get(input.userId);
      return {
        userId: user.userId,
        name: user.name,
        role: user.role,
      };
    }
    throw error;
  }
}

export async function ensurePortalCommStackUser(): Promise<void> {
  const config = readConfig();
  await ensureCommStackUser({
    userId: config.portalUserId,
    name: "CareText Portal",
  });
}

export async function sendCommStackDirectMessage(input: {
  receiverUserId: string;
  text: string;
  senderName?: string | null;
}): Promise<{ ackId?: string }> {
  const config = readConfig();
  const comms = getScopedClient();

  await ensureCommStackUser({ userId: input.receiverUserId });
  await ensurePortalCommStackUser();

  // SendAck is acceptance for async delivery — it carries ackId, not messageId.
  const ack = await comms.messages.sendDirect({
    receiver: input.receiverUserId,
    sender: config.portalUserId,
    senderName: input.senderName ?? "CareText",
    text: input.text,
  });

  return { ackId: ack.ackId };
}

export async function fetchCommStackDirectHistory(input: {
  otherUserId: string;
  limit?: number;
}): Promise<CommStackMessage[]> {
  const config = readConfig();
  const comms = getScopedClient();

  const page = await comms.messages.directHistory({
    userId: config.portalUserId,
    otherUserId: input.otherUserId,
    limit: input.limit ?? 50,
    offset: 0,
  });

  return page.items.map((item) => ({
    messageId: item.messageId,
    type: item.type,
    text: item.text,
    sender: item.sender,
    senderName: item.senderName,
    receiver: item.receiver,
    channelId: item.channelId,
    createdAt: item.createdAt,
    readAt: item.readAt,
  }));
}
