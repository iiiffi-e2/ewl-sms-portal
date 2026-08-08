import { ConversationStatus, MessageDirection, MessageStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api-auth";
import {
  CommStackError,
  ensureCommStackUser,
  getContactCommStackConfig,
  hasContactCommStackConfig,
  isCommStackConfigured,
  sendCommStackChannelMessage,
  sendCommStackDirectMessage,
} from "@/lib/commstack";
import { ensureCommStackRealtimeForConfig, startCommStackRealtime } from "@/lib/commstack-realtime";
import { evaluateOutboundConsent } from "@/lib/consent";
import { isNotifyContact } from "@/lib/contact-identity";
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

  let conversation = conversationId
    ? await prisma.conversation.findUnique({
        where: { id: conversationId },
        include: { contact: true },
      })
    : null;

  if (conversation?.archivedAt) {
    conversation = null;
  }

  let contact = conversation?.contact ?? null;

  if (!contact && parsed.data.notifyClientId) {
    const notifyClientId = parsed.data.notifyClientId.trim();
    contact = await prisma.contact.findUnique({ where: { notifyClientId } });
    if (!contact) {
      return NextResponse.json(
        {
          error:
            "Notify contact not found. Create the contact with CommStack settings before messaging.",
        },
        { status: 400 },
      );
    }
    if (contactName || facility) {
      contact = await prisma.contact.update({
        where: { id: contact.id },
        data: {
          name: contactName ?? undefined,
          facility: facility ?? undefined,
        },
      });
    }
  }

  if (!contact && parsed.data.notifyChannelId) {
    const notifyChannelId = parsed.data.notifyChannelId.trim();
    contact = await prisma.contact.findUnique({ where: { notifyChannelId } });
    if (!contact) {
      return NextResponse.json(
        {
          error:
            "Notify channel contact not found. Create the contact with CommStack settings before messaging.",
        },
        { status: 400 },
      );
    }
    if (contactName || facility) {
      contact = await prisma.contact.update({
        where: { id: contact.id },
        data: {
          name: contactName ?? undefined,
          facility: facility ?? undefined,
        },
      });
    }
  }

  if (!contact && parsed.data.phone) {
    const normalizedPhone = normalizePhoneNumber(parsed.data.phone);
    contact = await prisma.contact.upsert({
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
  }

  if (!contact) {
    return NextResponse.json({ error: "Contact not found for this message." }, { status: 400 });
  }

  const notify = isNotifyContact(contact);

  if (!notify) {
    const consentDecision = evaluateOutboundConsent(contact.consentStatus);
    if (!consentDecision.allowed) {
      return NextResponse.json(
        { error: consentDecision.error, code: consentDecision.code },
        { status: 409 },
      );
    }
  }

  if (!conversation) {
    conversation = await prisma.conversation.findFirst({
      where: {
        contactId: contact.id,
        status: { not: ConversationStatus.closed },
        archivedAt: null,
      },
      orderBy: { lastMessageAt: "desc" },
      include: { contact: true },
    });
  }

  if (!conversation) {
    conversation = await prisma.conversation.create({
      data: {
        contactId: contact.id,
        assignedToId: authResult.session.user.id,
        status: ConversationStatus.new,
      },
      include: { contact: true },
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

  if (notify) {
    if (!isCommStackConfigured()) {
      await prisma.message.update({
        where: { id: queuedMessage.id },
        data: {
          status: MessageStatus.failed,
          errorMessage: "CommStack is not configured. Set COMM_STACK_ENV.",
        },
      });
      return NextResponse.json(
        { error: "CommStack is not configured. Set COMM_STACK_ENV." },
        { status: 503 },
      );
    }

    if (!hasContactCommStackConfig(contact)) {
      await prisma.message.update({
        where: { id: queuedMessage.id },
        data: {
          status: MessageStatus.failed,
          errorMessage: "Notify contact is missing CommStack settings.",
        },
      });
      return NextResponse.json(
        { error: "Notify contact is missing CommStack settings." },
        { status: 400 },
      );
    }

    try {
      const config = getContactCommStackConfig(contact);

      // Keep the portal realtime socket alive so replies can arrive after send.
      void ensureCommStackRealtimeForConfig(config).catch((error) => {
        console.error("[commstack] realtime ensure-on-send failed", error);
      });
      void startCommStackRealtime().catch((error) => {
        console.error("[commstack] realtime ensure-all-on-send failed", error);
      });

      const senderName = authResult.session.user.name ?? "EyeWatch LIVE®";
      const result = contact.notifyChannelId
        ? await sendCommStackChannelMessage(config, {
            channelId: contact.notifyChannelId,
            text: body,
            senderName,
          })
        : await (async () => {
            await ensureCommStackUser(config, {
              userId: contact.notifyClientId!,
              name: contact.name,
            });
            return sendCommStackDirectMessage(config, {
              receiverUserId: contact.notifyClientId!,
              text: body,
              senderName,
            });
          })();

      // Per Notify SDK 1.2, ackId is the stored message id (matches realtime message_id).
      const savedMessage = await prisma.message.update({
        where: { id: queuedMessage.id },
        data: {
          commStackMessageId: result.messageId,
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
      const message =
        error instanceof CommStackError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Failed to send Notify message.";

      await prisma.message.update({
        where: { id: queuedMessage.id },
        data: {
          status: MessageStatus.failed,
          errorMessage: message,
        },
      });

      await prisma.conversation.update({
        where: { id: conversation.id },
        data: {
          lastMessageAt: new Date(),
          status: ConversationStatus.sms_sent,
        },
      });

      return NextResponse.json({ error: message }, { status: 502 });
    }
  }

  if (!contact.phone) {
    return NextResponse.json({ error: "Contact is missing a phone number." }, { status: 400 });
  }

  try {
    const twilioClient = getTwilioClient();
    const result = await twilioClient.messages.create({
      from: getTwilioFromNumber(),
      to: contact.phone,
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
