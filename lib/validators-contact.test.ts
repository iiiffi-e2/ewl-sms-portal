import { describe, expect, it } from "vitest";
import { createContactSchema, sendMessageSchema } from "@/lib/validators";

describe("createContactSchema", () => {
  it("accepts SMS contacts with phone only", () => {
    const parsed = createContactSchema.safeParse({ phone: "+15551234567", name: "Ada" });
    expect(parsed.success).toBe(true);
  });

  it("accepts Notify contacts with notifyClientId only", () => {
    const parsed = createContactSchema.safeParse({ notifyClientId: "client-1", name: "Ada" });
    expect(parsed.success).toBe(true);
  });

  it("rejects both phone and notifyClientId", () => {
    const parsed = createContactSchema.safeParse({
      phone: "+15551234567",
      notifyClientId: "client-1",
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects neither identity", () => {
    const parsed = createContactSchema.safeParse({ name: "Ada" });
    expect(parsed.success).toBe(false);
  });
});

describe("sendMessageSchema", () => {
  it("allows conversationId without phone", () => {
    const parsed = sendMessageSchema.safeParse({
      conversationId: "550e8400-e29b-41d4-a716-446655440000",
      body: "Hello",
    });
    expect(parsed.success).toBe(true);
  });

  it("allows notifyClientId without phone", () => {
    const parsed = sendMessageSchema.safeParse({
      notifyClientId: "client-1",
      body: "Hello",
    });
    expect(parsed.success).toBe(true);
  });
});
