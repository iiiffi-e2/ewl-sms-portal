import {
  ConsentEventType,
  ConsentStatus,
  ConversationStatus,
  MessageDirection,
  MessageStatus,
} from "@prisma/client";
import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureOpenPhoneConversation } from "@/lib/contact-conversation";
import { normalizePhoneNumber } from "@/lib/phone";
import { getTwilioClient, getTwilioFromNumber } from "@/lib/twilio";
import { OPT_IN_INTRO_TEXT, matchStartKeyword, matchStopKeyword } from "@/lib/consent";
import { buildSmsStatusCallbackUrl } from "@/lib/status";

export async function POST(request: Request) {
  const payload = await request.formData();
  const from = payload.get("From")?.toString();
  const body = payload.get("Body")?.toString()?.trim();
  const messageSid = payload.get("MessageSid")?.toString();

  if (!from || !body || !messageSid) {
    return NextResponse.json({ error: "Invalid webhook payload." }, { status: 400 });
  }

  const normalizedPhone = normalizePhoneNumber(from);

  const existing = await prisma.message.findUnique({
    where: { twilioSid: messageSid },
    select: { id: true },
  });

  if (existing) {
    return NextResponse.json({ ok: true, deduplicated: true });
  }

  const { contact, conversation } = await ensureOpenPhoneConversation(normalizedPhone);

  const stopKeyword = matchStopKeyword(body);
  const startKeyword = matchStartKeyword(body);
  // A START keyword reopens the gate, but only once the disclosure has actually
  // been re-sent below (accept-on-send), so capture the pre-message status here.
  const shouldResubscribe = Boolean(startKeyword) && contact.consentStatus === ConsentStatus.opted_out;
  if (stopKeyword && contact.consentStatus !== ConsentStatus.opted_out) {
    await prisma.contact.update({
      where: { id: contact.id },
      data: { consentStatus: ConsentStatus.opted_out, consentUpdatedAt: new Date() },
    });
    await prisma.consentEvent.create({
      data: {
        contactId: contact.id,
        type: ConsentEventType.opted_out,
        detail: stopKeyword,
      },
    });
  }

  try {
    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        body,
        direction: MessageDirection.inbound,
        status: MessageStatus.received,
        twilioSid: messageSid,
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ ok: true, deduplicated: true });
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

  // A previously opted-out contact texted a START keyword. Re-send the disclosure
  // and only reopen the gate (opted_in) once Twilio accepts it. If the send fails,
  // the contact stays opted_out so we never reopen without a disclosure going out.
  if (shouldResubscribe) {
    if (!contact.phone) {
      return NextResponse.json({ ok: true });
    }

    const queuedMessage = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        body: OPT_IN_INTRO_TEXT,
        direction: MessageDirection.outbound,
        status: MessageStatus.queued,
        isConsentIntro: true,
      },
    });

    let result: { sid: string };
    try {
      const twilioClient = getTwilioClient();
      result = await twilioClient.messages.create({
        from: getTwilioFromNumber(),
        to: normalizedPhone,
        body: OPT_IN_INTRO_TEXT,
        statusCallback: buildSmsStatusCallbackUrl(queuedMessage.id),
      });
    } catch (error) {
      const detail =
        error instanceof Error ? error.message : "Failed to send resubscribe disclosure.";

      await prisma.$transaction([
        prisma.message.updateMany({
          where: { id: queuedMessage.id, status: MessageStatus.queued },
          data: { status: MessageStatus.failed, errorMessage: detail },
        }),
        prisma.consentEvent.create({
          data: {
            contactId: contact.id,
            messageId: queuedMessage.id,
            type: ConsentEventType.intro_failed,
            detail,
          },
        }),
      ]);
      return NextResponse.json({ ok: true });
    }

    try {
      await prisma.$transaction([
        prisma.message.updateMany({
          where: {
            id: queuedMessage.id,
            status: { in: [MessageStatus.queued, MessageStatus.sent] },
          },
          data: { twilioSid: result.sid, status: MessageStatus.sent },
        }),
        prisma.message.updateMany({
          where: { id: queuedMessage.id, twilioSid: null },
          data: { twilioSid: result.sid },
        }),
        prisma.contact.update({
          where: { id: contact.id },
          data: { consentStatus: ConsentStatus.opted_in, consentUpdatedAt: new Date() },
        }),
        prisma.consentEvent.create({
          data: {
            contactId: contact.id,
            messageId: queuedMessage.id,
            type: ConsentEventType.resubscribed,
            twilioSid: result.sid,
            detail: startKeyword,
          },
        }),
        prisma.conversation.update({
          where: { id: conversation.id },
          data: { lastMessageAt: new Date(), status: ConversationStatus.awaiting_reply },
        }),
      ]);
    } catch (error) {
      console.error("[sms] resubscribe persist failed after Twilio accept", error);
    }
  }

  return NextResponse.json({ ok: true });
}
