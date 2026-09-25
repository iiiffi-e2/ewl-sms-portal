import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const userFindUnique = vi.fn();

vi.mock("@/lib/auth", () => ({
  getAuthSession: async () => ({ user: { id: "user-1", role: "nurse" } }),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: (...args: unknown[]) => userFindUnique(...args) },
  },
}));

import { requireSession } from "@/lib/api-auth";
import { resetAccountFreshness } from "@/lib/account-freshness";

beforeEach(() => {
  userFindUnique.mockReset();
  resetAccountFreshness();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("requireSession", () => {
  it("answers 503 with Retry-After when the account lookup times out", async () => {
    userFindUnique.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("query timeout", {
        code: "P6004",
        clientVersion: "6.18.0",
      }),
    );

    const result = await requireSession();

    const response = "error" in result ? result.error : undefined;
    expect(response?.status).toBe(503);
    expect(response?.headers.get("Retry-After")).toBe("5");
  });

  it("still throws on a non-transient failure", async () => {
    userFindUnique.mockRejectedValue(new Error("bug"));
    await expect(requireSession()).rejects.toThrow("bug");
  });
});
