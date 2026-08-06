import { describe, expect, it } from "vitest";
import { createContactSchema, sendMessageSchema } from "@/lib/validators";

describe("createContactSchema", () => {
  it("accepts SMS contacts with phone only", () => {
    const parsed = createContactSchema.safeParse({ phone: "+15551234567", name: "Ada" });
    expect(parsed.success).toBe(true);
  });

  it("accepts Notify contacts with UUID notifyClientId only", () => {
    const parsed = createContactSchema.safeParse({
      notifyClientId: "550e8400-e29b-41d4-a716-446655440000",
      name: "Ada",
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects non-UUID notifyClientId", () => {
    const parsed = createContactSchema.safeParse({
      notifyClientId: "client-1",
      name: "Ada",
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects both phone and notifyClientId", () => {
    const parsed = createContactSchema.safeParse({
      phone: "+15551234567",
      notifyClientId: "550e8400-e29b-41d4-a716-446655440000",
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

  it("allows UUID notifyClientId without phone", () => {
    const parsed = sendMessageSchema.safeParse({
      notifyClientId: "550e8400-e29b-41d4-a716-446655440000",
      body: "Hello",
    });
    expect(parsed.success).toBe(true);
  });
});
