import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-auth";
import { dbErrorResponse } from "@/lib/api-errors";
import { prisma } from "@/lib/prisma";

export async function POST() {
  const authResult = await requireSession();
  if ("error" in authResult) {
    return authResult.error;
  }

  const now = new Date();
  try {
    await prisma.voicePresence.upsert({
      where: { userId: authResult.session.user.id },
      create: {
        userId: authResult.session.user.id,
        lastSeenAt: now,
      },
      update: {
        lastSeenAt: now,
      },
    });
  } catch (error) {
    return dbErrorResponse(error);
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const authResult = await requireSession();
  if ("error" in authResult) {
    return authResult.error;
  }

  try {
    await prisma.voicePresence.deleteMany({
      where: { userId: authResult.session.user.id },
    });
  } catch (error) {
    return dbErrorResponse(error);
  }

  return NextResponse.json({ ok: true });
}
