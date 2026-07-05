import { describe, expect, it } from "vitest";
import {
  getConversationDetailRevision,
  getConversationsListRevision,
} from "@/lib/conversation-revision";

describe("getConversationsListRevision", () => {
  it("changes when preview message changes", () => {
    const before = getConversationsListRevision([
      {
        id: "c1",
        lastMessageAt: "2026-01-01T00:00:00.000Z",
        status: "open",
        messages: [{ id: "m1" }],
      },
    ]);
    const after = getConversationsListRevision([
      {
        id: "c1",
        lastMessageAt: "2026-01-01T00:00:00.000Z",
        status: "open",
        messages: [{ id: "m2" }],
      },
    ]);

    expect(before).not.toBe(after);
  });
});

describe("getConversationDetailRevision", () => {
  it("stays stable when message content changes but ids do not", () => {
    const conversation = {
      id: "c1",
      status: "open",
      messages: [{ id: "m1", status: "delivered" }],
      notes: [],
      callLogs: [],
    };

    expect(getConversationDetailRevision(conversation)).toBe(
      getConversationDetailRevision(conversation),
    );
  });

  it("changes when a new message arrives", () => {
    const before = getConversationDetailRevision({
      id: "c1",
      status: "open",
      messages: [{ id: "m1", status: "delivered" }],
      notes: [],
      callLogs: [],
    });
    const after = getConversationDetailRevision({
      id: "c1",
      status: "open",
      messages: [
        { id: "m1", status: "delivered" },
        { id: "m2", status: "sent" },
      ],
      notes: [],
      callLogs: [],
    });

    expect(before).not.toBe(after);
  });
});
