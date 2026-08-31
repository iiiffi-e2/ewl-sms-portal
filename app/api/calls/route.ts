import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { ACTIVE_CONTACT_WHERE } from "@/lib/contact-soft-delete";
import {
  decorateCallLogsWithContacts,
  parseCallLogListLimit,
  parseCallLogListPage,
  VISIBLE_CALL_LOG_WHERE,
} from "@/lib/voice/call-log-list";

export async function GET(request: Request) {
  const authResult = await requireSession();
  if ("error" in authResult) {
    return authResult.error;
  }

  const { searchParams } = new URL(request.url);
  const take = parseCallLogListLimit(searchParams.get("limit"));
  const page = parseCallLogListPage(searchParams.get("page"));
  const skip = (page - 1) * take;

  const [total, logs] = await prisma.$transaction([
    prisma.callLog.count({ where: VISIBLE_CALL_LOG_WHERE }),
    prisma.callLog.findMany({
      where: VISIBLE_CALL_LOG_WHERE,
      orderBy: { startedAt: "desc" },
      skip,
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
    }),
  ]);

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

  return NextResponse.json({
    callLogs: decorateCallLogsWithContacts(logs, contactsByPhone),
    page,
    pageSize: take,
    total,
  });
}
