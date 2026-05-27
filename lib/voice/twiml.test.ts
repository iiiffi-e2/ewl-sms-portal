import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { buildOutboundDialTwiml } from "@/lib/voice/twiml";

describe("buildOutboundDialTwiml", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      TWILIO_PHONE_NUMBER: "+15551234567",
      NEXTAUTH_URL: "https://app.example.com",
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns Dial TwiML with caller ID, number, and default status callback", () => {
    const xml = buildOutboundDialTwiml("+15559876543");

    expect(xml).toContain("<Dial");
    expect(xml).toContain('callerId="+15551234567"');
    expect(xml).toContain("answerOnBridge=\"true\"");
    expect(xml).toContain("+15559876543");
    expect(xml).toContain(
      "https://app.example.com/api/webhooks/voice/status",
    );
    expect(xml).toContain('statusCallbackMethod="POST"');
    expect(xml).toContain("initiated ringing answered completed");
  });

  it("uses custom status callback when provided", () => {
    const customUrl =
      "https://app.example.com/api/webhooks/voice/status?callLogId=abc";
    const xml = buildOutboundDialTwiml("+15559876543", customUrl);

    expect(xml).toContain(customUrl);
  });
});
