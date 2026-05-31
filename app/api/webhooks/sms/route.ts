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
import { normalizePhoneNumber } from "@/lib/phone";
import { getTwilioClient, getTwilioFromNumber } from "@/lib/twilio";
import { OPT_IN_INTRO_TEXT, matchStartKeyword, matchStopKeyword } from "@/lib/consent";

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

  const contact = await prisma.contact.upsert({
    where: { phone: normalizedPhone },
    update: {},
    create: { phone: normalizedPhone },
  });

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
        lastMessageAt: new Date(),
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
    const queuedMessage = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        body: OPT_IN_INTRO_TEXT,
        direction: MessageDirection.outbound,
        status: MessageStatus.queued,
        isConsentIntro: true,
      },
    });

    try {
      const twilioClient = getTwilioClient();
      const result = await twilioClient.messages.create({
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
      const detail =
        error instanceof Error ? error.message : "Failed to send resubscribe disclosure.";

      await prisma.$transaction([
        prisma.message.update({
          where: { id: queuedMessage.id },
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
    }
  }

  return NextResponse.json({ ok: true });
}
