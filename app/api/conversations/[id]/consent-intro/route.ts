import {
  ConsentEventType,
  ConsentStatus,
  ConversationStatus,
  MessageDirection,
  MessageStatus,
} from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api-auth";
import { getTwilioClient, getTwilioFromNumber } from "@/lib/twilio";
import { OPT_IN_INTRO_TEXT } from "@/lib/consent";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireSession();
  if ("error" in authResult) {
    return authResult.error;
  }

  const { id } = await params;

  const conversation = await prisma.conversation.findUnique({
    where: { id },
    include: { contact: true },
  });

  if (!conversation || conversation.archivedAt) {
    return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
  }

  const contact = conversation.contact;

  if (contact.consentStatus === ConsentStatus.opted_in) {
    return NextResponse.json({ ok: true, alreadyOptedIn: true, conversationId: conversation.id });
  }

  if (contact.consentStatus === ConsentStatus.opted_out) {
    return NextResponse.json(
      { error: "This contact has opted out of SMS messages.", code: "consent_opted_out" },
      { status: 409 },
    );
  }

  const queuedMessage = await prisma.message.create({
    data: {
      conversationId: conversation.id,
      userId: authResult.session.user.id,
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

    const savedMessage = await prisma.message.update({
      where: { id: queuedMessage.id },
      data: { twilioSid: result.sid, status: MessageStatus.sent },
    });

    await prisma.contact.update({
      where: { id: contact.id },
      data: { consentStatus: ConsentStatus.opted_in, consentUpdatedAt: new Date() },
    });

    await prisma.consentEvent.create({
      data: {
        contactId: contact.id,
        messageId: savedMessage.id,
        userId: authResult.session.user.id,
        type: ConsentEventType.intro_sent,
        twilioSid: result.sid,
      },
    });

    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { lastMessageAt: new Date(), status: ConversationStatus.awaiting_reply },
    });

    return NextResponse.json({ message: savedMessage, conversationId: conversation.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to send opt-in intro.";

    await prisma.message.update({
      where: { id: queuedMessage.id },
      data: { status: MessageStatus.failed, errorMessage: message },
    });

    await prisma.consentEvent.create({
      data: {
        contactId: contact.id,
        messageId: queuedMessage.id,
        userId: authResult.session.user.id,
        type: ConsentEventType.intro_failed,
        detail: message,
      },
    });

    return NextResponse.json({ error: message, code: "intro_send_failed" }, { status: 502 });
  }
}
