import { MessageDirection, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type LatestMessagePreview = {
  conversationId: string;
  id: string;
  body: string;
  direction: MessageDirection;
  createdAt: Date;
};

/**
 * Latest message per conversation, one indexed lookup each. A Prisma nested
 * `messages: { take: 1 }` include does not send a per-conversation LIMIT; it
 * reads every message in every listed thread and trims in memory.
 */
export async function loadLatestMessagePreviews(
  conversationIds: string[],
): Promise<LatestMessagePreview[]> {
  if (conversationIds.length === 0) {
    return [];
  }

  return prisma.$queryRaw<LatestMessagePreview[]>(Prisma.sql`
    SELECT c."id" AS "conversationId", lm."id", lm."body", lm."direction"::text AS "direction", lm."createdAt"
    FROM "Conversation" c
    CROSS JOIN LATERAL (
      SELECT m."id", m."body", m."direction", m."createdAt"
      FROM "Message" m
      WHERE m."conversationId" = c."id"
      ORDER BY m."createdAt" DESC
      LIMIT 1
    ) lm
    WHERE c."id" IN (${Prisma.join(conversationIds)})
  `);
}

export function attachLatestMessages<T extends { id: string }>(
  conversations: T[],
  previews: LatestMessagePreview[],
): Array<T & { messages: Omit<LatestMessagePreview, "conversationId">[] }> {
  const byConversation = new Map(
    previews.map(({ conversationId, ...message }) => [conversationId, message]),
  );
  return conversations.map((conversation) => {
    const latest = byConversation.get(conversation.id);
    return { ...conversation, messages: latest ? [latest] : [] };
  });
}
