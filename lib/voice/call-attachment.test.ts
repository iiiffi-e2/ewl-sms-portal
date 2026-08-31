import { ConversationStatus } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const contactFindFirst = vi.fn();
const conversationFindFirst = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    contact: {
      findFirst: (...args: unknown[]) => contactFindFirst(...args),
    },
    conversation: {
      findFirst: (...args: unknown[]) => conversationFindFirst(...args),
    },
  },
}));

import { resolveCallAttachment } from "@/lib/voice/call-attachment";

describe("resolveCallAttachment", () => {
  beforeEach(() => {
    contactFindFirst.mockReset();
    conversationFindFirst.mockReset();
  });

  it("attaches to an active contact with an open direct thread", async () => {
    contactFindFirst.mockResolvedValue({ id: "contact-1", name: "Ada" });
    conversationFindFirst.mockResolvedValue({ id: "conv-1" });

    await expect(resolveCallAttachment("+15551234567")).resolves.toEqual({
      conversationId: "conv-1",
      contactId: "contact-1",
      contactName: "Ada",
    });

    expect(contactFindFirst).toHaveBeenCalledWith({
      where: { phone: "+15551234567", deletedAt: null },
      select: { id: true, name: true },
    });
    expect(conversationFindFirst).toHaveBeenCalledWith({
      where: {
        contactId: "contact-1",
        status: { not: ConversationStatus.closed },
        archivedAt: null,
      },
      orderBy: { lastMessageAt: "desc" },
      select: { id: true },
    });
  });

  it("returns a contact without a conversation when there is no open thread", async () => {
    contactFindFirst.mockResolvedValue({ id: "contact-1", name: "Ada" });
    conversationFindFirst.mockResolvedValue(null);

    await expect(resolveCallAttachment("+15551234567")).resolves.toEqual({
      conversationId: null,
      contactId: "contact-1",
      contactName: "Ada",
    });
  });

  it("returns empty attachment when no active contact exists", async () => {
    contactFindFirst.mockResolvedValue(null);

    await expect(resolveCallAttachment("+15551234567")).resolves.toEqual({
      conversationId: null,
      contactId: null,
      contactName: null,
    });
    expect(conversationFindFirst).not.toHaveBeenCalled();
  });
});
