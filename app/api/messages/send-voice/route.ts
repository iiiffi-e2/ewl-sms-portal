import { ConversationStatus, MessageDirection, MessageStatus, MessageType } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-auth";
import { normalizeToM4a } from "@/lib/audio-normalize";
import {
  CommStackError,
  ensureCommStackUser,
  getContactCommStackConfig,
  hasContactCommStackConfig,
  isCommStackConfigured,
  sendCommStackChannelVoice,
  sendCommStackDirectVoice,
} from "@/lib/commstack";
import { ensureCommStackRealtimeForConfig, startCommStackRealtime } from "@/lib/commstack-realtime";
import { prisma } from "@/lib/prisma";
import {
  VOICE_CONTENT_TYPE,
  VOICE_FILENAME,
  VOICE_MESSAGE_BODY,
  assertValidVoiceDuration,
  serializeMessageForClient,
} from "@/lib/voice-messages";

export async function POST(request: Request) {
  const authResult = await requireSession();
  if ("error" in authResult) {
    return authResult.error;
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid multipart form data." }, { status: 400 });
  }

  const conversationId = String(formData.get("conversationId") ?? "").trim();
  const durationRaw = formData.get("duration");
  const audio = formData.get("audio");

  if (!conversationId) {
    return NextResponse.json({ error: "conversationId is required." }, { status: 400 });
  }

  if (!(audio instanceof File) || audio.size === 0) {
    return NextResponse.json({ error: "audio file is required." }, { status: 400 });
  }

  const duration = Number(durationRaw);
  try {
    assertValidVoiceDuration(duration);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid duration." },
      { status: 400 },
    );
  }

  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: { contact: true },
  });

  if (!conversation || conversation.archivedAt || !conversation.contact) {
    return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
  }

  const contact = conversation.contact;
  if (!contact.notifyClientId && !contact.notifyChannelId) {
    return NextResponse.json(
      { error: "Voice messages are only supported for Notify contacts." },
      { status: 400 },
    );
  }

  let normalized: { data: Buffer; contentType: string; filename: string };
  try {
    const data = Buffer.from(await audio.arrayBuffer());
    normalized = await normalizeToM4a({
      data,
      contentType: audio.type || VOICE_CONTENT_TYPE,
      filename: audio.name || VOICE_FILENAME,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to normalize audio." },
      { status: 400 },
    );
  }

  const queuedMessage = await prisma.message.create({
    data: {
      conversationId: conversation.id,
      userId: authResult.session.user.id,
      body: VOICE_MESSAGE_BODY,
      messageType: MessageType.voice,
      durationSeconds: duration,
      direction: MessageDirection.outbound,
      status: MessageStatus.queued,
    },
  });

  const attachmentBytes = Uint8Array.from(normalized.data);
  const attachment = await prisma.messageAttachment.create({
    data: {
      messageId: queuedMessage.id,
      bytes: attachmentBytes,
      contentType: normalized.contentType,
      filename: normalized.filename,
      sizeBytes: attachmentBytes.byteLength,
    },
  });

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

    const senderName = "EyeWatch LIVE";
    const voiceFile = {
      data: normalized.data,
      filename: normalized.filename,
      contentType: normalized.contentType,
      duration,
      senderName,
    };

    const result = contact.notifyChannelId
      ? await sendCommStackChannelVoice(config, {
          channelId: contact.notifyChannelId,
          ...voiceFile,
        })
      : await (async () => {
          await ensureCommStackUser(config, {
            userId: contact.notifyClientId!,
            name: contact.name,
          });
          return sendCommStackDirectVoice(config, {
            receiverUserId: contact.notifyClientId!,
            ...voiceFile,
          });
        })();

    // Ack may not include a file id; leave attachment.commStackFile null until sync.
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
      message: serializeMessageForClient({
        ...savedMessage,
        attachment: {
          id: attachment.id,
          contentType: attachment.contentType,
          filename: attachment.filename,
          sizeBytes: attachment.sizeBytes,
        },
      }),
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
