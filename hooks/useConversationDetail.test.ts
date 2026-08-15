import { describe, expect, it } from "vitest";
import {
  mergeMessages,
  reconcileFetchedConversation,
  type ConversationDetail,
} from "./useConversationDetail";

type TestMessage = {
  id: string;
  body: string;
  direction: "inbound" | "outbound";
  status: string;
  createdAt: string;
};

function message(
  id: string,
  createdAt: string,
  status = "delivered",
  extras?: Partial<TestMessage>,
): TestMessage {
  return {
    id,
    createdAt,
    status,
    body: extras?.body ?? `body-${id}`,
    direction: extras?.direction ?? "inbound",
  };
}

function conversation(messages: TestMessage[]): ConversationDetail {
  return {
    id: "conv-1",
    type: "direct",
    status: "open",
    contact: null,
    messages,
    notes: [],
    callLogs: [],
  };
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

describe("reconcileFetchedConversation", () => {
  it("keeps an optimistic outbound bubble when a stale fetch arrives without it", () => {
    const existing = message("1", "2026-01-01T00:01:00Z");
    const optimistic = message("optimistic-abc", "2026-01-01T00:02:00Z", "sending", {
      body: "hello",
      direction: "outbound",
    });

    const reconciled = reconcileFetchedConversation(
      conversation([existing, optimistic]),
      conversation([existing]),
    );

    expect(reconciled.messages.map((item) => item.id)).toEqual(["1", "optimistic-abc"]);
  });

  it("drops the optimistic bubble once the server copy of that outbound arrives", () => {
    const existing = message("1", "2026-01-01T00:01:00Z");
    const optimistic = message("optimistic-abc", "2026-01-01T00:02:00Z", "sending", {
      body: "hello",
      direction: "outbound",
    });
    const persisted = message("real-1", "2026-01-01T00:02:01Z", "queued", {
      body: "hello",
      direction: "outbound",
    });

    const reconciled = reconcileFetchedConversation(
      conversation([existing, optimistic]),
      conversation([existing, persisted]),
    );

    expect(reconciled.messages.map((item) => item.id)).toEqual(["1", "real-1"]);
  });

  it("keeps a second optimistic send when the fetch only includes the first server copy", () => {
    const firstOptimistic = message("optimistic-a", "2026-01-01T00:02:00Z", "sending", {
      body: "ok",
      direction: "outbound",
    });
    const secondOptimistic = message("optimistic-b", "2026-01-01T00:02:05Z", "sending", {
      body: "ok",
      direction: "outbound",
    });
    const firstPersisted = message("real-1", "2026-01-01T00:02:01Z", "queued", {
      body: "ok",
      direction: "outbound",
    });

    const reconciled = reconcileFetchedConversation(
      conversation([firstOptimistic, secondOptimistic]),
      conversation([firstPersisted]),
    );

    expect(reconciled.messages.map((item) => item.id)).toEqual(["real-1", "optimistic-b"]);
  });

  it("returns the fetch unchanged when there is no displayed conversation", () => {
    const fetched = conversation([message("1", "2026-01-01T00:01:00Z")]);

    expect(reconcileFetchedConversation(null, fetched)).toEqual(fetched);
  });
});
