import { ConsentStatus, ConversationStatus, ConversationType, ParticipantStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api-auth";
import { buildDefaultGroupTitle, maybeActivateTwilioGroup, sendGroupConsentIntro } from "@/lib/group-conversations";
import { createGroupConversationSchema } from "@/lib/validators";

export async function POST(request: Request) {
  const authResult = await requireSession();
  if ("error" in authResult) {
    return authResult.error;
  }

  const payload = await request.json();
  const parsed = createGroupConversationSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const uniqueContactIds = [...new Set(parsed.data.contactIds)];
  const contacts = await prisma.contact.findMany({
    where: { id: { in: uniqueContactIds } },
  });

  if (contacts.length !== uniqueContactIds.length) {
    return NextResponse.json({ error: "One or more contacts were not found." }, { status: 400 });
  }

  const optedOut = contacts.filter((c) => c.consentStatus === ConsentStatus.opted_out);
  if (optedOut.length > 0) {
    return NextResponse.json(
      {
        error: "One or more contacts have opted out and cannot be added to a group.",
        code: "consent_opted_out",
        contacts: optedOut.map((c) => ({ id: c.id, name: c.name, phone: c.phone })),
      },
      { status: 409 },
    );
  }

  const title = parsed.data.title?.trim() || buildDefaultGroupTitle(contacts);

  const conversation = await prisma.conversation.create({
    data: {
      type: ConversationType.group,
      title,
      assignedToId: authResult.session.user.id,
      status: ConversationStatus.new,
      participants: {
        create: contacts.map((contact) => ({
          contactId: contact.id,
          status:
            contact.consentStatus === ConsentStatus.opted_in
              ? ParticipantStatus.active
              : ParticipantStatus.pending_intro,
        })),
      },
    },
    include: {
      participants: { include: { contact: true } },
      assignedTo: { select: { id: true, name: true } },
      messages: { orderBy: { createdAt: "asc" } },
    },
  });

  const introErrors: Array<{ contactId: string; error: string }> = [];
  for (const participant of conversation.participants) {
    if (participant.status === ParticipantStatus.pending_intro) {
      const introResult = await sendGroupConsentIntro({
        conversationId: conversation.id,
        contactId: participant.contactId,
        userId: authResult.session.user.id,
      });
      if (!introResult.ok) {
        introErrors.push({ contactId: participant.contactId, error: introResult.error });
      }
    }
  }

  await maybeActivateTwilioGroup(conversation.id);

  const full = await prisma.conversation.findUnique({
    where: { id: conversation.id },
    include: {
      participants: { include: { contact: true } },
      assignedTo: { select: { id: true, name: true } },
      messages: { orderBy: { createdAt: "asc" } },
    },
  });

  return NextResponse.json(
    { conversation: full, introErrors: introErrors.length > 0 ? introErrors : undefined },
    { status: 201 },
  );
}
