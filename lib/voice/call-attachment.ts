import { ConversationStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type CallAttachment = {
  conversationId: string | null;
  contactId: string | null;
  contactName: string | null;
};

export async function resolveCallAttachment(normalizedPhone: string): Promise<CallAttachment> {
  const contact = await prisma.contact.findFirst({
    where: { phone: normalizedPhone, deletedAt: null },
    select: { id: true, name: true },
  });

  if (!contact) {
    return { conversationId: null, contactId: null, contactName: null };
  }

  const conversation = await prisma.conversation.findFirst({
    where: {
      contactId: contact.id,
      status: { not: ConversationStatus.closed },
      archivedAt: null,
    },
    orderBy: { lastMessageAt: "desc" },
    select: { id: true },
  });

  return {
    conversationId: conversation?.id ?? null,
    contactId: contact.id,
    contactName: contact.name,
  };
}
