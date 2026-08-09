/**
 * PROVISIONAL until Notify confirms:
 * - Authorization: Bearer COMM_STACK_SDK_TOKEN
 * - payload.id: generated UUID
 * - note is NOT sent in Notify JSON (CareText audit only)
 * - location.building / resident / device omitted
 */
import { randomUUID } from "crypto";
import {
  AlertStatus,
  AlertType,
  MessageDirection,
  Prisma,
} from "@prisma/client";
import { isNotifyContact } from "@/lib/contact-identity";
import { prisma as defaultPrisma } from "@/lib/prisma";

/** Strip whitespace and surrounding quotes (common when pasting .env values). */
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

/**
 * Prefer COMM_STACK_SDK_TOKEN; else env-specific COMM_STACK_SDK_TOKEN_DEV /
 * COMM_STACK_SDK_TOKEN_PRODUCTION matching COMM_STACK_ENV.
 */
export function resolveCommStackSdkToken(): string | undefined {
  const explicit = readEnv("COMM_STACK_SDK_TOKEN");
  if (explicit) return explicit;

  const envRaw = readEnv("COMM_STACK_ENV")?.toLowerCase();
  if (envRaw === "dev") return readEnv("COMM_STACK_SDK_TOKEN_DEV");
  if (envRaw === "production") return readEnv("COMM_STACK_SDK_TOKEN_PRODUCTION");
  return undefined;
}

function normalizeCommStackHost(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed.replace(/^http:\/\//i, "https://");
  }
  return `https://${trimmed}`;
}

export function buildNotifyAlertUrl(
  baseUrl: string,
  facilityCode: string,
  eventDateTime: string,
): string {
  const origin = normalizeCommStackHost(baseUrl);
  const encodedFacility = encodeURIComponent(facilityCode.trim());
  const params = new URLSearchParams({ eventDateTime });
  return `${origin}/palatiumCare/${encodedFacility}?${params.toString()}`;
}

export function buildOutboundAlertPayload(input: {
  id: string;
  eventDateTime: string;
  room: string;
}): Record<string, unknown> {
  return {
    version: "2.0",
    vendor: "Notify",
    id: input.id,
    type: "Alert" as const,
    eventDateTime: input.eventDateTime,
    location: { name: input.room.trim() },
  };
}

export async function sendOutboundNotifyAlert(input: {
  baseUrl: string;
  facilityCode: string;
  room: string;
  note?: string | null; // CareText-only until Notify confirms mapping
  sdkToken: string;
  fetchImpl?: typeof fetch;
}): Promise<{
  externalId: string;
  eventDateTime: string;
  requestPayload: unknown;
  responseStatus: number;
  responseBody: string;
  ok: boolean;
  note: string | null;
}> {
  const eventDateTime = new Date().toISOString();
  const externalId = randomUUID();
  const requestPayload = buildOutboundAlertPayload({
    id: externalId,
    eventDateTime,
    room: input.room,
  });
  const url = buildNotifyAlertUrl(input.baseUrl, input.facilityCode, eventDateTime);
  const fetchFn = input.fetchImpl ?? fetch;
  const response = await fetchFn(url, {
    method: "POST",
    headers: {
      // PROVISIONAL auth — confirm with Notify
      Authorization: `Bearer ${input.sdkToken}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestPayload),
  });
  const responseBody = await response.text();
  return {
    externalId,
    eventDateTime,
    requestPayload,
    responseStatus: response.status,
    responseBody,
    ok: response.ok,
    note: input.note ?? null,
  };
}

type OutboundAlertDb = {
  conversation: {
    findUnique: (args: {
      where: { id: string };
      include: { contact: true };
    }) => Promise<{
      id: string;
      contactId: string | null;
      contact: {
        id: string;
        phone: string | null;
        notifyClientId: string | null;
        notifyChannelId: string | null;
        notifyFacilityCode: string | null;
        commStackBaseUrl: string | null;
      } | null;
    } | null>;
  };
  message: {
    findFirst: (args: {
      where: { id: string; conversationId: string };
    }) => Promise<{
      id: string;
      conversationId: string;
      direction: MessageDirection;
    } | null>;
  };
  alert: {
    create: (args: {
      data: {
        externalId: string;
        type: AlertType;
        status: AlertStatus;
        eventDateTime: Date;
        facilityCode: string;
        locationName: string;
        note: string | null;
        sourceMessageId: string;
        contactId: string;
        conversationId: string;
        errorMessage: string | null;
        payload: Prisma.InputJsonValue;
      };
    }) => Promise<{
      id: string;
      status: AlertStatus;
      externalId: string;
      locationName: string | null;
      note: string | null;
    }>;
  };
};

export type ProcessOutboundAlertSendResult =
  | {
      ok: true;
      alert: {
        id: string;
        status: "sent";
        externalId: string;
        locationName: string | null;
        note: string | null;
      };
    }
  | { ok: false; status: number; error: string };

export async function processOutboundAlertSend(input: {
  conversationId: string;
  messageId: string;
  room: string;
  note?: string | null;
  sdkToken: string;
  fetchImpl?: typeof fetch;
  db?: OutboundAlertDb;
}): Promise<ProcessOutboundAlertSendResult> {
  const db = input.db ?? (defaultPrisma as unknown as OutboundAlertDb);
  const room = input.room.trim();
  const note = input.note?.trim() ? input.note.trim() : null;

  const conversation = await db.conversation.findUnique({
    where: { id: input.conversationId },
    include: { contact: true },
  });
  if (!conversation?.contact) {
    return { ok: false, status: 404, error: "Conversation not found." };
  }

  const contact = conversation.contact;
  if (!isNotifyContact(contact)) {
    return {
      ok: false,
      status: 400,
      error: "Alerts can only be sent for Notify contacts.",
    };
  }

  const message = await db.message.findFirst({
    where: { id: input.messageId, conversationId: input.conversationId },
  });
  if (!message) {
    return { ok: false, status: 404, error: "Message not found in conversation." };
  }
  if (message.direction !== MessageDirection.outbound) {
    return {
      ok: false,
      status: 400,
      error: "Alerts can only be sent from outbound messages.",
    };
  }

  const facilityCode = contact.notifyFacilityCode?.trim();
  const baseUrl = contact.commStackBaseUrl?.trim();
  if (!facilityCode || !baseUrl) {
    return {
      ok: false,
      status: 400,
      error: "Contact is not configured for alerts (missing facility code or CommStack base URL).",
    };
  }

  let sendResult: Awaited<ReturnType<typeof sendOutboundNotifyAlert>>;
  try {
    sendResult = await sendOutboundNotifyAlert({
      baseUrl,
      facilityCode,
      room,
      note,
      sdkToken: input.sdkToken,
      fetchImpl: input.fetchImpl,
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Failed to reach Notify.";
    await db.alert.create({
      data: {
        externalId: randomUUID(),
        type: AlertType.Alert,
        status: AlertStatus.failed,
        eventDateTime: new Date(),
        facilityCode,
        locationName: room,
        note,
        sourceMessageId: input.messageId,
        contactId: contact.id,
        conversationId: conversation.id,
        errorMessage,
        payload: {
          error: errorMessage,
          room,
          note,
        } as Prisma.InputJsonValue,
      },
    });
    return { ok: false, status: 502, error: errorMessage };
  }

  const errorMessage = sendResult.ok
    ? null
    : `Notify returned ${sendResult.responseStatus}${
        sendResult.responseBody ? `: ${sendResult.responseBody.slice(0, 200)}` : ""
      }`;

  const alert = await db.alert.create({
    data: {
      externalId: sendResult.externalId,
      type: AlertType.Alert,
      status: sendResult.ok ? AlertStatus.sent : AlertStatus.failed,
      eventDateTime: new Date(sendResult.eventDateTime),
      facilityCode,
      locationName: room,
      note: sendResult.note,
      sourceMessageId: input.messageId,
      contactId: contact.id,
      conversationId: conversation.id,
      errorMessage,
      payload: {
        request: sendResult.requestPayload,
        responseStatus: sendResult.responseStatus,
        responseBody: sendResult.responseBody.slice(0, 4000),
        note: sendResult.note,
      } as Prisma.InputJsonValue,
    },
  });

  if (!sendResult.ok) {
    return {
      ok: false,
      status: 502,
      error: errorMessage ?? "Notify alert request failed.",
    };
  }

  return {
    ok: true,
    alert: {
      id: alert.id,
      status: "sent",
      externalId: alert.externalId,
      locationName: alert.locationName,
      note: alert.note,
    },
  };
}
