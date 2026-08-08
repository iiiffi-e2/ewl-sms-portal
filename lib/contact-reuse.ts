import { prisma } from "@/lib/prisma";

/** Find a contact by phone, Notify client ID, or channel ID, including active threads. */
export async function findContactByIdentity(identity: {
  phone?: string | null;
  notifyClientId?: string | null;
  notifyChannelId?: string | null;
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

  if (identity.notifyChannelId) {
    return prisma.contact.findUnique({
      where: { notifyChannelId: identity.notifyChannelId },
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
