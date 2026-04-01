import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { createNoteSchema } from "@/lib/validators";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireSession();
  if ("error" in authResult) {
    return authResult.error;
  }

  const { id } = await params;
  const notes = await prisma.internalNote.findMany({
    where: { conversationId: id },
    include: {
      user: {
        select: { id: true, name: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ notes });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireSession();
  if ("error" in authResult) {
    return authResult.error;
  }

  const payload = await request.json();
  const parsed = createNoteSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { id } = await params;
  const note = await prisma.internalNote.create({
    data: {
      conversationId: id,
      userId: authResult.session.user.id,
      body: parsed.data.body,
    },
    include: {
      user: {
        select: { id: true, name: true },
      },
    },
  });

  return NextResponse.json({ note }, { status: 201 });
}
