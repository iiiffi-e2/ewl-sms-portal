import { describe, expect, it } from "vitest";
import { createContactSchema, sendMessageSchema } from "@/lib/validators";

const notifyConfig = {
  notifyClientId: "550e8400-e29b-41d4-a716-446655440000",
  name: "Ada",
  commStackAppId: "a7853715-005b-4eeb-ac8e-707f002ab943",
  commStackAppName: "ewl-caretext-dev",
  commStackBaseUrl: "qsscommbe3.notifync.com",
  commStackPortalUserId: "9e8755cf-5ac7-11f1-854c-5a0d702bfea6",
};

describe("createContactSchema", () => {
  it("accepts SMS contacts with phone only", () => {
    const parsed = createContactSchema.safeParse({ phone: "+15551234567", name: "Ada" });
    expect(parsed.success).toBe(true);
  });

  it("accepts Notify contacts with UUID and CommStack config", () => {
    const parsed = createContactSchema.safeParse(notifyConfig);
    expect(parsed.success).toBe(true);
  });

  it("rejects Notify contacts missing CommStack fields", () => {
    const parsed = createContactSchema.safeParse({
      notifyClientId: "550e8400-e29b-41d4-a716-446655440000",
      name: "Ada",
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects Notify contacts missing name", () => {
    const parsed = createContactSchema.safeParse({
      ...notifyConfig,
      name: undefined,
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects CommStack fields on SMS contacts", () => {
    const parsed = createContactSchema.safeParse({
      phone: "+15551234567",
      name: "Ada",
      commStackAppId: notifyConfig.commStackAppId,
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects non-UUID notifyClientId", () => {
    const parsed = createContactSchema.safeParse({
      ...notifyConfig,
      notifyClientId: "client-1",
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects both phone and notifyClientId", () => {
    const parsed = createContactSchema.safeParse({
      phone: "+15551234567",
      ...notifyConfig,
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
