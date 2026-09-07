import { describe, expect, it } from "vitest";
import { initiateCallSchema, updateCallLogSchema } from "@/lib/validators";

describe("initiateCallSchema", () => {
  it("accepts phone only", () => {
    const parsed = initiateCallSchema.safeParse({ phone: "+15551234567" });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.conversationId).toBeUndefined();
    }
  });

  it("still accepts conversationId with phone", () => {
    const parsed = initiateCallSchema.safeParse({
      conversationId: "550e8400-e29b-41d4-a716-446655440000",
      phone: "+15551234567",
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects an invalid phone", () => {
    expect(initiateCallSchema.safeParse({ phone: "123" }).success).toBe(false);
  });
});

describe("updateCallLogSchema", () => {
  it("accepts canceled, failed, and completed", () => {
    expect(updateCallLogSchema.safeParse({ status: "canceled" }).success).toBe(true);
    expect(updateCallLogSchema.safeParse({ status: "failed" }).success).toBe(true);
    expect(updateCallLogSchema.safeParse({ status: "completed" }).success).toBe(true);
  });

  it("rejects unknown statuses", () => {
    expect(updateCallLogSchema.safeParse({ status: "in_progress" }).success).toBe(false);
    expect(updateCallLogSchema.safeParse({ status: "stale" }).success).toBe(false);
  });
});
