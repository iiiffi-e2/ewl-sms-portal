import { ConversationStatus, ConversationType, MessageDirection, MessageStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/api-auth";
import { isGroupReadyForMessages } from "@/lib/group-conversations";
import { getTwilioClient, getTwilioGroupProjectedAddress } from "@/lib/twilio";
import { sendGroupMessageSchema } from "@/lib/validators";

// Group messaging is dark-launched: gated to admins until it ships in the main UI.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireAdmin();
  if ("error" in authResult) {
    return authResult.error;
  }

  const { id } = await params;
  const payload = await request.json();
  const parsed = sendGroupMessageSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const conversation = await prisma.conversation.findUnique({ where: { id } });
  if (!conversation || conversation.archivedAt || conversation.type !== ConversationType.group) {
    return NextResponse.json({ error: "Group conversation not found." }, { status: 404 });
  }

  if (!isGroupReadyForMessages(conversation.twilioConversationSid)) {
    return NextResponse.json(
      {
        error: "Group is not ready — waiting for participant opt-in.",
        code: "group_not_ready",
      },
      { status: 409 },
    );
  }

  const projectedAddress = conversation.twilioProjectedAddress ?? getTwilioGroupProjectedAddress();
  const { body } = parsed.data;

  const queuedMessage = await prisma.message.create({
    data: {
      conversationId: conversation.id,
      userId: authResult.session.user.id,
      body,
      direction: MessageDirection.outbound,
      status: MessageStatus.queued,
      twilioConversationSid: conversation.twilioConversationSid,
    },
  });

  try {
    const result = await getTwilioClient().conversations.v1
      .conversations(conversation.twilioConversationSid!)
      .messages.create({ author: projectedAddress, body });

    const savedMessage = await prisma.message.update({
      where: { id: queuedMessage.id },
      data: { twilioSid: result.sid, status: MessageStatus.sent },
    });

    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { lastMessageAt: new Date(), status: ConversationStatus.awaiting_reply },
    });

    return NextResponse.json({ message: savedMessage, conversationId: conversation.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to send group message.";
    await prisma.message.update({
      where: { id: queuedMessage.id },
      data: { status: MessageStatus.failed, errorMessage: message },
    });
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
