import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { normalizePhoneNumber } from "@/lib/phone";

const callLogSchema = z.object({
  conversationId: z.string().uuid().optional().nullable(),
  phone: z.string().min(8),
});

export async function POST(request: Request) {
  const authResult = await requireSession();
  if ("error" in authResult) {
    return authResult.error;
  }

  const payload = await request.json();
  const parsed = callLogSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const callLog = await prisma.callLog.create({
    data: {
      conversationId: parsed.data.conversationId ?? null,
      phone: normalizePhoneNumber(parsed.data.phone),
      initiatedById: authResult.session.user.id,
      startedAt: new Date(),
    },
  });

  return NextResponse.json({ callLog }, { status: 201 });
}
