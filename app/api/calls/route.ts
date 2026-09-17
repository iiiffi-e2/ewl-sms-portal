import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { ACTIVE_CONTACT_WHERE } from "@/lib/contact-soft-delete";
import {
  buildCallLogListWhere,
  decorateCallLogsWithContacts,
  parseCallLogListLimit,
  parseCallLogListPage,
  parseCallLogListQuery,
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

  const parsed = parseCallLogListQuery({
    q: searchParams.get("q"),
    startedFrom: searchParams.get("startedFrom"),
    startedTo: searchParams.get("startedTo"),
    minDurationSeconds: searchParams.get("minDurationSeconds"),
    maxDurationSeconds: searchParams.get("maxDurationSeconds"),
    status: searchParams.get("status"),
  });

  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  let contactPhones: string[] = [];
  if (parsed.query.q) {
    const named = await prisma.contact.findMany({
      where: {
        ...ACTIVE_CONTACT_WHERE,
        name: { contains: parsed.query.q, mode: "insensitive" },
        phone: { not: null },
      },
      select: { phone: true },
    });
    contactPhones = named
      .map((contact) => contact.phone)
      .filter((phone): phone is string => Boolean(phone));
  }

  const where = buildCallLogListWhere(parsed.query, contactPhones);

  const [total, logs] = await prisma.$transaction([
    prisma.callLog.count({ where }),
    prisma.callLog.findMany({
      where,
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
