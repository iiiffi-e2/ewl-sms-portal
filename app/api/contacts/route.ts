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
import {
  contactHasActiveConversation,
  findContactByIdentity,
} from "@/lib/contact-reuse";
import { createContactSchema } from "@/lib/validators";
import { requireSession } from "@/lib/api-auth";

function normalizeOptional(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

async function provisionNotifyUser(contact: {
  id: string;
  name: string | null;
  notifyClientId: string | null;
  commStackAppId: string | null;
  commStackAppName: string | null;
  commStackBaseUrl: string | null;
  commStackPortalUserId: string | null;
}) {
  if (
    !contact.notifyClientId ||
    !isCommStackConfigured() ||
    !hasContactCommStackConfig(contact)
  ) {
    return;
  }

  try {
    const config = getContactCommStackConfig(contact);
    await ensureCommStackUser(config, {
      userId: contact.notifyClientId,
      name: contact.name,
    });
  } catch (error) {
    // Contact is saved locally even if CommStack provisioning fails; send will retry.
    console.error("Failed to provision CommStack user for contact", contact.id, error);
  }
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
              { notifyChannelId: { contains: q, mode: "insensitive" } },
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
  let notifyChannelId: string | null = null;
  let emergencyContactPhone: string | null;
  try {
    phone = parsed.data.phone?.trim() ? normalizePhoneNumber(parsed.data.phone) : null;
    notifyClientId = parsed.data.notifyClientId?.trim() || null;
    notifyChannelId = parsed.data.notifyChannelId?.trim() || null;
    assertContactIdentityXor({ phone, notifyClientId, notifyChannelId });
    emergencyContactPhone = parsed.data.emergencyContactPhone
      ? normalizePhoneNumber(parsed.data.emergencyContactPhone)
      : null;
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid contact identity." },
      { status: 400 },
    );
  }

  const isNotify = Boolean(notifyClientId || notifyChannelId);
  const contactData = {
    name: parsed.data.name ?? null,
    phone,
    notifyClientId,
    notifyChannelId,
    facility: parsed.data.facility ?? null,
    address: parsed.data.address ?? null,
    notes: parsed.data.notes ?? null,
    emergencyContactName: parsed.data.emergencyContactName ?? null,
    emergencyContactPhone,
    commStackAppId: isNotify ? normalizeOptional(parsed.data.commStackAppId) : null,
    commStackAppName: isNotify ? normalizeOptional(parsed.data.commStackAppName) : null,
    commStackBaseUrl: isNotify
      ? normalizeOptional(parsed.data.commStackBaseUrl)
        ? normalizeCommStackBaseUrl(parsed.data.commStackBaseUrl!)
        : null
      : null,
    commStackPortalUserId: isNotify
      ? normalizeOptional(parsed.data.commStackPortalUserId)
      : null,
  };

  const existing = await findContactByIdentity({ phone, notifyClientId, notifyChannelId });
  if (existing) {
    if (contactHasActiveConversation(existing)) {
      return NextResponse.json(
        {
          error: notifyChannelId
            ? "An active conversation already exists for this Notify channel ID."
            : notifyClientId
              ? "An active conversation already exists for this Notify client ID."
              : "An active conversation already exists for this phone number.",
        },
        { status: 409 },
      );
    }

    const contact = await prisma.contact.update({
      where: { id: existing.id },
      data: contactData,
    });
    await provisionNotifyUser(contact);
    return NextResponse.json({ contact, reused: true }, { status: 200 });
  }

  try {
    const contact = await prisma.contact.create({
      data: contactData,
    });

    await provisionNotifyUser(contact);

    return NextResponse.json({ contact }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json(
        {
          error: notifyChannelId
            ? "A contact with this Notify channel ID already exists."
            : notifyClientId
              ? "A contact with this Notify client ID already exists."
              : "A contact with this phone number already exists.",
        },
        { status: 409 },
      );
    }
    throw error;
  }
}
