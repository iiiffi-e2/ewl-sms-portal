import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { normalizePhoneNumber } from "@/lib/phone";
import { createContactSchema } from "@/lib/validators";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireSession();
  if ("error" in authResult) {
    return authResult.error;
  }

  const payload = await request.json();
  const parsed = createContactSchema.partial().safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { id } = await params;
  const contact = await prisma.contact.update({
    where: { id },
    data: {
      name: parsed.data.name ?? undefined,
      phone: parsed.data.phone ? normalizePhoneNumber(parsed.data.phone) : undefined,
      facility: parsed.data.facility ?? undefined,
      notes: parsed.data.notes ?? undefined,
      emergencyContactName: parsed.data.emergencyContactName ?? undefined,
      emergencyContactPhone: parsed.data.emergencyContactPhone
        ? normalizePhoneNumber(parsed.data.emergencyContactPhone)
        : undefined,
    },
  });

  return NextResponse.json({ contact });
}
