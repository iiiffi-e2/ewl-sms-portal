import { ConsentEventType, MessageStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { dbErrorResponse } from "@/lib/api-errors";
import { prisma } from "@/lib/prisma";
import {
  canAdvanceMessageStatus,
  mapTwilioStatusToMessageStatus,
  planTwilioMessageStatusWrite,
  shouldRecordConsentStatusEvent,
} from "@/lib/status";

export async function POST(request: Request) {
  try {
    const payload = await request.formData();

    const messageSid = payload.get("MessageSid")?.toString();
    const twilioStatus = payload.get("MessageStatus")?.toString();
    const errorMessage = payload.get("ErrorMessage")?.toString() ?? null;
    const messageId = new URL(request.url).searchParams.get("messageId")?.trim() || null;

    if (!messageSid || !twilioStatus) {
      return NextResponse.json({ error: "Invalid webhook payload." }, { status: 400 });
    }

    const messageSelect = {
      id: true,
      status: true,
      isConsentIntro: true,
      twilioSid: true,
      conversation: { select: { contactId: true } },
    } as const;

    const loadMessage = async () => {
      const bySid = await prisma.message.findUnique({
        where: { twilioSid: messageSid },
        select: messageSelect,
      });
      if (bySid) return bySid;
      if (!messageId) return null;
      const byId = await prisma.message.findUnique({
        where: { id: messageId },
        select: messageSelect,
      });
      if (byId && (!byId.twilioSid || byId.twilioSid === messageSid)) {
        return byId;
      }
      return null;
    };

    const mappedStatus = mapTwilioStatusToMessageStatus(twilioStatus);
    let message = await loadMessage();
    if (!message) {
      return NextResponse.json({ ok: true, ignored: true });
    }

    // Re-read when a concurrent send-route write changes `queued` → `sent`
    // between our read and the conditional update. Otherwise a `delivered`
    // callback can be dropped on the floor while we still return 200.
    let applied = false;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const plan = planTwilioMessageStatusWrite({
        currentStatus: message.status,
        incomingStatus: mappedStatus,
        currentSid: message.twilioSid,
        incomingSid: messageSid,
        errorMessage,
      });

      if (!plan) break;

      if (plan.kind === "status") {
        const result = await prisma.message.updateMany({
          where: {
            id: message.id,
            status: message.status,
            ...(message.twilioSid ? { twilioSid: message.twilioSid } : { twilioSid: null }),
          },
          data: {
            status: plan.status,
            errorMessage: plan.errorMessage,
            ...(plan.twilioSid ? { twilioSid: plan.twilioSid } : {}),
          },
        });
        if (result.count > 0) {
          applied = true;
          break;
        }
      } else {
        const result = await prisma.message.updateMany({
          where: { id: message.id, twilioSid: null },
          data: { twilioSid: plan.twilioSid },
        });
        applied = result.count > 0;
        break;
      }

      const latest = await loadMessage();
      if (!latest) break;
      message = latest;
    }

    if (!applied && canAdvanceMessageStatus(message.status, mappedStatus)) {
      return NextResponse.json({ error: "Status update conflict." }, { status: 503 });
    }

    if (
      (applied || message.status === mappedStatus) &&
      shouldRecordConsentStatusEvent({
        isConsentIntro: message.isConsentIntro,
        currentStatus: message.status,
        incomingStatus: mappedStatus,
      })
    ) {
      const eventType =
        mappedStatus === MessageStatus.delivered
          ? ConsentEventType.intro_delivered
          : ConsentEventType.intro_failed;

      // The intro message may belong to a group conversation (the conversation's
      // contactId is null for groups), so resolve the contact from the original
      // intro event instead of the conversation.
      const introEvent = await prisma.consentEvent.findFirst({
        where: {
          messageId: message.id,
          type: { in: [ConsentEventType.intro_sent, ConsentEventType.group_intro_sent] },
        },
        select: { contactId: true },
      });
      const contactId = introEvent?.contactId ?? message.conversation.contactId;

      // Twilio may resend the same terminal status; only record the first one
      // so the audit log keeps one delivery event per intro message.
      const existingEvent = await prisma.consentEvent.findFirst({
        where: { messageId: message.id, type: eventType },
        select: { id: true },
      });

      if (contactId && !existingEvent) {
        await prisma.consentEvent.create({
          data: {
            contactId,
            messageId: message.id,
            type: eventType,
            twilioSid: messageSid,
            detail: errorMessage,
          },
        });
      }
    }

    return NextResponse.json({ ok: true, applied });
  } catch (error) {
    return dbErrorResponse(error);
  }
}
