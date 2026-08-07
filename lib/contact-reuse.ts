import { prisma } from "@/lib/prisma";

/** Find a contact by phone or Notify client ID, including whether it has an active thread. */
export async function findContactByIdentity(identity: {
  phone?: string | null;
  notifyClientId?: string | null;
}) {
  if (identity.phone) {
    return prisma.contact.findUnique({
      where: { phone: identity.phone },
      include: {
        conversations: {
          where: { archivedAt: null },
          select: { id: true },
          take: 1,
        },
      },
    });
  }

  if (identity.notifyClientId) {
    return prisma.contact.findUnique({
      where: { notifyClientId: identity.notifyClientId },
      include: {
        conversations: {
          where: { archivedAt: null },
          select: { id: true },
          take: 1,
        },
      },
    });
  }

  return null;
}

export function contactHasActiveConversation(contact: {
  conversations: Array<{ id: string }>;
}): boolean {
  return contact.conversations.length > 0;
}
