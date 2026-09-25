import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const queryRaw = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $queryRaw: (...args: unknown[]) => queryRaw(...args),
    $executeRaw: vi.fn(),
  },
}));

import { tryAcquireInboxSyncLease } from "@/lib/sync-lease";

beforeEach(() => {
  queryRaw.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("tryAcquireInboxSyncLease", () => {
  it("grants the lease when the row was claimed", async () => {
    queryRaw.mockResolvedValue([{ id: "commstack-inbox" }]);
    await expect(tryAcquireInboxSyncLease()).resolves.toEqual({ token: expect.any(String) });
  });

  it("declines when another instance holds it", async () => {
    queryRaw.mockResolvedValue([]);
    await expect(tryAcquireInboxSyncLease()).resolves.toBeNull();
  });

  it("declines on a transient database error so a struggling database gets no extra sync load", async () => {
    queryRaw.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("query timeout", {
        code: "P6004",
        clientVersion: "6.18.0",
      }),
    );
    await expect(tryAcquireInboxSyncLease()).resolves.toBeNull();
  });

  it("falls back to the per-instance gate when the lease table is unusable", async () => {
    queryRaw.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('relation "SyncLease" does not exist', {
        code: "P2010",
        clientVersion: "6.18.0",
      }),
    );
    await expect(tryAcquireInboxSyncLease()).resolves.toEqual({ token: expect.any(String) });
  });
});
