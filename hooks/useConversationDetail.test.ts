import { describe, expect, it } from "vitest";
import { mergeMessages } from "./useConversationDetail";

type TestMessage = {
  id: string;
  body: string;
  direction: "inbound" | "outbound";
  status: string;
  createdAt: string;
};

function message(id: string, createdAt: string, status = "delivered"): TestMessage {
  return { id, createdAt, status, body: `body-${id}`, direction: "inbound" };
}

describe("mergeMessages", () => {
  it("prepends older messages while keeping ascending order", () => {
    const existing = [message("2", "2026-01-01T00:02:00Z"), message("3", "2026-01-01T00:03:00Z")];
    const older = [message("0", "2026-01-01T00:00:00Z"), message("1", "2026-01-01T00:01:00Z")];

    const merged = mergeMessages(older, existing);

    expect(merged.map((m) => m.id)).toEqual(["0", "1", "2", "3"]);
  });

  it("dedupes overlapping messages and lets the incoming copy win", () => {
    const existing = [message("1", "2026-01-01T00:01:00Z", "queued")];
    const incoming = [
      message("1", "2026-01-01T00:01:00Z", "delivered"),
      message("2", "2026-01-01T00:02:00Z"),
    ];

    const merged = mergeMessages(existing, incoming);

    expect(merged).toHaveLength(2);
    expect(merged[0].status).toBe("delivered");
    expect(merged.map((m) => m.id)).toEqual(["1", "2"]);
  });

  it("appends brand-new messages arriving on a later fetch", () => {
    const existing = [message("1", "2026-01-01T00:01:00Z")];
    const incoming = [message("2", "2026-01-01T00:02:00Z")];

    const merged = mergeMessages(existing, incoming);

    expect(merged.map((m) => m.id)).toEqual(["1", "2"]);
  });
});
