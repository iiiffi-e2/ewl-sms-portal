import { ConversationStatus, MessageDirection, MessageStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api-auth";
import { normalizePhoneNumber } from "@/lib/phone";
import { sendMessageSchema } from "@/lib/validators";
import { getTwilioClient, getTwilioFromNumber } from "@/lib/twilio";

export async function POST(request: Request) {
  const authResult = await requireSession();
  if ("error" in authResult) {
    return authResult.error;
  }

  const payload = await request.json();
  const parsed = sendMessageSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { conversationId, body, contactName, facility } = parsed.data;
  const normalizedPhone = normalizePhoneNumber(parsed.data.phone);

  const contact = await prisma.contact.upsert({
    where: { phone: normalizedPhone },
    update: {
      name: contactName ?? undefined,
      facility: facility ?? undefined,
    },
    create: {
      phone: normalizedPhone,
      name: contactName ?? null,
      facility: facility ?? null,
    },
  });

  let conversation = conversationId
    ? await prisma.conversation.findUnique({
        where: { id: conversationId },
      })
    : null;

  if (!conversation) {
    conversation = await prisma.conversation.findFirst({
      where: { contactId: contact.id, status: { not: ConversationStatus.closed } },
      orderBy: { lastMessageAt: "desc" },
    });
  }

  if (!conversation) {
    conversation = await prisma.conversation.create({
      data: {
        contactId: contact.id,
        assignedToId: authResult.session.user.id,
        status: ConversationStatus.new,
      },
    });
  }

  const queuedMessage = await prisma.message.create({
    data: {
      conversationId: conversation.id,
      userId: authResult.session.user.id,
      body,
      direction: MessageDirection.outbound,
      status: MessageStatus.queued,
    },
  });

  try {
    const twilioClient = getTwilioClient();
    const result = await twilioClient.messages.create({
      from: getTwilioFromNumber(),
      to: normalizedPhone,
      body,
      statusCallback: `${process.env.NEXTAUTH_URL}/api/webhooks/sms-status`,
    });

    const savedMessage = await prisma.message.update({
      where: { id: queuedMessage.id },
      data: {
        twilioSid: result.sid,
        status: MessageStatus.sent,
      },
    });

    await prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        lastMessageAt: new Date(),
        status: ConversationStatus.awaiting_reply,
      },
    });

    return NextResponse.json({
      message: savedMessage,
      conversationId: conversation.id,
    });
  } catch (error) {
    await prisma.message.update({
      where: { id: queuedMessage.id },
      data: {
        status: MessageStatus.failed,
        errorMessage: error instanceof Error ? error.message : "Failed to send SMS.",
      },
    });

    await prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        lastMessageAt: new Date(),
        status: ConversationStatus.sms_sent,
      },
    });

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to send SMS." },
      { status: 502 },
    );
  }
}
