import { ConversationStatus, ConversationType, MessageDirection, MessageStatus, Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getTwilioGroupProjectedAddress } from "@/lib/twilio";
import {
  getWebhookRequestUrl,
  parseTwilioWebhookParams,
  validateTwilioWebhookRequest,
} from "@/lib/voice/webhook";
import { isProjectedAddressAuthor, parseConversationsEvent } from "@/lib/conversations-webhook";
import { removeGroupParticipantOnStop, shouldTreatAsGroupStop } from "@/lib/group-conversations";

export async function POST(request: Request) {
  const signature = request.headers.get("x-twilio-signature");
  const url = getWebhookRequestUrl(request);
  // Form-urlencoded body — reuse the existing parser. Validate the signature
  // against the parsed params (same pattern as the voice webhooks).
  const params = await parseTwilioWebhookParams(request);

  const valid = validateTwilioWebhookRequest({ signature, url, params });

  if (!valid) {
    return NextResponse.json({ error: "Invalid signature." }, { status: 403 });
  }

  const event = parseConversationsEvent(params);
  if (!event) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const projectedAddress = getTwilioGroupProjectedAddress();
  if (isProjectedAddressAuthor(event.Author, projectedAddress)) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const conversation = await prisma.conversation.findFirst({
    where: { twilioConversationSid: event.ConversationSid, type: ConversationType.group },
    include: {
      participants: {
        include: { contact: true },
      },
    },
  });

  if (!conversation) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const existing = await prisma.message.findFirst({
    where: { twilioSid: event.MessageSid },
    select: { id: true },
  });
  if (existing) {
    return NextResponse.json({ ok: true, deduplicated: true });
  }

  const participant = conversation.participants.find(
    (p) =>
      p.twilioParticipantSid === event.ParticipantSid ||
      p.contact.phone === event.Author,
  );

  if (!participant) {
    console.warn("Inbound group message from unknown participant:", event.Author);
    return NextResponse.json({ ok: true, ignored: true });
  }

  // Backfill the Twilio participant SID the first time we see it (it was not
  // available synchronously at group-creation time).
  if (!participant.twilioParticipantSid && event.ParticipantSid) {
    await prisma.conversationParticipant.update({
      where: { id: participant.id },
      data: { twilioParticipantSid: event.ParticipantSid },
    });
    participant.twilioParticipantSid = event.ParticipantSid;
  }

  if (shouldTreatAsGroupStop(event.Body)) {
    await removeGroupParticipantOnStop({
      conversationId: conversation.id,
      contactId: participant.contactId,
      twilioParticipantSid: participant.twilioParticipantSid,
      twilioConversationSid: conversation.twilioConversationSid!,
      twilioMessageSid: event.MessageSid,
      contactName: participant.contact.name,
    });
    return NextResponse.json({ ok: true, stopHandled: true });
  }

  try {
    await prisma.$transaction([
      prisma.message.create({
        data: {
          conversationId: conversation.id,
          body: event.Body,
          direction: MessageDirection.inbound,
          status: MessageStatus.received,
          twilioSid: event.MessageSid,
          twilioConversationSid: event.ConversationSid,
          authorPhone: event.Author,
        },
      }),
      prisma.conversation.update({
        where: { id: conversation.id },
        data: { lastMessageAt: new Date(), status: ConversationStatus.replied },
      }),
    ]);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ ok: true, deduplicated: true });
    }
    throw error;
  }

  return NextResponse.json({ ok: true });
}
