import { describe, expect, it } from "vitest";
import { isCommStackUserId } from "@/lib/commstack-ids";

describe("isCommStackUserId", () => {
  it("accepts valid UUIDs", () => {
    expect(isCommStackUserId("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
    expect(isCommStackUserId("11111111-1111-1111-8111-111111111111")).toBe(true);
  });

  it("rejects non-UUID notify client ids", () => {
    expect(isCommStackUserId("test-client-1")).toBe(false);
    expect(isCommStackUserId("")).toBe(false);
    expect(isCommStackUserId("not-a-uuid")).toBe(false);
  });
});
