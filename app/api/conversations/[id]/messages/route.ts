import { ConversationStatus, ConversationType, MessageDirection, MessageStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api-auth";
import { dbErrorResponse } from "@/lib/api-errors";
import { cacheFor, withDbRetry } from "@/lib/db";
import { isGroupReadyForMessages } from "@/lib/group-conversations";
import { getTwilioClient, getTwilioGroupProjectedAddress } from "@/lib/twilio";
import { sendGroupMessageSchema } from "@/lib/validators";
import { serializeMessageForClient } from "@/lib/voice-messages";

const OLDER_MESSAGES_DEFAULT_LIMIT = 50;
const OLDER_MESSAGES_MAX_LIMIT = 100;

// Cursor-paginated fetch of messages older than a given message id, used by the
// thread's "Load earlier messages" control. Returns ascending (oldest-first).
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireSession();
  if ("error" in authResult) {
    return authResult.error;
  }

  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const cursor = searchParams.get("cursor");
  const limitParam = Number(searchParams.get("limit"));
  const limit =
    Number.isFinite(limitParam) && limitParam > 0
      ? Math.min(Math.trunc(limitParam), OLDER_MESSAGES_MAX_LIMIT)
      : OLDER_MESSAGES_DEFAULT_LIMIT;

  try {
    const conversation = await withDbRetry(() =>
      prisma.conversation.findUnique({
        where: { id },
        select: { id: true, archivedAt: true },
        cacheStrategy: cacheFor({ ttl: 10, swr: 30 }),
      }),
    );

    if (!conversation || conversation.archivedAt) {
      return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
    }

    const rows = await withDbRetry(() =>
      prisma.message.findMany({
        where: { conversationId: id },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        take: limit + 1,
        include: {
          attachment: {
            select: {
              id: true,
              contentType: true,
              filename: true,
              sizeBytes: true,
            },
          },
        },
        // Older messages are historical and effectively immutable, so each
        // cursor page is highly cacheable. This collapses "load earlier"
        // bursts (and re-scrolls across tabs) onto one origin query, keeping
        // the tiny connection pool free for live reads.
        cacheStrategy: cacheFor({ ttl: 30, swr: 300 }),
      }),
    );

    const hasMore = rows.length > limit;
    const page = (hasMore ? rows.slice(0, limit) : rows)
      .reverse()
      .map(serializeMessageForClient);

    return NextResponse.json({ messages: page, hasMore });
  } catch (error) {
    return dbErrorResponse(error);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireSession();
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
