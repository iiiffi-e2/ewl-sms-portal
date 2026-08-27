import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { dbErrorResponse } from "@/lib/api-errors";
import {
  MESSAGE_EXPORT_SELECT,
  buildExportFilename,
  buildMessageExportWhere,
  buildMessagesCsv,
  collectExportBatches,
  messageExportQuerySchema,
  toMessageExportRow,
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

  if (parsed.data.conversationId && parsed.data.contactId) {
    try {
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
    } catch (error) {
      return dbErrorResponse(error);
    }
  }

  const where = buildMessageExportWhere(parsed.data);

  try {
    const messages = await collectExportBatches((args) =>
      prisma.message.findMany({
        where,
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        take: args.take,
        ...(args.cursor ? { skip: 1, cursor: { id: args.cursor } } : {}),
        select: MESSAGE_EXPORT_SELECT,
      }),
    );

    if (messages.length === 0) {
      return NextResponse.json({ error: "No messages match these filters." }, { status: 404 });
    }

    const csv = buildMessagesCsv(messages.map(toMessageExportRow));
    const filename = buildExportFilename();

    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    return dbErrorResponse(error);
  }
}
