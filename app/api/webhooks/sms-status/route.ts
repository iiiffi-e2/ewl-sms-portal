import { ConsentEventType, MessageStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { mapTwilioStatusToMessageStatus } from "@/lib/status";

export async function POST(request: Request) {
  const payload = await request.formData();

  const messageSid = payload.get("MessageSid")?.toString();
  const twilioStatus = payload.get("MessageStatus")?.toString();
  const errorMessage = payload.get("ErrorMessage")?.toString() ?? null;

  if (!messageSid || !twilioStatus) {
    return NextResponse.json({ error: "Invalid webhook payload." }, { status: 400 });
  }

  const message = await prisma.message.findUnique({
    where: { twilioSid: messageSid },
    select: {
      id: true,
      isConsentIntro: true,
      twilioSid: true,
      conversation: { select: { contactId: true } },
    },
  });

  if (!message) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const mappedStatus = mapTwilioStatusToMessageStatus(twilioStatus);

  await prisma.message.update({
    where: { id: message.id },
    data: {
      status: mappedStatus,
      errorMessage,
    },
  });

  if (
    message.isConsentIntro &&
    (mappedStatus === MessageStatus.delivered || mappedStatus === MessageStatus.failed)
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
          twilioSid: message.twilioSid,
          detail: errorMessage,
        },
      });
    }
  }

  return NextResponse.json({ ok: true });
}
