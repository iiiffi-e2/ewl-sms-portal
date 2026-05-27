import { describe, expect, it, beforeEach, afterEach } from "vitest";
import twilio from "twilio";
import {
  validateTwilioWebhookRequest,
  parseTwilioWebhookParams,
  getWebhookRequestUrl,
} from "@/lib/voice/webhook";

describe("validateTwilioWebhookRequest", () => {
  const originalEnv = process.env;
  const authToken = "test_auth_token_32_characters_xx";
  const url = "https://app.example.com/api/webhooks/voice/twiml";

  beforeEach(() => {
    process.env = { ...originalEnv, TWILIO_AUTH_TOKEN: authToken };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns true for a valid signature", () => {
    const params = { CallSid: "CA123", To: "+15559876543" };
    const signature = twilio.getExpectedTwilioSignature(authToken, url, params);

    expect(
      validateTwilioWebhookRequest({
        signature,
        url,
        params,
      }),
    ).toBe(true);
  });

  it("returns false for an invalid signature", () => {
    expect(
      validateTwilioWebhookRequest({
        signature: "invalid",
        url,
        params: { CallSid: "CA123" },
      }),
    ).toBe(false);
  });

  it("returns false when signature is null", () => {
    expect(
      validateTwilioWebhookRequest({
        signature: null,
        url,
        params: { CallSid: "CA123" },
      }),
    ).toBe(false);
  });
});

describe("parseTwilioWebhookParams", () => {
  it("parses application/x-www-form-urlencoded body", async () => {
    const body = new URLSearchParams({
      CallSid: "CA123",
      CallStatus: "completed",
    });
    const request = new Request("https://app.example.com/webhook", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    const params = await parseTwilioWebhookParams(request);

    expect(params).toEqual({
      CallSid: "CA123",
      CallStatus: "completed",
    });
  });
});

describe("getWebhookRequestUrl", () => {
  it("builds URL from x-forwarded-proto and x-forwarded-host", () => {
    const request = new Request(
      "http://localhost:3000/api/webhooks/voice/twiml",
      {
        headers: {
          "x-forwarded-proto": "https",
          "x-forwarded-host": "app.example.com",
        },
      },
    );

    expect(getWebhookRequestUrl(request)).toBe(
      "https://app.example.com/api/webhooks/voice/twiml",
    );
  });

  it("falls back to host header when x-forwarded-host is absent", () => {
    const request = new Request(
      "http://localhost:3000/api/webhooks/voice/status",
      {
        headers: {
          host: "app.example.com",
        },
      },
    );

    expect(getWebhookRequestUrl(request)).toBe(
      "https://app.example.com/api/webhooks/voice/status",
    );
  });
});
