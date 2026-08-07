import { ConversationType } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireAdmin, requireSession } from "@/lib/api-auth";
import { dbErrorResponse } from "@/lib/api-errors";
import { cacheFor, withDbRetry } from "@/lib/db";
import { prisma } from "@/lib/prisma";
import { parseConversationStatus } from "@/lib/status";
import { getTwilioClient } from "@/lib/twilio";
import { updateConversationSchema } from "@/lib/validators";

// Only the most recent slice of a thread is returned on load; older messages
// are fetched on demand via GET /api/conversations/[id]/messages. This keeps the
// payload small and fast even for very long threads.
const MESSAGE_PAGE_SIZE = 50;

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireSession();
  if ("error" in authResult) {
    return authResult.error;
  }

  const { id } = await params;
  // After CommStack sync (or other writes), clients pass fresh=1 so Accelerate
  // cannot serve a pre-sync snapshot of the thread.
  const fresh = new URL(request.url).searchParams.get("fresh") === "1";

  try {
    const conversation = await withDbRetry(() =>
      prisma.conversation.findUnique({
        where: { id },
        include: {
          contact: true,
          participants: {
            include: { contact: true },
            orderBy: { createdAt: "asc" },
          },
          assignedTo: {
            select: { id: true, name: true, email: true },
          },
          messages: {
            orderBy: { createdAt: "desc" },
            take: MESSAGE_PAGE_SIZE + 1,
          },
          notes: {
            include: {
              user: { select: { id: true, name: true } },
            },
            orderBy: { createdAt: "desc" },
          },
          callLogs: {
            orderBy: { startedAt: "desc" },
            include: {
              initiatedBy: { select: { id: true, name: true } },
            },
          },
        },
        // Very short cache to dedupe bursts when the same thread is open in many
        // tabs; the client merges messages by id so brief staleness is harmless.
        // Skip when the caller needs a post-write view (e.g. after Notify sync).
        ...(fresh ? {} : { cacheStrategy: cacheFor({ ttl: 3, swr: 15 }) }),
      }),
    );

    if (!conversation) {
      return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
    }

    if (conversation.archivedAt) {
      return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
    }

    // We over-fetch by one to detect whether older messages exist, then return the
    // recent page in ascending (oldest-first) order for rendering.
    const hasMoreMessages = conversation.messages.length > MESSAGE_PAGE_SIZE;
    const recentMessages = (
      hasMoreMessages ? conversation.messages.slice(0, MESSAGE_PAGE_SIZE) : conversation.messages
    ).reverse();

    return NextResponse.json({
      conversation: { ...conversation, messages: recentMessages, hasMoreMessages },
    });
  } catch (error) {
    return dbErrorResponse(error);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireSession();
  if ("error" in authResult) {
    return authResult.error;
  }

  const { id } = await params;
  const payload = await request.json();
  const parsed = updateConversationSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  if (
    parsed.data.assignedToId !== undefined &&
    authResult.session.user.role !== "admin"
  ) {
    return NextResponse.json({ error: "Only admins can assign conversations." }, { status: 403 });
  }

  const existingConversation = await prisma.conversation.findUnique({
    where: { id },
    select: { id: true, archivedAt: true },
  });

  if (!existingConversation || existingConversation.archivedAt) {
    return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
  }

  const conversation = await prisma.conversation.update({
    where: { id },
    data: {
      status: parsed.data.status ? parseConversationStatus(parsed.data.status) : undefined,
      assignedToId: parsed.data.assignedToId,
    },
  });

  return NextResponse.json({ conversation });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireAdmin();
  if ("error" in authResult) {
    return authResult.error;
  }

  const { id } = await params;
  const existingConversation = await prisma.conversation.findUnique({
    where: { id },
    select: { id: true, archivedAt: true, type: true, twilioConversationSid: true },
  });

  if (!existingConversation || existingConversation.archivedAt) {
    return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
  }

  // Group MMS threads are keyed by participant set on Twilio's side, so deleting
  // the Twilio conversation frees that set for reuse. Best-effort: don't block the
  // archive if Twilio already removed it (or the call fails).
  if (
    existingConversation.type === ConversationType.group &&
    existingConversation.twilioConversationSid
  ) {
    try {
      await getTwilioClient()
        .conversations.v1.conversations(existingConversation.twilioConversationSid)
        .remove();
    } catch (error) {
      console.error("Failed to delete Twilio group conversation:", error);
    }
  }

  await prisma.conversation.update({
    where: { id },
    data: { archivedAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}
