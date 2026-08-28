import { describe, expect, it } from "vitest";
import {
  MAX_INBOUND_RING_TARGETS,
  PRESENCE_FRESH_MS,
  selectInboundRingIdentities,
} from "@/lib/voice/presence";

const NOW = new Date("2026-08-28T18:00:00.000Z");

function presence(
  userId: string,
  lastSeenAt: Date,
  disabledAt: Date | null = null,
) {
  return { userId, lastSeenAt, disabledAt };
}

describe("selectInboundRingIdentities", () => {
  it("excludes stale presence older than the freshness window", () => {
    const identities = selectInboundRingIdentities({
      now: NOW,
      presence: [
        presence("fresh", new Date(NOW.getTime() - PRESENCE_FRESH_MS + 1_000)),
        presence("stale", new Date(NOW.getTime() - PRESENCE_FRESH_MS - 1_000)),
      ],
      busyUserIds: new Set(),
    });

    expect(identities).toEqual(["fresh"]);
  });

  it("excludes disabled users", () => {
    const identities = selectInboundRingIdentities({
      now: NOW,
      presence: [
        presence("active", NOW),
        presence("disabled", NOW, new Date("2026-01-01T00:00:00.000Z")),
      ],
      busyUserIds: new Set(),
    });

    expect(identities).toEqual(["active"]);
  });

  it("excludes users already on an active call", () => {
    const identities = selectInboundRingIdentities({
      now: NOW,
      presence: [presence("free", NOW), presence("busy", NOW)],
      busyUserIds: new Set(["busy"]),
    });

    expect(identities).toEqual(["free"]);
  });

  it("returns the newest users first and caps at MAX_INBOUND_RING_TARGETS", () => {
    const presenceRows = Array.from({ length: MAX_INBOUND_RING_TARGETS + 3 }, (_, index) =>
      presence(`user-${index}`, new Date(NOW.getTime() - index * 1_000)),
    );

    const identities = selectInboundRingIdentities({
      now: NOW,
      presence: presenceRows,
      busyUserIds: new Set(),
    });

    expect(identities).toHaveLength(MAX_INBOUND_RING_TARGETS);
    expect(identities[0]).toBe("user-0");
    expect(identities[9]).toBe("user-9");
    expect(identities).not.toContain("user-10");
  });
});
