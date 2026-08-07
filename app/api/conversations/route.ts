import { ConversationStatus, ConversationType, Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api-auth";
import { dbErrorResponse } from "@/lib/api-errors";
import { cacheFor, withDbRetry } from "@/lib/db";
import {
  ensureCommStackUser,
  getContactCommStackConfig,
  hasContactCommStackConfig,
  isCommStackConfigured,
  normalizeCommStackBaseUrl,
} from "@/lib/commstack";
import { assertContactIdentityXor } from "@/lib/contact-identity";
import { normalizePhoneNumber } from "@/lib/phone";
import { createConversationSchema } from "@/lib/validators";
import { shouldSearchMessageBodies } from "@/lib/message-search";

function normalizeOptional(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

// Hard cap on how many conversations the inbox list returns. Without this the
// query fetched *every* non-archived conversation, each with a correlated
// "latest messages" subquery — an unbounded, ever-growing scan that eventually
// ran past Accelerate's 10s query limit (P6004), holding a pooled connection
// the whole time and exhausting the tiny connection pool. The inbox only ever
// renders a scrollable recent list, so the newest N by lastMessageAt is plenty.
const CONVERSATION_LIST_LIMIT = 50;

export async function GET(request: Request) {
  const authResult = await requireSession();
  if ("error" in authResult) {
    return authResult.error;
  }

  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim();
  const contactId = searchParams.get("contactId")?.trim();
  const includeArchived = searchParams.get("includeArchived") === "1";
  const typeFilter = searchParams.get("type");

  try {
    const conversations = await withDbRetry(() =>
      prisma.conversation.findMany({
        where: {
          ...(!includeArchived ? { archivedAt: null } : {}),
          ...(contactId ? { contactId } : {}),
          ...(typeFilter === "group"
            ? { type: ConversationType.group }
            : typeFilter === "direct"
              ? { type: ConversationType.direct }
              : {}),
          ...(query
            ? {
                OR: [
                  { contact: { name: { contains: query, mode: "insensitive" } } },
                  { contact: { phone: { contains: query, mode: "insensitive" } } },
                  { contact: { notifyClientId: { contains: query, mode: "insensitive" } } },
                  { contact: { facility: { contains: query, mode: "insensitive" } } },
                  { title: { contains: query, mode: "insensitive" } },
                  { participants: { some: { contact: { name: { contains: query, mode: "insensitive" } } } } },
                  { participants: { some: { contact: { phone: { contains: query } } } } },
                  { participants: { some: { contact: { notifyClientId: { contains: query } } } } },
                  ...(shouldSearchMessageBodies(query)
                    ? [{ messages: { some: { body: { contains: query, mode: "insensitive" as const } } } }]
                    : []),
                ],
              }
            : {}),
        },
        orderBy: { lastMessageAt: "desc" },
        // Bound the result set so the query stays fast and cacheable as the
        // conversation table grows (see CONVERSATION_LIST_LIMIT above).
        take: CONVERSATION_LIST_LIMIT,
        include: {
          contact: true,
          participants: {
            include: { contact: true },
          },
          assignedTo: {
            select: { id: true, name: true, email: true },
          },
          messages: {
            orderBy: { createdAt: "desc" },
            // The list only renders the single latest message as a preview
            // (matched-search snippets come from the separate query below), so
            // fetching one row per conversation avoids a 5x correlated subquery.
            take: 1,
            select: {
              id: true,
              body: true,
              direction: true,
              createdAt: true,
            },
          },
        },
        // Short cache keeps the inbox near-real-time (poll interval is 5s) while
        // deduping many tabs' polls onto one origin query per window.
        cacheStrategy: cacheFor({ ttl: 5, swr: 25 }),
      }),
    );

    let matchedMessages: { conversationId: string; body: string }[] = [];
    if (query && shouldSearchMessageBodies(query) && conversations.length > 0) {
      const ids = conversations.map((conversation) => conversation.id);
      // Escape LIKE wildcards so a literal % or _ in the search term matches literally.
      const likePattern = `%${query.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
      // DISTINCT ON keeps the most recent matching message per conversation
      // (createdAt drives precedence but isn't needed in the payload).
      matchedMessages = await withDbRetry(() =>
        prisma.$queryRaw<{ conversationId: string; body: string }[]>(Prisma.sql`
          SELECT DISTINCT ON ("conversationId") "conversationId", "body"
          FROM "Message"
          WHERE "conversationId" IN (${Prisma.join(ids)})
            AND "body" ILIKE ${likePattern} ESCAPE '\\'
          ORDER BY "conversationId", "createdAt" DESC
        `),
      );
    }

    const matchedByConversation = new Map(
      matchedMessages.map((message) => [message.conversationId, { body: message.body }]),
    );

    const conversationsWithMatches = conversations.map((conversation) => ({
      ...conversation,
      matchedMessage: matchedByConversation.get(conversation.id) ?? null,
    }));

    return NextResponse.json({ conversations: conversationsWithMatches });
  } catch (error) {
    return dbErrorResponse(error);
  }
}

export async function POST(request: Request) {
  const authResult = await requireSession();
  if ("error" in authResult) {
    return authResult.error;
  }

  const payload = await request.json();
  const parsed = createConversationSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  let phone: string | null = null;
  let notifyClientId: string | null = null;
  let normalizedEmergencyPhone: string | null = null;
  try {
    phone = parsed.data.phone?.trim() ? normalizePhoneNumber(parsed.data.phone) : null;
    notifyClientId = parsed.data.notifyClientId?.trim() || null;
    assertContactIdentityXor({ phone, notifyClientId });
    normalizedEmergencyPhone = parsed.data.emergencyContactPhone
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

  const contact = phone
    ? await prisma.contact.upsert({
        where: { phone },
        update: {
          name: parsed.data.name ?? undefined,
          facility: parsed.data.facility ?? undefined,
          address: parsed.data.address ?? undefined,
          notes: parsed.data.notes ?? undefined,
          emergencyContactName: parsed.data.emergencyContactName ?? undefined,
          emergencyContactPhone: normalizedEmergencyPhone ?? undefined,
          commStackAppId: null,
          commStackAppName: null,
          commStackBaseUrl: null,
          commStackPortalUserId: null,
        },
        create: {
          phone,
          name: parsed.data.name ?? null,
          facility: parsed.data.facility ?? null,
          address: parsed.data.address ?? null,
          notes: parsed.data.notes ?? null,
          emergencyContactName: parsed.data.emergencyContactName ?? null,
          emergencyContactPhone: normalizedEmergencyPhone,
        },
      })
    : await prisma.contact.upsert({
        where: { notifyClientId: notifyClientId! },
        update: {
          name: parsed.data.name ?? undefined,
          facility: parsed.data.facility ?? undefined,
          address: parsed.data.address ?? undefined,
          notes: parsed.data.notes ?? undefined,
          emergencyContactName: parsed.data.emergencyContactName ?? undefined,
          emergencyContactPhone: normalizedEmergencyPhone ?? undefined,
          commStackAppId: commStackAppId ?? undefined,
          commStackAppName: commStackAppName ?? undefined,
          commStackBaseUrl: commStackBaseUrl ?? undefined,
          commStackPortalUserId: commStackPortalUserId ?? undefined,
        },
        create: {
          notifyClientId: notifyClientId!,
          name: parsed.data.name ?? null,
          facility: parsed.data.facility ?? null,
          address: parsed.data.address ?? null,
          notes: parsed.data.notes ?? null,
          emergencyContactName: parsed.data.emergencyContactName ?? null,
          emergencyContactPhone: normalizedEmergencyPhone,
          commStackAppId,
          commStackAppName,
          commStackBaseUrl,
          commStackPortalUserId,
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
      console.error("Failed to provision CommStack user for conversation contact", contact.id, error);
    }
  }

  let conversation = await prisma.conversation.findFirst({
    where: {
      contactId: contact.id,
      status: { not: ConversationStatus.closed },
      archivedAt: null,
    },
    orderBy: { lastMessageAt: "desc" },
  });

  if (!conversation) {
    conversation = await prisma.conversation.create({
      data: {
        contactId: contact.id,
        assignedToId: authResult.session.user.id,
        status: ConversationStatus.new,
      },
    });
  }

  const fullConversation = await prisma.conversation.findUnique({
    where: { id: conversation.id },
    include: {
      contact: true,
      assignedTo: {
        select: { id: true, name: true, email: true },
      },
      messages: {
        orderBy: { createdAt: "asc" },
      },
      notes: {
        include: {
          user: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
      },
      callLogs: {
        orderBy: { startedAt: "desc" },
        include: {
          initiatedBy: { select: { id: true, name: true } },
        },
      },
    },
  });

  return NextResponse.json({ conversation: fullConversation }, { status: 201 });
}
