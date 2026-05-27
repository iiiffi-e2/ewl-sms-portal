import { CallDirection, CallMode, CallStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { normalizePhoneNumber } from "@/lib/phone";
import { activeCallWhere, expireStaleActiveCalls } from "@/lib/voice/calls";
import { initiateCallSchema } from "@/lib/validators";

export async function POST(request: Request) {
  const authResult = await requireSession();
  if ("error" in authResult) {
    return authResult.error;
  }

  const payload = await request.json();
  const parsed = initiateCallSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const normalizedPhone = normalizePhoneNumber(parsed.data.phone);

  const conversation = await prisma.conversation.findFirst({
    where: {
      id: parsed.data.conversationId,
      archivedAt: null,
      contact: { phone: normalizedPhone },
    },
    select: { id: true },
  });

  if (!conversation) {
    return NextResponse.json({ error: "Conversation not found for phone." }, { status: 404 });
  }

  await expireStaleActiveCalls(authResult.session.user.id);

  const activeCall = await prisma.callLog.findFirst({
    where: activeCallWhere(authResult.session.user.id),
    select: { id: true },
  });

  if (activeCall) {
    return NextResponse.json({ error: "You already have an active call." }, { status: 409 });
  }

  const callLog = await prisma.callLog.create({
    data: {
      conversationId: conversation.id,
      phone: normalizedPhone,
      initiatedById: authResult.session.user.id,
      direction: CallDirection.outbound,
      mode: CallMode.browser,
      status: CallStatus.initiating,
      startedAt: new Date(),
    },
  });

  return NextResponse.json({ callLogId: callLog.id }, { status: 201 });
}
