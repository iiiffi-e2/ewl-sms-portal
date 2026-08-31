import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { ACTIVE_CONTACT_WHERE } from "@/lib/contact-soft-delete";
import { decorateCallLogsWithContacts, parseCallLogListLimit } from "@/lib/voice/call-log-list";

export async function GET(request: Request) {
  const authResult = await requireSession();
  if ("error" in authResult) {
    return authResult.error;
  }

  const { searchParams } = new URL(request.url);
  const take = parseCallLogListLimit(searchParams.get("limit"));

  const logs = await prisma.callLog.findMany({
    orderBy: { startedAt: "desc" },
    take,
    select: {
      id: true,
      phone: true,
      direction: true,
      status: true,
      outcome: true,
      durationSeconds: true,
      startedAt: true,
      endedAt: true,
      conversationId: true,
      initiatedBy: { select: { id: true, name: true } },
    },
  });

  const phones = [...new Set(logs.map((log) => log.phone))];
  const contacts = phones.length
    ? await prisma.contact.findMany({
        where: { ...ACTIVE_CONTACT_WHERE, phone: { in: phones } },
        select: { id: true, name: true, phone: true },
      })
    : [];

  const contactsByPhone = new Map(
    contacts.flatMap((contact) =>
      contact.phone ? [[contact.phone, { id: contact.id, name: contact.name }] as const] : [],
    ),
  );

  return NextResponse.json({ callLogs: decorateCallLogsWithContacts(logs, contactsByPhone) });
}
