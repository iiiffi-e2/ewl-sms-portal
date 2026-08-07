import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-auth";
import {
  diagnoseCommStackDirectThread,
  isCommStackConfigured,
  isCommStackUserId,
} from "@/lib/commstack";
import { prisma } from "@/lib/prisma";

/**
 * Diagnose whether a Notify contact's UUID is a real CommStack user and whether
 * messages exist in CommStack history for the portal <-> contact pair.
 *
 * GET /api/commstack/diagnose?notifyClientId=<uuid>
 * GET /api/commstack/diagnose?conversationId=<uuid>
 */
export async function GET(request: Request) {
  const authResult = await requireSession();
  if ("error" in authResult) {
    return authResult.error;
  }

  if (!isCommStackConfigured()) {
    return NextResponse.json({ error: "CommStack is not configured." }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  let notifyClientId = searchParams.get("notifyClientId")?.trim() ?? "";
  const conversationId = searchParams.get("conversationId")?.trim() ?? "";

  let contact: {
    id: string;
    name: string | null;
    notifyClientId: string | null;
  } | null = null;

  if (conversationId) {
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        contact: {
          select: { id: true, name: true, notifyClientId: true },
        },
      },
    });
    contact = conversation?.contact ?? null;
    notifyClientId = contact?.notifyClientId?.trim() ?? "";
  } else if (notifyClientId) {
    contact = await prisma.contact.findUnique({
      where: { notifyClientId },
      select: { id: true, name: true, notifyClientId: true },
    });
  }

  if (!notifyClientId) {
    return NextResponse.json(
      {
        error: "Provide notifyClientId or conversationId for a Notify contact.",
      },
      { status: 400 },
    );
  }

  if (!isCommStackUserId(notifyClientId)) {
    return NextResponse.json(
      { error: "notifyClientId must be a valid UUID." },
      { status: 400 },
    );
  }

  try {
    const diagnosis = await diagnoseCommStackDirectThread({ otherUserId: notifyClientId });

    const localMessages = contact
      ? await prisma.message.findMany({
          where: {
            conversation: { contactId: contact.id },
          },
          orderBy: { createdAt: "desc" },
          take: 10,
          select: {
            id: true,
            body: true,
            direction: true,
            status: true,
            commStackMessageId: true,
            createdAt: true,
            errorMessage: true,
          },
        })
      : [];

    return NextResponse.json({
      contact,
      ...diagnosis,
      localRecentMessages: localMessages,
      interpretation: {
        careTextSentMeans:
          "CareText 'sent' means CommStack accepted the request (ackId). It does not prove a Notify handset received it.",
        nextStepIfOtherUserMissing:
          "Use the real Notify app/device user UUID as the contact Notify client ID. Random UUIDs we create only create empty CommStack users with no device session.",
        nextStepIfHistoryHasOutbound:
          "Message is stored in CommStack. If the device still does not show it, confirm that device is logged in as this exact userId in this same appId.",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Diagnosis failed.",
      },
      { status: 502 },
    );
  }
}
