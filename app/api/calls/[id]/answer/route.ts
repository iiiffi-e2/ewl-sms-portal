import { CallStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { canClaimInboundCall } from "@/lib/voice/inbound";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireSession();
  if ("error" in authResult) {
    return authResult.error;
  }

  const { id } = await params;

  const callLog = await prisma.callLog.findUnique({
    where: { id },
    select: {
      id: true,
      direction: true,
      status: true,
      endedAt: true,
      initiatedById: true,
    },
  });

  if (
    !callLog ||
    !canClaimInboundCall({
      direction: callLog.direction,
      status: callLog.status,
      endedAt: callLog.endedAt,
    })
  ) {
    return NextResponse.json({ error: "Call log not found." }, { status: 404 });
  }

  if (callLog.initiatedById && callLog.initiatedById !== authResult.session.user.id) {
    return NextResponse.json({ error: "Call already answered." }, { status: 409 });
  }

  const updated = await prisma.callLog.update({
    where: { id: callLog.id },
    data: {
      initiatedById: authResult.session.user.id,
      status: CallStatus.in_progress,
    },
  });

  return NextResponse.json({ callLog: updated });
}
