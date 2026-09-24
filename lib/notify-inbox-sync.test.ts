import { describe, expect, it } from "vitest";
import {
  NOTIFY_INBOX_SYNC_LEASE_MS,
  NOTIFY_THREAD_SYNC_MS,
  claimNotifyInboxSync,
  shouldSyncNotifyThread,
} from "@/lib/notify-inbox-sync";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
  };
}

describe("claimNotifyInboxSync", () => {
  it("lets the first tab claim the lease and blocks the next tab until it expires", () => {
    const storage = memoryStorage();

    expect(claimNotifyInboxSync(1_000, storage)).toBe(true);
    expect(claimNotifyInboxSync(1_000 + NOTIFY_INBOX_SYNC_LEASE_MS - 1, storage)).toBe(false);
    expect(claimNotifyInboxSync(1_000 + NOTIFY_INBOX_SYNC_LEASE_MS, storage)).toBe(true);
  });
});

describe("shouldSyncNotifyThread", () => {
  it("syncs immediately the first time and then waits out the interval", () => {
    expect(shouldSyncNotifyThread(null, 5_000)).toBe(true);
    expect(shouldSyncNotifyThread(5_000, 5_000 + NOTIFY_THREAD_SYNC_MS - 1)).toBe(false);
    expect(shouldSyncNotifyThread(5_000, 5_000 + NOTIFY_THREAD_SYNC_MS)).toBe(true);
  });
});
