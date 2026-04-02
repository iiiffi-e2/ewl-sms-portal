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
  const hasField = <T extends object>(field: keyof T) =>
    Object.prototype.hasOwnProperty.call(payload, field as string);
  const contact = await prisma.contact.update({
    where: { id },
    data: {
      name: hasField<typeof parsed.data>("name") ? (parsed.data.name ?? null) : undefined,
      phone: hasField<typeof parsed.data>("phone")
        ? parsed.data.phone
          ? normalizePhoneNumber(parsed.data.phone)
          : undefined
        : undefined,
      facility: hasField<typeof parsed.data>("facility") ? (parsed.data.facility ?? null) : undefined,
      address: hasField<typeof parsed.data>("address") ? (parsed.data.address ?? null) : undefined,
      notes: hasField<typeof parsed.data>("notes") ? (parsed.data.notes ?? null) : undefined,
      emergencyContactName: hasField<typeof parsed.data>("emergencyContactName")
        ? (parsed.data.emergencyContactName ?? null)
        : undefined,
      emergencyContactPhone: hasField<typeof parsed.data>("emergencyContactPhone")
        ? parsed.data.emergencyContactPhone
          ? normalizePhoneNumber(parsed.data.emergencyContactPhone)
          : null
        : undefined,
    },
  });

  return NextResponse.json({ contact });
}
