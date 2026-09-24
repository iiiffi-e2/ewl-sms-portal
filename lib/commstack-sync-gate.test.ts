import { describe, expect, it } from "vitest";
import {
  CONVERSATION_SYNC_COOLDOWN_MS,
  INBOX_SYNC_COOLDOWN_MS,
  inboxSyncDecision,
  shouldSyncConversation,
} from "@/lib/commstack-sync-gate";

describe("inboxSyncDecision", () => {
  it("starts a sync when nothing is running and the cooldown has elapsed", () => {
    expect(
      inboxSyncDecision(10_000, { inFlight: false, lastFinishedAt: 0 }, INBOX_SYNC_COOLDOWN_MS),
    ).toBe("start");
  });

  it("joins an in-flight sync instead of starting another", () => {
    expect(
      inboxSyncDecision(10_000, { inFlight: true, lastFinishedAt: 0 }, INBOX_SYNC_COOLDOWN_MS),
    ).toBe("join");
  });

  it("skips when a sync finished inside the cooldown", () => {
    expect(
      inboxSyncDecision(
        20_000,
        { inFlight: false, lastFinishedAt: 20_000 - INBOX_SYNC_COOLDOWN_MS + 1 },
        INBOX_SYNC_COOLDOWN_MS,
      ),
    ).toBe("skip");
  });
});

describe("shouldSyncConversation", () => {
  it("allows the first sync and blocks a second one inside the cooldown", () => {
    expect(shouldSyncConversation(1_000, undefined)).toBe(true);
    expect(shouldSyncConversation(1_000 + CONVERSATION_SYNC_COOLDOWN_MS - 1, 1_000)).toBe(false);
    expect(shouldSyncConversation(1_000 + CONVERSATION_SYNC_COOLDOWN_MS, 1_000)).toBe(true);
  });
});
