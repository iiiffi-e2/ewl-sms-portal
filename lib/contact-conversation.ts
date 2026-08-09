import { ConversationStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/** Open an existing active direct thread for a contact, or create one. */
export async function ensureConversationForContact(
  contactId: string,
  options?: { assignedToId?: string | null },
) {
  let conversation = await prisma.conversation.findFirst({
    where: {
      contactId,
      status: { not: ConversationStatus.closed },
      archivedAt: null,
    },
    orderBy: { lastMessageAt: "desc" },
  });

  if (!conversation) {
    conversation = await prisma.conversation.create({
      data: {
        contactId,
        assignedToId: options?.assignedToId ?? undefined,
        status: ConversationStatus.new,
      },
    });
  }

  return conversation;
}
