import { describe, expect, it } from "vitest";
import {
  PRESENCE_PUBLISH_MS,
  claimPresencePublish,
  releasePresencePublish,
} from "@/lib/voice/presence-heartbeat";
import { PRESENCE_FRESH_MS } from "@/lib/voice/presence";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key),
  };
}

describe("claimPresencePublish", () => {
  it("lets one tab publish per interval for the whole browser", () => {
    const storage = memoryStorage();
    expect(claimPresencePublish(0, storage)).toBe(true);
    expect(claimPresencePublish(1_000, storage)).toBe(false);
    expect(claimPresencePublish(PRESENCE_PUBLISH_MS - 1, storage)).toBe(false);
    expect(claimPresencePublish(PRESENCE_PUBLISH_MS, storage)).toBe(true);
  });

  it("lets a surviving tab publish right away after the publishing tab closes", () => {
    const storage = memoryStorage();
    expect(claimPresencePublish(0, storage)).toBe(true);
    releasePresencePublish(storage);
    expect(claimPresencePublish(1_000, storage)).toBe(true);
  });

  it("publishes well inside the ring-target freshness window", () => {
    expect(PRESENCE_PUBLISH_MS * 2).toBeLessThan(PRESENCE_FRESH_MS);
  });
});
