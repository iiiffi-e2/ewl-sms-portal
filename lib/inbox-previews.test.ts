import { describe, expect, it } from "vitest";
import { attachLatestMessages } from "@/lib/inbox-previews";

describe("attachLatestMessages", () => {
  it("gives each conversation its latest message, or none, in the list's order", () => {
    const createdAt = new Date("2026-09-24T00:00:00Z");
    const result = attachLatestMessages(
      [{ id: "a" }, { id: "b" }],
      [{ conversationId: "a", id: "m1", body: "hi", direction: "inbound", createdAt }],
    );

    expect(result).toEqual([
      { id: "a", messages: [{ id: "m1", body: "hi", direction: "inbound", createdAt }] },
      { id: "b", messages: [] },
    ]);
  });
});
