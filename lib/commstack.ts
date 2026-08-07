/**
 * CareText wrapper around @notify/commstack-sdk v1.2+.
 * Keeps a small app-facing API so routes don't depend on SDK internals.
 */

import { CommStack, CommStackError, type CommStackEnv } from "@notify/commstack-sdk";
import { isCommStackUserId } from "@/lib/commstack-ids";

export { CommStackError, isCommStackUserId };

type CommStackConfig = {
  baseUrl: string;
  env: CommStackEnv;
  appId: string;
  portalUserId: string;
  appName?: string;
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

export type CommStackConfigDiagnostics = {
  configured: boolean;
  checks: {
    baseUrl: boolean;
    env: boolean;
    envRaw: string | null;
    portalUserId: boolean;
    appIdOrName: boolean;
  };
  missing: string[];
};

export function getCommStackConfigDiagnostics(): CommStackConfigDiagnostics {
  const baseUrl = Boolean(readEnv("COMM_STACK_BASE_URL"));
  const envRaw = readEnv("COMM_STACK_ENV")?.toLowerCase() ?? null;
  const envOk = envRaw === "dev" || envRaw === "production";
  const portalUserId = Boolean(readEnv("COMM_STACK_PORTAL_USER_ID"));
  const appIdOrName = Boolean(readEnv("COMM_STACK_APP_ID") || readEnv("COMM_STACK_APP_NAME"));

  const missing: string[] = [];
  if (!baseUrl) missing.push("COMM_STACK_BASE_URL");
  if (!envOk) {
    missing.push(
      envRaw == null
        ? "COMM_STACK_ENV"
        : `COMM_STACK_ENV (got ${JSON.stringify(envRaw)}; need "dev" or "production")`,
    );
  }
  if (!portalUserId) missing.push("COMM_STACK_PORTAL_USER_ID");
  if (!appIdOrName) missing.push("COMM_STACK_APP_ID or COMM_STACK_APP_NAME");

  return {
    configured: baseUrl && envOk && portalUserId && appIdOrName,
    checks: {
      baseUrl,
      env: envOk,
      envRaw,
      portalUserId,
      appIdOrName,
    },
    missing,
  };
}

function readBaseConfig(): Omit<CommStackConfig, "appId"> & { appId?: string } {
  const baseUrl = readEnv("COMM_STACK_BASE_URL")
    ?.replace(/^https?:\/\//, "")
    .replace(/\/$/, "")
    .split("/")[0]
    .split(":")[0];
  const envRaw = readEnv("COMM_STACK_ENV")?.toLowerCase();
  const portalUserId = readEnv("COMM_STACK_PORTAL_USER_ID");
  const appId = readEnv("COMM_STACK_APP_ID");
  const appName = readEnv("COMM_STACK_APP_NAME");

  if (!baseUrl || !envRaw || !portalUserId) {
    throw new CommStackError(
      "INVALID_REQUEST",
      "CommStack is not configured. Set COMM_STACK_BASE_URL, COMM_STACK_ENV, and COMM_STACK_PORTAL_USER_ID.",
    );
  }

  if (envRaw !== "dev" && envRaw !== "production") {
    throw new CommStackError(
      "INVALID_REQUEST",
      "COMM_STACK_ENV must be 'dev' or 'production'.",
    );
  }

  if (!isCommStackUserId(portalUserId)) {
    throw new CommStackError(
      "INVALID_REQUEST",
      "COMM_STACK_PORTAL_USER_ID must be a valid UUID.",
    );
  }

  if (!appId && !appName) {
    throw new CommStackError(
      "INVALID_REQUEST",
      "Set COMM_STACK_APP_ID, or COMM_STACK_APP_NAME to register an application.",
    );
  }

  return {
    baseUrl,
    env: envRaw,
    appId,
    appName,
    portalUserId,
    timeoutMs: Number(readEnv("COMM_STACK_TIMEOUT_MS") ?? 15000),
  };
}

export function isCommStackConfigured(): boolean {
  return getCommStackConfigDiagnostics().configured;
}

let rootClient: CommStack | null = null;
let scopedClient: CommStack | null = null;
let resolvedAppId: string | null = null;

function getRootClient(): CommStack {
  const config = readBaseConfig();
  if (!rootClient) {
    rootClient = new CommStack({
      baseUrl: config.baseUrl,
      env: config.env,
      timeout: config.timeoutMs,
    });
  }
  return rootClient;
}

async function resolveAppId(): Promise<string> {
  if (resolvedAppId) return resolvedAppId;

  const config = readBaseConfig();
  if (config.appId) {
    resolvedAppId = config.appId;
    return resolvedAppId;
  }

  const client = getRootClient();
  const app = await client.applications.register({
    name: config.appName!,
  });
  resolvedAppId = app.appId;
  console.warn(
    `[commstack] Registered application "${config.appName}". Persist this as COMM_STACK_APP_ID=${app.appId}`,
  );
  return resolvedAppId;
}

export async function getScopedCommStackClient(): Promise<CommStack> {
  if (scopedClient) return scopedClient;
  const appId = await resolveAppId();
  scopedClient = getRootClient().forApplication(appId);
  return scopedClient;
}

export function getCommStackPortalUserId(): string {
  return readBaseConfig().portalUserId;
}

export async function verifyCommStackAccess(): Promise<boolean> {
  const config = readBaseConfig();
  const root = getRootClient();
  await root.verifyAccess();

  if (config.appId) {
    await root.forApplication(config.appId).verifyAccess();
    resolvedAppId = config.appId;
    scopedClient = root.forApplication(config.appId);
  } else {
    await getScopedCommStackClient();
  }

  return true;
}

export async function ensureCommStackUser(input: {
  userId: string;
  name?: string | null;
}): Promise<CommStackUser> {
  if (!isCommStackUserId(input.userId)) {
    throw new CommStackError(
      "INVALID_REQUEST",
      "Notify client ID / CommStack userId must be a valid UUID.",
      { fields: ["userId"] },
    );
  }

  const comms = await getScopedCommStackClient();
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

export async function ensurePortalCommStackUser(): Promise<void> {
  const portalUserId = getCommStackPortalUserId();
  await ensureCommStackUser({
    userId: portalUserId,
    name: "EyeWatch LIVE®",
  });
}

export async function getCommStackUser(userId: string): Promise<CommStackUser | null> {
  if (!isCommStackUserId(userId)) {
    return null;
  }
  const comms = await getScopedCommStackClient();
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

export async function diagnoseCommStackDirectThread(input: {
  otherUserId: string;
}): Promise<{
  portalUserId: string;
  otherUserId: string;
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
  const portalUserId = getCommStackPortalUserId();
  const otherUserId = input.otherUserId.trim();
  const notes: string[] = [];

  await verifyCommStackAccess();

  const portalUser = await getCommStackUser(portalUserId);
  const otherUser = await getCommStackUser(otherUserId);

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
    history = await fetchCommStackDirectHistory({ otherUserId, limit: 10 });
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

export async function sendCommStackDirectMessage(input: {
  receiverUserId: string;
  text: string;
  senderName?: string | null;
}): Promise<{ messageId: string }> {
  const portalUserId = getCommStackPortalUserId();
  const comms = await getScopedCommStackClient();

  await ensureCommStackUser({ userId: input.receiverUserId });
  await ensurePortalCommStackUser();

  // Per Notify v1.2: ackId is the stored message id (matches realtime message_id).
  const ack = await comms.messages.sendDirect({
    receiver: input.receiverUserId.trim(),
    sender: portalUserId,
    senderName: input.senderName ?? "EyeWatch LIVE®",
    text: input.text,
  });

  return { messageId: String(ack.ackId) };
}

export async function fetchCommStackDirectHistory(input: {
  otherUserId: string;
  limit?: number;
}): Promise<CommStackMessage[]> {
  const portalUserId = getCommStackPortalUserId();
  const comms = await getScopedCommStackClient();

  const page = await comms.messages.directHistory({
    userId: portalUserId,
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
