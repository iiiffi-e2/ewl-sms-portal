import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import {
  buildExportFilename,
  buildMessagesCsv,
  messageExportQuerySchema,
  parseExportDateBoundaries,
  type MessageExportRow,
} from "@/lib/message-export";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const authResult = await requireAdmin();
  if ("error" in authResult) {
    return authResult.error;
  }

  const { searchParams } = new URL(request.url);
  const parsed = messageExportQuerySchema.safeParse({
    startDate: searchParams.get("startDate") ?? undefined,
    endDate: searchParams.get("endDate") ?? undefined,
    contactId: searchParams.get("contactId") ?? undefined,
    conversationId: searchParams.get("conversationId") ?? undefined,
  });

  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Invalid export filters.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const { start, end } = parseExportDateBoundaries(parsed.data);

  if (parsed.data.conversationId && parsed.data.contactId) {
    const conversation = await prisma.conversation.findUnique({
      where: { id: parsed.data.conversationId },
      select: { contactId: true },
    });

    if (!conversation || conversation.contactId !== parsed.data.contactId) {
      return NextResponse.json(
        { error: "Conversation does not belong to the selected contact." },
        { status: 400 },
      );
    }
  }

  const createdAtFilter: Prisma.DateTimeFilter | undefined =
    start || end
      ? {
          ...(start ? { gte: start } : {}),
          ...(end ? { lte: end } : {}),
        }
      : undefined;

  const messages = await prisma.message.findMany({
    where: {
      ...(createdAtFilter ? { createdAt: createdAtFilter } : {}),
      ...(parsed.data.conversationId
        ? { conversationId: parsed.data.conversationId }
        : {}),
      ...(parsed.data.contactId
        ? { conversation: { contactId: parsed.data.contactId } }
        : {}),
    },
    orderBy: { createdAt: "asc" },
    include: {
      user: { select: { name: true } },
      conversation: {
        include: {
          contact: {
            select: {
              name: true,
              phone: true,
              facility: true,
            },
          },
        },
      },
    },
  });

  if (messages.length === 0) {
    return NextResponse.json({ error: "No messages match these filters." }, { status: 404 });
  }

  const rows: MessageExportRow[] = messages.map((message) => ({
    createdAt: message.createdAt,
    direction: message.direction,
    status: message.status,
    body: message.body,
    contactName: message.conversation.contact?.name ?? message.conversation.title ?? "",
    contactPhone: message.conversation.contact?.phone ?? message.authorPhone ?? "",
    facility: message.conversation.contact?.facility ?? "",
    sentBy: message.direction === "outbound" ? (message.user?.name ?? "") : "",
    conversationId: message.conversationId,
  }));

  const csv = buildMessagesCsv(rows);
  const filename = buildExportFilename();

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
