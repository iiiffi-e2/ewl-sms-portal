import { ConversationStatus, MessageDirection, MessageStatus } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizePhoneNumber } from "@/lib/phone";

export async function POST(request: Request) {
  const payload = await request.formData();
  const from = payload.get("From")?.toString();
  const body = payload.get("Body")?.toString()?.trim();
  const messageSid = payload.get("MessageSid")?.toString();

  if (!from || !body || !messageSid) {
    return NextResponse.json({ error: "Invalid webhook payload." }, { status: 400 });
  }

  const normalizedPhone = normalizePhoneNumber(from);

  const existing = await prisma.message.findUnique({
    where: { twilioSid: messageSid },
    select: { id: true },
  });

  if (existing) {
    return NextResponse.json({ ok: true, deduplicated: true });
  }

  const contact = await prisma.contact.upsert({
    where: { phone: normalizedPhone },
    update: {},
    create: { phone: normalizedPhone },
  });

  let conversation = await prisma.conversation.findFirst({
    where: { contactId: contact.id, status: { not: ConversationStatus.closed } },
    orderBy: { lastMessageAt: "desc" },
  });

  if (!conversation) {
    conversation = await prisma.conversation.create({
      data: {
        contactId: contact.id,
        status: ConversationStatus.new,
        lastMessageAt: new Date(),
      },
    });
  }

  try {
    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        body,
        direction: MessageDirection.inbound,
        status: MessageStatus.received,
        twilioSid: messageSid,
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ ok: true, deduplicated: true });
    }
    throw error;
  }

  await prisma.conversation.update({
    where: { id: conversation.id },
    data: {
      lastMessageAt: new Date(),
      status: ConversationStatus.replied,
    },
  });

  return NextResponse.json({ ok: true });
}
