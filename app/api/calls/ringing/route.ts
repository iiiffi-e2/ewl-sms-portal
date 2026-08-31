import { CallDirection, CallStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const authResult = await requireSession();
  if ("error" in authResult) {
    return authResult.error;
  }

  const callLog = await prisma.callLog.findFirst({
    where: {
      direction: CallDirection.inbound,
      status: CallStatus.ringing,
      endedAt: null,
    },
    orderBy: { startedAt: "desc" },
    select: {
      id: true,
      conversationId: true,
      phone: true,
      conversation: {
        select: {
          contact: {
            select: { name: true },
          },
        },
      },
    },
  });

  if (!callLog) {
    return NextResponse.json({ callLog: null });
  }

  return NextResponse.json({
    callLog: {
      callLogId: callLog.id,
      conversationId: callLog.conversationId,
      phone: callLog.phone,
      contactName: callLog.conversation?.contact?.name ?? null,
    },
  });
}
