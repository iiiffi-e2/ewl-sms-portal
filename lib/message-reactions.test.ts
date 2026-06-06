import { describe, expect, it } from "vitest";
import {
  attachReactionsToMessages,
  findReactionTarget,
  parseTapbackReaction,
} from "@/lib/message-reactions";

describe("parseTapbackReaction", () => {
  it("parses iOS-style liked tapbacks with straight quotes", () => {
    expect(parseTapbackReaction('Liked "28 bedside"')).toEqual({
      kind: "liked",
      emoji: "👍",
      quotedText: "28 bedside",
    });
  });

  it("parses tapbacks with curly quotes", () => {
    expect(parseTapbackReaction("Loved “good morning”")).toEqual({
      kind: "loved",
      emoji: "❤️",
      quotedText: "good morning",
    });
  });

  it("returns null for normal replies", () => {
    expect(parseTapbackReaction("Thanks, got it")).toBeNull();
    expect(parseTapbackReaction('Liked without closing quote')).toBeNull();
  });
});

describe("findReactionTarget", () => {
  const messages = [
    { id: "1", body: "28 bedside", createdAt: "2026-06-01T10:00:00.000Z" },
    { id: "2", body: "Please call back", createdAt: "2026-06-01T11:00:00.000Z" },
  ];

  it("matches the most recent message with the quoted text", () => {
    expect(
      findReactionTarget("Please call back", messages, "2026-06-01T12:00:00.000Z")?.id,
    ).toBe("2");
  });

  it("ignores messages sent after the reaction", () => {
    expect(
      findReactionTarget("Please call back", messages, "2026-06-01T10:30:00.000Z"),
    ).toBeNull();
  });
});

describe("attachReactionsToMessages", () => {
  it("hides tapback replies and attaches emoji to the original message", () => {
    const messages = [
      {
        id: "out-1",
        body: "28 bedside",
        direction: "outbound" as const,
        status: "sent",
        createdAt: "2026-06-01T10:00:00.000Z",
      },
      {
        id: "in-1",
        body: 'Liked "28 bedside"',
        direction: "inbound" as const,
        status: "received",
        createdAt: "2026-06-01T10:05:00.000Z",
      },
    ];

    const result = attachReactionsToMessages(messages);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("out-1");
    expect(result[0].reactions).toEqual([{ emoji: "👍", kind: "liked" }]);
  });

  it("keeps unmatched tapbacks visible as fallback reply text", () => {
    const messages = [
      {
        id: "in-1",
        body: 'Liked "28 bedside"',
        direction: "inbound" as const,
        status: "received",
        createdAt: "2026-06-01T10:05:00.000Z",
      },
    ];

    const result = attachReactionsToMessages(messages);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("in-1");
    expect(result[0].body).toBe('Liked "28 bedside"');
    expect(result[0].reactions).toEqual([]);
  });
});
