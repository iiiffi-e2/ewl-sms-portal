import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  buildHangupTwiml,
  buildInboundClientDialTwiml,
  buildOutboundDialTwiml,
  getInboundDialActionUrl,
} from "@/lib/voice/twiml";

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

describe("buildInboundClientDialTwiml", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      NEXTAUTH_URL: "https://app.example.com",
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("dials client identities with timeout 25 and call parameters", () => {
    const xml = buildInboundClientDialTwiml({
      identities: ["user-1", "user-2"],
      callLogId: "log-1",
      conversationId: "conv-1",
      contactName: "Ada Lovelace",
      phone: "+15559876543",
      actionUrl: "https://app.example.com/api/webhooks/voice/incoming-result?callLogId=log-1",
    });

    expect(xml).toContain("<Dial");
    expect(xml).toContain('timeout="25"');
    expect(xml).toContain('answerOnBridge="true"');
    expect(xml).toContain(
      "https://app.example.com/api/webhooks/voice/incoming-result?callLogId=log-1",
    );
    expect(xml).toContain("<Identity>user-1</Identity>");
    expect(xml).toContain("<Identity>user-2</Identity>");
    expect(xml).toContain("<Parameter");
    expect(xml).toContain('name="callLogId"');
    expect(xml).toContain('value="log-1"');
    expect(xml).toContain('name="conversationId"');
    expect(xml).toContain('value="conv-1"');
    expect(xml).toContain('name="contactName"');
    expect(xml).toContain('value="Ada Lovelace"');
    expect(xml).toContain('name="phone"');
    expect(xml).toContain('value="+15559876543"');
  });
});

describe("buildHangupTwiml", () => {
  it("returns Hangup TwiML", () => {
    expect(buildHangupTwiml()).toContain("<Hangup");
  });
});

describe("getInboundDialActionUrl", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      NEXTAUTH_URL: "https://app.example.com/",
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("builds the incoming-result webhook URL with callLogId", () => {
    expect(getInboundDialActionUrl("log-1")).toBe(
      "https://app.example.com/api/webhooks/voice/incoming-result?callLogId=log-1",
    );
  });
});
