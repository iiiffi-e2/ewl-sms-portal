import { Prisma } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const conversationFindMany = vi.fn();
const conversationFindUnique = vi.fn();
const fetchDirectHistory = vi.fn();
const tryAcquireInboxSyncLease = vi.fn();
const finishInboxSyncLease = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    conversation: {
      findMany: (...args: unknown[]) => conversationFindMany(...args),
      findUnique: (...args: unknown[]) => conversationFindUnique(...args),
      update: vi.fn(),
    },
    message: { findMany: vi.fn(async () => []) },
  },
}));

vi.mock("@/lib/commstack", () => ({
  isCommStackConfigured: () => true,
  hasContactCommStackConfig: () => true,
  getContactCommStackConfig: () => ({ portalUserId: "portal" }),
  fetchCommStackDirectHistory: (...args: unknown[]) => fetchDirectHistory(...args),
  fetchCommStackChannelHistory: vi.fn(async () => []),
}));

vi.mock("@/lib/commstack-voice-ingest", () => ({
  outboundEchoMatchFilter: () => null,
  persistInboundCommStackMessage: vi.fn(),
}));

vi.mock("@/lib/sync-lease", () => ({
  tryAcquireInboxSyncLease: (...args: unknown[]) => tryAcquireInboxSyncLease(...args),
  finishInboxSyncLease: (...args: unknown[]) => finishInboxSyncLease(...args),
}));

function notifyConversation(id: string) {
  return { id, contact: { notifyClientId: `client-${id}`, notifyChannelId: null } };
}

async function loadModule() {
  vi.resetModules();
  return import("@/lib/commstack-sync");
}

beforeEach(() => {
  conversationFindMany.mockReset();
  conversationFindUnique.mockReset();
  fetchDirectHistory.mockReset();
  tryAcquireInboxSyncLease.mockReset();
  finishInboxSyncLease.mockReset();
  finishInboxSyncLease.mockResolvedValue(undefined);
  conversationFindUnique.mockImplementation(async ({ where }: { where: { id: string } }) =>
    notifyConversation(where.id),
  );
  fetchDirectHistory.mockResolvedValue([]);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("syncCommStackInbox", () => {
  it("lets concurrent requests on one instance share a single lease attempt", async () => {
    const { syncCommStackInbox } = await loadModule();
    let grantLease: (lease: { token: string }) => void = () => undefined;
    tryAcquireInboxSyncLease.mockReturnValue(
      new Promise((resolve) => {
        grantLease = resolve;
      }),
    );
    conversationFindMany.mockResolvedValue([]);

    const first = syncCommStackInbox();
    const second = syncCommStackInbox();
    grantLease({ token: "t" });

    await expect(Promise.all([first, second])).resolves.toEqual([
      { synced: 0, imported: 0 },
      { synced: 0, imported: 0 },
    ]);
    expect(tryAcquireInboxSyncLease).toHaveBeenCalledTimes(1);
  });

  it("rejects the caller on a database failure without leaking an unhandled rejection", async () => {
    const { syncCommStackInbox } = await loadModule();
    tryAcquireInboxSyncLease.mockResolvedValue({ token: "t" });
    const failure = new Error("P6004");
    conversationFindMany.mockRejectedValue(failure);

    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => unhandled.push(reason);
    process.on("unhandledRejection", onUnhandled);
    try {
      await expect(syncCommStackInbox()).rejects.toBe(failure);
      await new Promise((resolve) => setImmediate(resolve));
      expect(unhandled).toEqual([]);
      expect(finishInboxSyncLease).toHaveBeenCalledTimes(1);
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }
  });

  it("stops starting new threads once the run budget is spent", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(0);
    const { syncCommStackInbox, INBOX_SYNC_BUDGET_MS } = await loadModule();
    tryAcquireInboxSyncLease.mockResolvedValue({ token: "t" });
    conversationFindMany.mockResolvedValue(
      ["a", "b", "c", "d", "e"].map((id) => ({ id })),
    );
    const perThreadMs = Math.ceil(INBOX_SYNC_BUDGET_MS / 2.5);
    fetchDirectHistory.mockImplementation(async () => {
      vi.setSystemTime(Date.now() + perThreadMs);
      return [];
    });

    const result = await syncCommStackInbox();

    expect(fetchDirectHistory).toHaveBeenCalledTimes(3);
    expect(result).toEqual({ synced: 3, imported: 0 });
  });

  it("keeps going past one thread's Notify failure", async () => {
    const { syncCommStackInbox } = await loadModule();
    tryAcquireInboxSyncLease.mockResolvedValue({ token: "t" });
    conversationFindMany.mockResolvedValue([{ id: "a" }, { id: "b" }]);
    fetchDirectHistory
      .mockRejectedValueOnce(new Error("Notify 504"))
      .mockResolvedValueOnce([]);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(syncCommStackInbox()).resolves.toEqual({ synced: 2, imported: 0 });
    expect(fetchDirectHistory).toHaveBeenCalledTimes(2);
    consoleError.mockRestore();
  });

  it("aborts the pass on a transient database error instead of queueing more queries", async () => {
    const { syncCommStackInbox } = await loadModule();
    tryAcquireInboxSyncLease.mockResolvedValue({ token: "t" });
    conversationFindMany.mockResolvedValue([{ id: "a" }, { id: "b" }]);
    const timeout = new Prisma.PrismaClientKnownRequestError("query timeout", {
      code: "P6004",
      clientVersion: "6.18.0",
    });
    conversationFindUnique.mockRejectedValueOnce(timeout);

    await expect(syncCommStackInbox()).rejects.toBe(timeout);
    expect(conversationFindUnique).toHaveBeenCalledTimes(1);
  });

  it("skips without syncing when the lease is held elsewhere", async () => {
    const { syncCommStackInbox } = await loadModule();
    tryAcquireInboxSyncLease.mockResolvedValue(null);

    await expect(syncCommStackInbox()).resolves.toEqual({
      synced: 0,
      imported: 0,
      skipped: true,
    });
    expect(conversationFindMany).not.toHaveBeenCalled();
  });
});
