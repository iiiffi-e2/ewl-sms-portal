import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizePhoneNumber } from "@/lib/phone";
import {
  ensureCommStackUser,
  getContactCommStackConfig,
  hasContactCommStackConfig,
  isCommStackConfigured,
  normalizeCommStackBaseUrl,
} from "@/lib/commstack";
import { assertContactIdentityXor } from "@/lib/contact-identity";
import { createContactSchema } from "@/lib/validators";
import { requireSession } from "@/lib/api-auth";

function normalizeOptional(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export async function GET(request: Request) {
  const authResult = await requireSession();
  if ("error" in authResult) {
    return authResult.error;
  }

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim();
  const smsOnly = searchParams.get("smsOnly") === "1";

  const contacts = await prisma.contact.findMany({
    where: {
      ...(smsOnly ? { phone: { not: null } } : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { phone: { contains: q, mode: "insensitive" } },
              { notifyClientId: { contains: q, mode: "insensitive" } },
              { facility: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
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

  let phone: string | null = null;
  let notifyClientId: string | null = null;
  let emergencyContactPhone: string | null;
  try {
    phone = parsed.data.phone?.trim() ? normalizePhoneNumber(parsed.data.phone) : null;
    notifyClientId = parsed.data.notifyClientId?.trim() || null;
    assertContactIdentityXor({ phone, notifyClientId });
    emergencyContactPhone = parsed.data.emergencyContactPhone
      ? normalizePhoneNumber(parsed.data.emergencyContactPhone)
      : null;
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid contact identity." },
      { status: 400 },
    );
  }

  const isNotify = Boolean(notifyClientId);
  const commStackAppId = isNotify ? normalizeOptional(parsed.data.commStackAppId) : null;
  const commStackAppName = isNotify ? normalizeOptional(parsed.data.commStackAppName) : null;
  const commStackBaseUrl = isNotify
    ? normalizeOptional(parsed.data.commStackBaseUrl)
      ? normalizeCommStackBaseUrl(parsed.data.commStackBaseUrl!)
      : null
    : null;
  const commStackPortalUserId = isNotify
    ? normalizeOptional(parsed.data.commStackPortalUserId)
    : null;

  try {
    const contact = await prisma.contact.create({
      data: {
        name: parsed.data.name ?? null,
        phone,
        notifyClientId,
        facility: parsed.data.facility ?? null,
        address: parsed.data.address ?? null,
        notes: parsed.data.notes ?? null,
        emergencyContactName: parsed.data.emergencyContactName ?? null,
        emergencyContactPhone,
        commStackAppId,
        commStackAppName,
        commStackBaseUrl,
        commStackPortalUserId,
      },
    });

    if (
      notifyClientId &&
      isCommStackConfigured() &&
      hasContactCommStackConfig(contact)
    ) {
      try {
        const config = getContactCommStackConfig(contact);
        await ensureCommStackUser(config, {
          userId: notifyClientId,
          name: contact.name,
        });
      } catch (error) {
        // Contact is saved locally even if CommStack provisioning fails; send will retry.
        console.error("Failed to provision CommStack user for contact", contact.id, error);
      }
    }

    return NextResponse.json({ contact }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json(
        { error: "A contact with this phone number or Notify client ID already exists." },
        { status: 409 },
      );
    }
    throw error;
  }
}
