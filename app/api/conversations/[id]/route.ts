import { NextResponse } from "next/server";
import { requireAdmin, requireSession } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { parseConversationStatus } from "@/lib/status";
import { updateConversationSchema } from "@/lib/validators";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireSession();
  if ("error" in authResult) {
    return authResult.error;
  }

  const { id } = await params;
  const conversation = await prisma.conversation.findUnique({
    where: { id },
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
    },
  });

  if (!conversation) {
    return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
  }

  return NextResponse.json({ conversation });
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
    select: { id: true },
  });

  if (!existingConversation) {
    return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
  }

  await prisma.conversation.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}
