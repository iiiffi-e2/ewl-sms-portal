import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizePhoneNumber } from "@/lib/phone";
import { createContactSchema } from "@/lib/validators";
import { requireSession } from "@/lib/api-auth";

export async function GET(request: Request) {
  const authResult = await requireSession();
  if ("error" in authResult) {
    return authResult.error;
  }

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim();

  const contacts = await prisma.contact.findMany({
    where: q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { phone: { contains: q, mode: "insensitive" } },
            { facility: { contains: q, mode: "insensitive" } },
          ],
        }
      : undefined,
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json({ contacts });
}

export async function POST(request: Request) {
  const authResult = await requireSession();
  if ("error" in authResult) {
    return authResult.error;
  }

  const payload = await request.json();
  const parsed = createContactSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const contact = await prisma.contact.create({
    data: {
      name: parsed.data.name ?? null,
      phone: normalizePhoneNumber(parsed.data.phone),
      facility: parsed.data.facility ?? null,
      address: parsed.data.address ?? null,
      notes: parsed.data.notes ?? null,
      emergencyContactName: parsed.data.emergencyContactName ?? null,
      emergencyContactPhone: parsed.data.emergencyContactPhone
        ? normalizePhoneNumber(parsed.data.emergencyContactPhone)
        : null,
    },
  });

  return NextResponse.json({ contact }, { status: 201 });
}
