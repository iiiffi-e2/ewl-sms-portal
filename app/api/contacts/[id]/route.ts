import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-auth";
import {
  ensureCommStackUser,
  getContactCommStackConfig,
  hasContactCommStackConfig,
  isCommStackConfigured,
  normalizeCommStackBaseUrl,
} from "@/lib/commstack";
import { assertContactIdentityXor } from "@/lib/contact-identity";
import { isSoftDeleted } from "@/lib/contact-soft-delete";
import { prisma } from "@/lib/prisma";
import { normalizePhoneNumber } from "@/lib/phone";
import { updateContactSchema } from "@/lib/validators";

function normalizeOptional(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function assertNotifyContactComplete(contact: {
  name: string | null;
  notifyClientId: string | null;
  notifyChannelId: string | null;
  phone: string | null;
  commStackAppId: string | null;
  commStackAppName: string | null;
  commStackBaseUrl: string | null;
  commStackPortalUserId: string | null;
}) {
  if (!contact.notifyClientId && !contact.notifyChannelId) return;
  if (!contact.name?.trim()) {
    throw new Error("Name is required for Notify contacts.");
  }
  if (!hasContactCommStackConfig(contact)) {
    throw new Error(
      "Notify contacts require COMM_STACK_APP_ID, COMM_STACK_APP_NAME, COMM_STACK_BASE_URL, and COMM_STACK_PORTAL_USER_ID.",
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await requireSession();
  if ("error" in authResult) {
    return authResult.error;
  }

  const { id } = await params;
  const existing = await prisma.contact.findUnique({ where: { id } });
  if (!existing || isSoftDeleted(existing)) {
    return NextResponse.json({ error: "Contact not found." }, { status: 404 });
  }

  const contact = await prisma.contact.update({
    where: { id },
    data: { deletedAt: new Date() },
  });

  return NextResponse.json({ contact });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireSession();
  if ("error" in authResult) {
    return authResult.error;
  }

  const payload = await request.json();
  const parsed = updateContactSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { id } = await params;
  const existing = await prisma.contact.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Contact not found." }, { status: 404 });
  }

  const hasField = <T extends object>(field: keyof T) =>
    Object.prototype.hasOwnProperty.call(payload, field as string);

  let nextPhone = existing.phone;
  let nextNotifyClientId = existing.notifyClientId;
  let nextNotifyChannelId = existing.notifyChannelId;

  try {
    if (hasField<typeof parsed.data>("phone")) {
      nextPhone = parsed.data.phone?.trim() ? normalizePhoneNumber(parsed.data.phone) : null;
    }
    if (hasField<typeof parsed.data>("notifyClientId")) {
      nextNotifyClientId = parsed.data.notifyClientId?.trim() || null;
    }
    if (hasField<typeof parsed.data>("notifyChannelId")) {
      nextNotifyChannelId = parsed.data.notifyChannelId?.trim() || null;
    }
    assertContactIdentityXor({
      phone: nextPhone,
      notifyClientId: nextNotifyClientId,
      notifyChannelId: nextNotifyChannelId,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid contact identity." },
      { status: 400 },
    );
  }

  const isNotify = Boolean(nextNotifyClientId || nextNotifyChannelId);
  const identityTouched =
    hasField<typeof parsed.data>("phone") ||
    hasField<typeof parsed.data>("notifyClientId") ||
    hasField<typeof parsed.data>("notifyChannelId");
  const nextName = hasField<typeof parsed.data>("name")
    ? (parsed.data.name ?? null)
    : existing.name;

  let nextAppId = existing.commStackAppId;
  let nextAppName = existing.commStackAppName;
  let nextBaseUrl = existing.commStackBaseUrl;
  let nextPortalUserId = existing.commStackPortalUserId;

  if (!isNotify) {
    nextAppId = null;
    nextAppName = null;
    nextBaseUrl = null;
    nextPortalUserId = null;
  } else {
    if (hasField<typeof parsed.data>("commStackAppId")) {
      nextAppId = normalizeOptional(parsed.data.commStackAppId);
    }
    if (hasField<typeof parsed.data>("commStackAppName")) {
      nextAppName = normalizeOptional(parsed.data.commStackAppName);
    }
    if (hasField<typeof parsed.data>("commStackBaseUrl")) {
      const raw = normalizeOptional(parsed.data.commStackBaseUrl);
      nextBaseUrl = raw ? normalizeCommStackBaseUrl(raw) : null;
    }
    if (hasField<typeof parsed.data>("commStackPortalUserId")) {
      nextPortalUserId = normalizeOptional(parsed.data.commStackPortalUserId);
    }
  }

  try {
    assertNotifyContactComplete({
      name: nextName,
      phone: nextPhone,
      notifyClientId: nextNotifyClientId,
      notifyChannelId: nextNotifyChannelId,
      commStackAppId: nextAppId,
      commStackAppName: nextAppName,
      commStackBaseUrl: nextBaseUrl,
      commStackPortalUserId: nextPortalUserId,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid Notify contact." },
      { status: 400 },
    );
  }

  try {
    const contact = await prisma.contact.update({
      where: { id },
      data: {
        name: hasField<typeof parsed.data>("name") ? (parsed.data.name ?? null) : undefined,
        phone: identityTouched ? nextPhone : undefined,
        notifyClientId: identityTouched ? nextNotifyClientId : undefined,
        notifyChannelId: identityTouched ? nextNotifyChannelId : undefined,
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
        commStackAppId: nextAppId,
        commStackAppName: nextAppName,
        commStackBaseUrl: nextBaseUrl,
        commStackPortalUserId: nextPortalUserId,
      },
    });

    if (
      contact.notifyClientId &&
      isCommStackConfigured() &&
      hasContactCommStackConfig(contact)
    ) {
      try {
        const config = getContactCommStackConfig(contact);
        await ensureCommStackUser(config, {
          userId: contact.notifyClientId,
          name: contact.name,
        });
      } catch (error) {
        console.error("Failed to provision CommStack user for contact", contact.id, error);
      }
    }

    return NextResponse.json({ contact });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json(
        {
          error:
            "A contact with this phone number, Notify client ID, or channel ID already exists.",
        },
        { status: 409 },
      );
    }
    throw error;
  }
}
