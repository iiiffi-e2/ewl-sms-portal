/**
 * CareText wrapper around @notify/commstack-sdk v1.2+.
 * Keeps a small app-facing API so routes don't depend on SDK internals.
 *
 * Per-community credentials live on each Notify contact. Only COMM_STACK_ENV
 * (and optional timeout/token) remain as process env.
 */

import { CommStack, CommStackError, type CommStackEnv } from "@notify/commstack-sdk";
import { isCommStackUserId } from "@/lib/commstack-ids";

export { CommStackError, isCommStackUserId };

export type ContactCommStackConfig = {
  baseUrl: string;
  appId: string;
  appName: string;
  portalUserId: string;
  env: CommStackEnv;
};

export type ContactCommStackFields = {
  name?: string | null;
  notifyClientId?: string | null;
  commStackAppId?: string | null;
  commStackAppName?: string | null;
  commStackBaseUrl?: string | null;
  commStackPortalUserId?: string | null;
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

/** Strip whitespace and surrounding quotes (common when pasting .env values into Vercel). */
function readEnv(name: string): string | undefined {
  const raw = process.env[name];
  if (raw == null) return undefined;
  const trimmed = raw.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim() || undefined;
  }
  return trimmed || undefined;
}

export function normalizeCommStackBaseUrl(raw: string): string {
  return raw
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/\/$/, "")
    .split("/")[0]
    .split(":")[0];
}

export function getCommStackEnv(): CommStackEnv {
  const envRaw = readEnv("COMM_STACK_ENV")?.toLowerCase();
  if (envRaw !== "dev" && envRaw !== "production") {
    throw new CommStackError(
      "INVALID_REQUEST",
      "COMM_STACK_ENV must be 'dev' or 'production'.",
    );
  }
  return envRaw;
}

export type CommStackConfigDiagnostics = {
  configured: boolean;
  checks: {
    env: boolean;
    envRaw: string | null;
  };
  missing: string[];
};

/** True when the global CommStack env (COMM_STACK_ENV) is ready. */
export function getCommStackConfigDiagnostics(): CommStackConfigDiagnostics {
  const envRaw = readEnv("COMM_STACK_ENV")?.toLowerCase() ?? null;
  const envOk = envRaw === "dev" || envRaw === "production";
  const missing: string[] = [];
  if (!envOk) {
    missing.push(
      envRaw == null
        ? "COMM_STACK_ENV"
        : `COMM_STACK_ENV (got ${JSON.stringify(envRaw)}; need "dev" or "production")`,
    );
  }
  return {
    configured: envOk,
    checks: { env: envOk, envRaw },
    missing,
  };
}

export function isCommStackConfigured(): boolean {
  return getCommStackConfigDiagnostics().configured;
}

export function hasContactCommStackConfig(contact: ContactCommStackFields): boolean {
  return Boolean(
    contact.commStackAppId?.trim() &&
      contact.commStackAppName?.trim() &&
      contact.commStackBaseUrl?.trim() &&
      contact.commStackPortalUserId?.trim(),
  );
}

export function getContactCommStackConfig(contact: ContactCommStackFields): ContactCommStackConfig {
  if (!isCommStackConfigured()) {
    throw new CommStackError(
      "INVALID_REQUEST",
      "CommStack is not configured. Set COMM_STACK_ENV to 'dev' or 'production'.",
    );
  }

  const appId = contact.commStackAppId?.trim();
  const appName = contact.commStackAppName?.trim();
  const baseUrlRaw = contact.commStackBaseUrl?.trim();
  const portalUserId = contact.commStackPortalUserId?.trim();

  if (!appId || !appName || !baseUrlRaw || !portalUserId) {
    throw new CommStackError(
      "INVALID_REQUEST",
      "Notify contact is missing CommStack settings (APP_ID, APP_NAME, BASE_URL, PORTAL_USER_ID).",
    );
  }

  const baseUrl = normalizeCommStackBaseUrl(baseUrlRaw);
  if (!baseUrl) {
    throw new CommStackError("INVALID_REQUEST", "CommStack BASE_URL is invalid.");
  }

  if (!isCommStackUserId(portalUserId)) {
    throw new CommStackError(
      "INVALID_REQUEST",
      "CommStack PORTAL_USER_ID must be a valid UUID.",
    );
  }

  if (!isCommStackUserId(appId)) {
    throw new CommStackError("INVALID_REQUEST", "CommStack APP_ID must be a valid UUID.");
  }

  return {
    baseUrl,
    appId,
    appName,
    portalUserId,
    env: getCommStackEnv(),
  };
}

function clientCacheKey(config: Pick<ContactCommStackConfig, "baseUrl" | "appId">): string {
  return `${config.baseUrl}|${config.appId}`;
}

const rootClients = new Map<string, CommStack>();
const scopedClients = new Map<string, CommStack>();

function getRootClient(config: ContactCommStackConfig): CommStack {
  const key = config.baseUrl;
  let client = rootClients.get(key);
  if (!client) {
    client = new CommStack({
      baseUrl: config.baseUrl,
      env: config.env,
      timeout: Number(readEnv("COMM_STACK_TIMEOUT_MS") ?? 15000),
    });
    rootClients.set(key, client);
  }
  return client;
}

export async function getScopedCommStackClient(config: ContactCommStackConfig): Promise<CommStack> {
  const key = clientCacheKey(config);
  let scoped = scopedClients.get(key);
  if (scoped) return scoped;

  const root = getRootClient(config);
  scoped = root.forApplication(config.appId);
  scopedClients.set(key, scoped);
  return scoped;
}

export async function verifyCommStackAccess(config: ContactCommStackConfig): Promise<boolean> {
  const root = getRootClient(config);
  await root.verifyAccess();
  await root.forApplication(config.appId).verifyAccess();
  scopedClients.set(clientCacheKey(config), root.forApplication(config.appId));
  return true;
}

export async function ensureCommStackUser(
  config: ContactCommStackConfig,
  input: {
    userId: string;
    name?: string | null;
  },
): Promise<CommStackUser> {
  if (!isCommStackUserId(input.userId)) {
    throw new CommStackError(
      "INVALID_REQUEST",
      "Notify client ID / CommStack userId must be a valid UUID.",
      { fields: ["userId"] },
    );
  }

  const comms = await getScopedCommStackClient(config);
  try {
    const user = await comms.users.create({
      userId: input.userId.trim(),
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
      const user = await comms.users.get(input.userId.trim());
      return {
        userId: user.userId,
        name: user.name,
        role: user.role,
      };
    }
    throw error;
  }
}

export async function ensurePortalCommStackUser(config: ContactCommStackConfig): Promise<void> {
  await ensureCommStackUser(config, {
    userId: config.portalUserId,
    name: "EyeWatch LIVE®",
  });
}

export async function getCommStackUser(
  config: ContactCommStackConfig,
  userId: string,
): Promise<CommStackUser | null> {
  if (!isCommStackUserId(userId)) {
    return null;
  }
  const comms = await getScopedCommStackClient(config);
  try {
    const user = await comms.users.get(userId.trim());
    return {
      userId: user.userId,
      name: user.name,
      role: user.role,
    };
  } catch (error) {
    if (error instanceof CommStackError && error.code === "NOT_FOUND") {
      return null;
    }
    throw error;
  }
}

export async function diagnoseCommStackDirectThread(
  config: ContactCommStackConfig,
  input: {
    otherUserId: string;
  },
): Promise<{
  portalUserId: string;
  otherUserId: string;
  appId: string;
  appName: string;
  baseUrl: string;
  portalUser: CommStackUser | null;
  otherUser: CommStackUser | null;
  historyCount: number;
  recentMessages: Array<{
    messageId: string;
    direction: "outbound" | "inbound";
    text: string;
    sender: string;
    senderName?: string | null;
    createdAt?: string | Date | null;
  }>;
  notes: string[];
}> {
  const portalUserId = config.portalUserId;
  const otherUserId = input.otherUserId.trim();
  const notes: string[] = [];

  await verifyCommStackAccess(config);

  const portalUser = await getCommStackUser(config, portalUserId);
  const otherUser = await getCommStackUser(config, otherUserId);

  if (!portalUser) {
    notes.push("Portal user is not registered in CommStack. Sending may still ack but delivery can fail.");
  }
  if (!otherUser) {
    notes.push(
      "Recipient userId is not registered in this CommStack application. SDK accepts the send, then silently discards it.",
    );
  } else {
    notes.push(
      "Recipient user record exists in CommStack. CareText also auto-creates that record on send — existence alone does not mean a Notify device is logged in as this UUID.",
    );
  }

  let history: CommStackMessage[] = [];
  try {
    history = await fetchCommStackDirectHistory(config, { otherUserId, limit: 10 });
  } catch (error) {
    notes.push(
      `Failed to read directHistory: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const outboundInHistory = history.filter((item) => item.sender === portalUserId).length;
  if (history.length === 0) {
    notes.push(
      "No messages in CommStack directHistory for portal <-> this userId. If CareText shows 'sent', check appId/env mismatch or that you are diagnosing the same contact UUID you messaged.",
    );
  } else if (outboundInHistory > 0) {
    notes.push(
      `Found ${outboundInHistory} outbound message(s) in CommStack history. Delivery to a handset then depends on that device using this exact userId in this same application.`,
    );
  }

  return {
    portalUserId,
    otherUserId,
    appId: config.appId,
    appName: config.appName,
    baseUrl: config.baseUrl,
    portalUser,
    otherUser,
    historyCount: history.length,
    recentMessages: history.map((item) => ({
      messageId: item.messageId,
      direction: item.sender === portalUserId ? "outbound" : "inbound",
      text: item.text,
      sender: item.sender,
      senderName: item.senderName,
      createdAt: item.createdAt,
    })),
    notes,
  };
}

export async function sendCommStackDirectMessage(
  config: ContactCommStackConfig,
  input: {
    receiverUserId: string;
    text: string;
    senderName?: string | null;
  },
): Promise<{ messageId: string }> {
  const comms = await getScopedCommStackClient(config);

  await ensureCommStackUser(config, { userId: input.receiverUserId });
  await ensurePortalCommStackUser(config);

  // Per Notify v1.2: ackId is the stored message id (matches realtime message_id).
  const ack = await comms.messages.sendDirect({
    receiver: input.receiverUserId.trim(),
    sender: config.portalUserId,
    senderName: input.senderName ?? "EyeWatch LIVE®",
    text: input.text,
  });

  return { messageId: String(ack.ackId) };
}

export async function sendCommStackChannelMessage(
  config: ContactCommStackConfig,
  input: {
    channelId: string;
    text: string;
    senderName?: string | null;
  },
): Promise<{ messageId: string }> {
  if (!isCommStackUserId(input.channelId)) {
    throw new CommStackError(
      "INVALID_REQUEST",
      "Notify channel ID must be a valid UUID.",
      { fields: ["channelId"] },
    );
  }

  const comms = await getScopedCommStackClient(config);
  await ensurePortalCommStackUser(config);

  const ack = await comms.messages.sendToChannel({
    channelId: input.channelId.trim(),
    sender: config.portalUserId,
    senderName: input.senderName ?? "EyeWatch LIVE®",
    text: input.text,
  });

  return { messageId: String(ack.ackId) };
}

export async function fetchCommStackDirectHistory(
  config: ContactCommStackConfig,
  input: {
    otherUserId: string;
    limit?: number;
  },
): Promise<CommStackMessage[]> {
  const comms = await getScopedCommStackClient(config);

  const page = await comms.messages.directHistory({
    userId: config.portalUserId,
    otherUserId: input.otherUserId.trim(),
    limit: input.limit ?? 50,
    offset: 0,
  });

  return page.items.map((item) => ({
    messageId: String(item.messageId),
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

export async function fetchCommStackChannelHistory(
  config: ContactCommStackConfig,
  input: {
    channelId: string;
    limit?: number;
  },
): Promise<CommStackMessage[]> {
  const comms = await getScopedCommStackClient(config);

  const page = await comms.messages.channelHistory({
    channelId: input.channelId.trim(),
    userId: config.portalUserId,
    limit: input.limit ?? 50,
    offset: 0,
  });

  return page.items.map((item) => ({
    messageId: String(item.messageId),
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
