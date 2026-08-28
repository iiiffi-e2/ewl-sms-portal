import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export async function POST() {
  const authResult = await requireSession();
  if ("error" in authResult) {
    return authResult.error;
  }

  const now = new Date();
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

  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const authResult = await requireSession();
  if ("error" in authResult) {
    return authResult.error;
  }

  await prisma.voicePresence.deleteMany({
    where: { userId: authResult.session.user.id },
  });

  return NextResponse.json({ ok: true });
}
