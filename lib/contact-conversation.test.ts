import { ConversationStatus } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const contactUpsert = vi.fn();
const conversationFindFirst = vi.fn();
const conversationCreate = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    contact: {
      upsert: (...args: unknown[]) => contactUpsert(...args),
    },
    conversation: {
      findFirst: (...args: unknown[]) => conversationFindFirst(...args),
      create: (...args: unknown[]) => conversationCreate(...args),
    },
  },
}));

import { ensureOpenPhoneConversation } from "@/lib/contact-conversation";

describe("ensureOpenPhoneConversation", () => {
  beforeEach(() => {
    contactUpsert.mockReset();
    conversationFindFirst.mockReset();
    conversationCreate.mockReset();
  });

  it("upserts a contact, restoring deletedAt, and reuses an open conversation", async () => {
    contactUpsert.mockResolvedValue({ id: "contact-1", phone: "+15551234567" });
    conversationFindFirst.mockResolvedValue({ id: "conv-1", contactId: "contact-1" });

    const result = await ensureOpenPhoneConversation("+15551234567");

    expect(contactUpsert).toHaveBeenCalledWith({
      where: { phone: "+15551234567" },
      update: { deletedAt: null },
      create: { phone: "+15551234567" },
    });
    expect(conversationFindFirst).toHaveBeenCalledWith({
      where: {
        contactId: "contact-1",
        status: { not: ConversationStatus.closed },
        archivedAt: null,
      },
      orderBy: { lastMessageAt: "desc" },
    });
    expect(conversationCreate).not.toHaveBeenCalled();
    expect(result.contact.id).toBe("contact-1");
    expect(result.conversation.id).toBe("conv-1");
  });

  it("creates a conversation when the contact has no open thread", async () => {
    contactUpsert.mockResolvedValue({ id: "contact-1", phone: "+15551234567" });
    conversationFindFirst.mockResolvedValue(null);
    conversationCreate.mockResolvedValue({ id: "conv-new", contactId: "contact-1" });

    const result = await ensureOpenPhoneConversation("+15551234567");

    expect(conversationCreate).toHaveBeenCalledWith({
      data: {
        contactId: "contact-1",
        assignedToId: undefined,
        status: ConversationStatus.new,
      },
    });
    expect(result.conversation.id).toBe("conv-new");
  });
});
