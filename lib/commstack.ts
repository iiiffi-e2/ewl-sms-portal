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

function readBaseConfig(): Omit<CommStackConfig, "appId"> & { appId?: string } {
  const baseUrl = process.env.COMM_STACK_BASE_URL?.trim()
    .replace(/^https?:\/\//, "")
    .replace(/\/$/, "")
    .split("/")[0]
    .split(":")[0];
  const envRaw = process.env.COMM_STACK_ENV?.trim().toLowerCase();
  const portalUserId = process.env.COMM_STACK_PORTAL_USER_ID?.trim();
  const appId = process.env.COMM_STACK_APP_ID?.trim();
  const appName = process.env.COMM_STACK_APP_NAME?.trim();

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
    timeoutMs: Number(process.env.COMM_STACK_TIMEOUT_MS ?? 15000),
  };
}

export function isCommStackConfigured(): boolean {
  const env = process.env.COMM_STACK_ENV?.trim().toLowerCase();
  return Boolean(
    process.env.COMM_STACK_BASE_URL?.trim() &&
      (env === "dev" || env === "production") &&
      process.env.COMM_STACK_PORTAL_USER_ID?.trim() &&
      (process.env.COMM_STACK_APP_ID?.trim() || process.env.COMM_STACK_APP_NAME?.trim()),
  );
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
    name: "CareText Portal",
  });
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
    senderName: input.senderName ?? "CareText",
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
