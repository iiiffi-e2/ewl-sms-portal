import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {},
}));

const originalEnv = process.env;

describe("startCommStackRealtime gate", () => {
  beforeEach(() => {
    process.env = { ...originalEnv, VERCEL: "1" };
    delete process.env.COMM_STACK_REALTIME;
    vi.resetModules();
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it("returns without loading configs when realtime is disabled on Vercel", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const { startCommStackRealtime } = await import("@/lib/commstack-realtime");
    await startCommStackRealtime();
    // Second call must not log again
    await startCommStackRealtime();
    expect(info.mock.calls.filter((c) => String(c[0]).includes("realtime skipped")).length).toBe(1);
  });
});
