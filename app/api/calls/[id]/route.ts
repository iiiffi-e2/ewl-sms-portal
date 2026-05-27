import { CallStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { updateCallLogSchema } from "@/lib/validators";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireSession();
  if ("error" in authResult) {
    return authResult.error;
  }

  const { id } = await params;
  const payload = await request.json();
  const parsed = updateCallLogSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const callLog = await prisma.callLog.findUnique({
    where: { id },
    select: { id: true, initiatedById: true, status: true, endedAt: true },
  });

  if (!callLog || callLog.initiatedById !== authResult.session.user.id) {
    return NextResponse.json({ error: "Call log not found." }, { status: 404 });
  }

  if (callLog.endedAt) {
    return NextResponse.json({ callLog });
  }

  const updated = await prisma.callLog.update({
    where: { id },
    data: {
      status: parsed.data.status === "canceled" ? CallStatus.canceled : CallStatus.failed,
      endedAt: new Date(),
      outcome: parsed.data.status,
    },
  });

  return NextResponse.json({ callLog: updated });
}
