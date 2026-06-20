import { ConversationStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api-auth";
import { normalizePhoneNumber } from "@/lib/phone";
import { createConversationSchema } from "@/lib/validators";

export async function GET(request: Request) {
  const authResult = await requireSession();
  if ("error" in authResult) {
    return authResult.error;
  }

  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim();

  const conversations = await prisma.conversation.findMany({
    where: {
      archivedAt: null,
      ...(query
        ? {
            OR: [
              { contact: { name: { contains: query, mode: "insensitive" } } },
              { contact: { phone: { contains: query, mode: "insensitive" } } },
              { contact: { facility: { contains: query, mode: "insensitive" } } },
              { title: { contains: query, mode: "insensitive" } },
              { participants: { some: { contact: { name: { contains: query, mode: "insensitive" } } } } },
              { participants: { some: { contact: { phone: { contains: query } } } } },
            ],
          }
        : {}),
    },
    orderBy: { lastMessageAt: "desc" },
    include: {
      contact: true,
      participants: {
        include: { contact: true },
      },
      assignedTo: {
        select: { id: true, name: true, email: true },
      },
      messages: {
        orderBy: { createdAt: "desc" },
        take: 5,
        select: {
          id: true,
          body: true,
          direction: true,
          createdAt: true,
        },
      },
    },
  });

  return NextResponse.json({ conversations });
}

export async function POST(request: Request) {
  const authResult = await requireSession();
  if ("error" in authResult) {
    return authResult.error;
  }

  const payload = await request.json();
  const parsed = createConversationSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const normalizedPhone = normalizePhoneNumber(parsed.data.phone);
  const normalizedEmergencyPhone = parsed.data.emergencyContactPhone
    ? normalizePhoneNumber(parsed.data.emergencyContactPhone)
    : null;

  const contact = await prisma.contact.upsert({
    where: { phone: normalizedPhone },
    update: {
      name: parsed.data.name ?? undefined,
      facility: parsed.data.facility ?? undefined,
      address: parsed.data.address ?? undefined,
      notes: parsed.data.notes ?? undefined,
      emergencyContactName: parsed.data.emergencyContactName ?? undefined,
      emergencyContactPhone: normalizedEmergencyPhone ?? undefined,
    },
    create: {
      phone: normalizedPhone,
      name: parsed.data.name ?? null,
      facility: parsed.data.facility ?? null,
      address: parsed.data.address ?? null,
      notes: parsed.data.notes ?? null,
      emergencyContactName: parsed.data.emergencyContactName ?? null,
      emergencyContactPhone: normalizedEmergencyPhone,
    },
  });

  let conversation = await prisma.conversation.findFirst({
    where: {
      contactId: contact.id,
      status: { not: ConversationStatus.closed },
      archivedAt: null,
    },
    orderBy: { lastMessageAt: "desc" },
  });

  if (!conversation) {
    conversation = await prisma.conversation.create({
      data: {
        contactId: contact.id,
        assignedToId: authResult.session.user.id,
        status: ConversationStatus.new,
      },
    });
  }

  const fullConversation = await prisma.conversation.findUnique({
    where: { id: conversation.id },
    include: {
      contact: true,
      assignedTo: {
        select: { id: true, name: true, email: true },
      },
      messages: {
        orderBy: { createdAt: "asc" },
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
  });

  return NextResponse.json({ conversation: fullConversation }, { status: 201 });
}
