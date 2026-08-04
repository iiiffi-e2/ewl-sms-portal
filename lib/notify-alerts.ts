import {
  AlertStatus,
  AlertType,
  ConversationStatus,
  MessageDirection,
  MessageStatus,
  Prisma,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type NotifyAlertPayload = {
  version?: string;
  vendor?: string;
  id: string;
  type: "Alert" | "Clear";
  eventDateTime: string;
  ackDateTime?: string;
  location?: {
    name?: string;
    building?: string;
  };
  resident?: {
    firstName?: string;
    lastName?: string;
  };
  device?: {
    name?: string;
    type?: string;
  };
  near?: Array<{ name?: string }>;
};

export function parseNotifyAlertPayload(raw: unknown): NotifyAlertPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const body = raw as Record<string, unknown>;
  if (typeof body.id !== "string" || !body.id.trim()) return null;
  if (body.type !== "Alert" && body.type !== "Clear") return null;
  if (typeof body.eventDateTime !== "string" || !body.eventDateTime.trim()) return null;
  return body as NotifyAlertPayload;
}

export function candidateNotifyClientIds(payload: NotifyAlertPayload): string[] {
  const ids = new Set<string>();
  if (payload.id?.trim()) ids.add(payload.id.trim());
  return [...ids];
}

export async function findContactForAlert(payload: NotifyAlertPayload) {
  const candidates = candidateNotifyClientIds(payload);
  if (!candidates.length) return null;

  return prisma.contact.findFirst({
    where: {
      notifyClientId: { in: candidates },
    },
  });
}

function formatAlertSystemMessage(payload: NotifyAlertPayload, kind: "Alert" | "Clear"): string {
  const resident = [payload.resident?.firstName, payload.resident?.lastName].filter(Boolean).join(" ");
  const location = [payload.location?.building, payload.location?.name].filter(Boolean).join(" · ");
  const device = [payload.device?.type, payload.device?.name].filter(Boolean).join(" · ");
  const parts = [
    kind === "Alert" ? "Notify alert received." : "Notify alert cleared.",
    resident ? `Resident: ${resident}` : null,
    location ? `Location: ${location}` : null,
    device ? `Device: ${device}` : null,
    `Event: ${payload.eventDateTime}`,
  ].filter(Boolean);
  return parts.join(" ");
}

async function ensureConversationForContact(contactId: string) {
  let conversation = await prisma.conversation.findFirst({
    where: {
      contactId,
      status: { not: ConversationStatus.closed },
      archivedAt: null,
    },
    orderBy: { lastMessageAt: "desc" },
  });

  if (!conversation) {
    conversation = await prisma.conversation.create({
      data: {
        contactId,
        status: ConversationStatus.new,
      },
    });
  }

  return conversation;
}

export async function processNotifyAlertEvent(input: {
  payload: NotifyAlertPayload;
  facilityCode?: string | null;
}) {
  const { payload, facilityCode } = input;
  const eventDateTime = new Date(payload.eventDateTime);
  if (Number.isNaN(eventDateTime.getTime())) {
    throw new Error("Invalid eventDateTime.");
  }

  const ackDateTime = payload.ackDateTime ? new Date(payload.ackDateTime) : null;
  if (ackDateTime && Number.isNaN(ackDateTime.getTime())) {
    throw new Error("Invalid ackDateTime.");
  }

  const contact = await findContactForAlert(payload);
  const conversation = contact ? await ensureConversationForContact(contact.id) : null;

  if (payload.type === "Clear") {
    const existing = await prisma.alert.findUnique({
      where: {
        externalId_eventDateTime: {
          externalId: payload.id,
          eventDateTime,
        },
      },
    });

    const alert = existing
      ? await prisma.alert.update({
          where: { id: existing.id },
          data: {
            type: AlertType.Clear,
            status: AlertStatus.cleared,
            ackDateTime: ackDateTime ?? new Date(),
            facilityCode: facilityCode ?? existing.facilityCode,
            payload: payload as Prisma.InputJsonValue,
            contactId: contact?.id ?? existing.contactId,
            conversationId: conversation?.id ?? existing.conversationId,
          },
        })
      : await prisma.alert.create({
          data: {
            externalId: payload.id,
            type: AlertType.Clear,
            status: contact ? AlertStatus.cleared : AlertStatus.unmatched,
            eventDateTime,
            ackDateTime: ackDateTime ?? new Date(),
            facilityCode: facilityCode ?? null,
            locationName: payload.location?.name ?? null,
            locationBuilding: payload.location?.building ?? null,
            residentFirstName: payload.resident?.firstName ?? null,
            residentLastName: payload.resident?.lastName ?? null,
            deviceName: payload.device?.name ?? null,
            deviceType: payload.device?.type ?? null,
            payload: payload as Prisma.InputJsonValue,
            contactId: contact?.id ?? null,
            conversationId: conversation?.id ?? null,
          },
        });

    if (conversation) {
      await prisma.message.create({
        data: {
          conversationId: conversation.id,
          body: formatAlertSystemMessage(payload, "Clear"),
          direction: MessageDirection.inbound,
          status: MessageStatus.received,
          isSystemNote: true,
        },
      });
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: {
          lastMessageAt: new Date(),
          status: ConversationStatus.replied,
        },
      });
    }

    return alert;
  }

  const status = contact ? AlertStatus.open : AlertStatus.unmatched;
  const alert = await prisma.alert.upsert({
    where: {
      externalId_eventDateTime: {
        externalId: payload.id,
        eventDateTime,
      },
    },
    create: {
      externalId: payload.id,
      type: AlertType.Alert,
      status,
      eventDateTime,
      facilityCode: facilityCode ?? null,
      locationName: payload.location?.name ?? null,
      locationBuilding: payload.location?.building ?? null,
      residentFirstName: payload.resident?.firstName ?? null,
      residentLastName: payload.resident?.lastName ?? null,
      deviceName: payload.device?.name ?? null,
      deviceType: payload.device?.type ?? null,
      payload: payload as Prisma.InputJsonValue,
      contactId: contact?.id ?? null,
      conversationId: conversation?.id ?? null,
    },
    update: {
      type: AlertType.Alert,
      status,
      facilityCode: facilityCode ?? undefined,
      locationName: payload.location?.name ?? null,
      locationBuilding: payload.location?.building ?? null,
      residentFirstName: payload.resident?.firstName ?? null,
      residentLastName: payload.resident?.lastName ?? null,
      deviceName: payload.device?.name ?? null,
      deviceType: payload.device?.type ?? null,
      payload: payload as Prisma.InputJsonValue,
      contactId: contact?.id ?? null,
      conversationId: conversation?.id ?? null,
    },
  });

  if (conversation) {
    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        body: formatAlertSystemMessage(payload, "Alert"),
        direction: MessageDirection.inbound,
        status: MessageStatus.received,
        isSystemNote: true,
      },
    });
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        lastMessageAt: new Date(),
        status: ConversationStatus.replied,
      },
    });
  }

  return alert;
}
