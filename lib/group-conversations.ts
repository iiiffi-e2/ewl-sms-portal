import {
  ConsentEventType,
  ConsentStatus,
  ConversationStatus,
  MessageDirection,
  MessageStatus,
  ParticipantStatus,
  Prisma,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { OPT_IN_INTRO_TEXT, matchStopKeyword } from "@/lib/consent";
import {
  getTwilioClient,
  getTwilioFromNumber,
  getTwilioGroupProjectedAddress,
  getTwilioMessagingServiceSid,
} from "@/lib/twilio";

type ParticipantLike = { status: "pending_intro" | "active" | "removed" };
type ContactLike = { name: string | null; phone: string | null; notifyClientId?: string | null };

export function countActiveParticipants(participants: ParticipantLike[]): number {
  return participants.filter((p) => p.status === "active").length;
}

export function canActivateTwilioGroup(activeCount: number): boolean {
  return activeCount >= 2;
}

export function isGroupReadyForMessages(twilioConversationSid: string | null | undefined): boolean {
  return Boolean(twilioConversationSid);
}

export function buildDefaultGroupTitle(contacts: ContactLike[]): string {
  const labels = contacts.map((c) => c.name?.trim() || c.phone || c.notifyClientId || "Unknown");
  if (labels.length <= 3) {
    return labels.join(", ");
  }
  return `${labels.slice(0, 3).join(", ")} + ${labels.length - 3} more`;
}

// Twilio adds participants to a brand-new group conversation ASYNCHRONOUSLY
// (state: initializing -> active). Listing participants right after create is
// unreliable, so we do NOT eagerly map twilioParticipantSid here. Instead the
// webhook backfills each participant's SID from the `ParticipantSid` field on
// the first event we receive for them (see Task 7). For STOP removal we either
// have the SID by then or fall back to looking it up by address.
export type GroupActivationResult = { ok: true } | { ok: false; error: string; code?: number };

// Twilio rejects creating a Group MMS whose participant set already maps to an
// existing conversation (error 50438). Surface a clear, actionable message
// instead of leaking the raw SDK error.
function describeTwilioActivationError(error: unknown): { error: string; code?: number } {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? Number((error as { code?: unknown }).code)
      : undefined;
  if (code === 50438) {
    return {
      code,
      error:
        "Twilio already has a group MMS thread with this exact set of phone numbers. " +
        "Group MMS allows only one thread per participant set — remove the existing " +
        "Twilio conversation or change the participants, then try again.",
    };
  }
  const message = error instanceof Error ? error.message : "Failed to activate group on Twilio.";
  return { code, error: message };
}

export async function maybeActivateTwilioGroup(
  conversationId: string,
): Promise<GroupActivationResult> {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: {
      participants: {
        where: { status: ParticipantStatus.active },
        include: { contact: true },
      },
    },
  });

  if (!conversation || conversation.type !== "group") {
    return { ok: true };
  }

  const active = conversation.participants;
  if (!canActivateTwilioGroup(active.length)) {
    return { ok: true };
  }

  if (active.some((p) => !p.contact.phone)) {
    return { ok: false, error: "All active group participants need a phone number." };
  }

  const projectedAddress = conversation.twilioProjectedAddress ?? getTwilioGroupProjectedAddress();
  const client = getTwilioClient();

  if (!conversation.twilioConversationSid) {
    let twilioConversation;
    try {
      // `participant` MUST be an array of stringified JSON (snake_case keys).
      twilioConversation = await client.conversations.v1.conversationWithParticipants.create({
        friendlyName: conversation.title ?? "CareText Group",
        messagingServiceSid: getTwilioMessagingServiceSid(),
        participant: [
          ...active
            .filter((p) => p.contact.phone)
            .map((p) => JSON.stringify({ messaging_binding: { address: p.contact.phone } })),
          JSON.stringify({ messaging_binding: { projected_address: projectedAddress } }),
        ],
      });
    } catch (error) {
      console.error("Failed to create Twilio group conversation:", error);
      return { ok: false, ...describeTwilioActivationError(error) };
    }

    await prisma.conversation.update({
      where: { id: conversationId },
      data: {
        twilioConversationSid: twilioConversation.sid,
        twilioProjectedAddress: projectedAddress,
      },
    });
    return { ok: true };
  }

  // Conversation already exists: add newly-active participants individually.
  // The individual participants.create endpoint DOES use dotted keys.
  const existing = await prisma.conversationParticipant.findMany({
    where: {
      conversationId,
      status: ParticipantStatus.active,
      twilioParticipantSid: null,
    },
    include: { contact: true },
  });

  for (const participant of existing) {
    if (!participant.contact.phone) {
      continue;
    }
    try {
      const created = await client.conversations.v1
        .conversations(conversation.twilioConversationSid)
        .participants.create({ "messagingBinding.address": participant.contact.phone });

      await prisma.conversationParticipant.update({
        where: { id: participant.id },
        data: { twilioParticipantSid: created.sid },
      });
    } catch (error) {
      // Participant may already exist (e.g. retried). Leave SID for webhook backfill.
      console.warn("Failed to add participant to Twilio conversation:", error);
    }
  }

  return { ok: true };
}

export async function sendGroupConsentIntro(params: {
  conversationId: string;
  contactId: string;
  userId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const contact = await prisma.contact.findUnique({ where: { id: params.contactId } });
  if (!contact) {
    return { ok: false, error: "Contact not found." };
  }
  if (!contact.phone) {
    return { ok: false, error: "Contact has no phone number." };
  }
  if (contact.consentStatus === ConsentStatus.opted_out) {
    return { ok: false, error: "Contact opted out." };
  }
  if (contact.consentStatus === ConsentStatus.opted_in) {
    await prisma.conversationParticipant.updateMany({
      where: {
        conversationId: params.conversationId,
        contactId: params.contactId,
        status: ParticipantStatus.pending_intro,
      },
      data: { status: ParticipantStatus.active },
    });
    await maybeActivateTwilioGroup(params.conversationId);
    return { ok: true };
  }

  if (!contact.phone) {
    return { ok: false, error: "Contact is missing a phone number." };
  }

  const queuedMessage = await prisma.message.create({
    data: {
      conversationId: params.conversationId,
      userId: params.userId,
      body: OPT_IN_INTRO_TEXT,
      direction: MessageDirection.outbound,
      status: MessageStatus.queued,
      isConsentIntro: true,
    },
  });

  try {
    const result = await getTwilioClient().messages.create({
      from: getTwilioFromNumber(),
      to: contact.phone,
      body: OPT_IN_INTRO_TEXT,
      statusCallback: `${process.env.NEXTAUTH_URL}/api/webhooks/sms-status`,
    });

    await prisma.$transaction([
      prisma.message.update({
        where: { id: queuedMessage.id },
        data: { twilioSid: result.sid, status: MessageStatus.sent },
      }),
      prisma.contact.update({
        where: { id: contact.id },
        data: { consentStatus: ConsentStatus.opted_in, consentUpdatedAt: new Date() },
      }),
      prisma.conversationParticipant.updateMany({
        where: {
          conversationId: params.conversationId,
          contactId: params.contactId,
        },
        data: { status: ParticipantStatus.active },
      }),
      prisma.consentEvent.create({
        data: {
          contactId: contact.id,
          messageId: queuedMessage.id,
          userId: params.userId,
          type: ConsentEventType.group_intro_sent,
          twilioSid: result.sid,
        },
      }),
      prisma.conversation.update({
        where: { id: params.conversationId },
        data: { lastMessageAt: new Date(), status: ConversationStatus.awaiting_reply },
      }),
    ]);

    await maybeActivateTwilioGroup(params.conversationId);
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to send intro.";
    await prisma.$transaction([
      prisma.message.update({
        where: { id: queuedMessage.id },
        data: { status: MessageStatus.failed, errorMessage: message },
      }),
      prisma.consentEvent.create({
        data: {
          contactId: contact.id,
          messageId: queuedMessage.id,
          userId: params.userId,
          type: ConsentEventType.intro_failed,
          detail: message,
        },
      }),
    ]);
    return { ok: false, error: message };
  }
}

export async function removeGroupParticipantOnStop(params: {
  conversationId: string;
  contactId: string;
  twilioParticipantSid: string | null;
  twilioConversationSid: string;
  twilioMessageSid: string;
  contactName: string | null;
}): Promise<void> {
  const client = getTwilioClient();

  if (params.twilioParticipantSid) {
    try {
      await client.conversations.v1
        .conversations(params.twilioConversationSid)
        .participants(params.twilioParticipantSid)
        .remove();
    } catch {
      // Participant may already be removed on Twilio side.
    }
  }

  const displayName = params.contactName ?? "Contact";

  try {
    await prisma.$transaction([
      prisma.conversationParticipant.updateMany({
        where: { conversationId: params.conversationId, contactId: params.contactId },
        data: { status: ParticipantStatus.removed, removedAt: new Date() },
      }),
      prisma.contact.update({
        where: { id: params.contactId },
        data: { consentStatus: ConsentStatus.opted_out, consentUpdatedAt: new Date() },
      }),
      prisma.consentEvent.create({
        data: {
          contactId: params.contactId,
          type: ConsentEventType.opted_out,
          detail: `STOP in group ${params.conversationId}`,
        },
      }),
      prisma.message.create({
        data: {
          conversationId: params.conversationId,
          body: `${displayName} left the group (STOP).`,
          direction: MessageDirection.inbound,
          status: MessageStatus.received,
          isSystemNote: true,
          twilioConversationSid: params.twilioConversationSid,
          twilioSid: params.twilioMessageSid,
        },
      }),
      prisma.conversation.update({
        where: { id: params.conversationId },
        data: { lastMessageAt: new Date() },
      }),
    ]);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return;
    }
    throw error;
  }
}

export function shouldTreatAsGroupStop(body: string): boolean {
  return matchStopKeyword(body) !== null;
}
