import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  createVoiceAccessToken,
  VOICE_TOKEN_TTL_SECONDS,
} from "@/lib/voice/token";

describe("createVoiceAccessToken", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      TWILIO_ACCOUNT_SID: "ACtest123456789012345678901234567890",
      TWILIO_API_KEY_SID: "SKtest123456789012345678901234567890",
      TWILIO_API_KEY_SECRET: "test_api_key_secret_32chars_min",
      TWILIO_TWIML_APP_SID: "APtest123456789012345678901234567890",
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns a JWT string for the given identity", () => {
    const token = createVoiceAccessToken("user-uuid-123");
    expect(typeof token).toBe("string");
    expect(token.split(".")).toHaveLength(3);
  });

  it("exports VOICE_TOKEN_TTL_SECONDS as 3600", () => {
    expect(VOICE_TOKEN_TTL_SECONDS).toBe(3600);
  });

  it("grants incoming client calls", () => {
    const token = createVoiceAccessToken("user-uuid-123");
    const payload = JSON.parse(
      Buffer.from(token.split(".")[1], "base64url").toString("utf8"),
    ) as {
      grants?: { voice?: { incoming?: { allow?: boolean } } };
    };

    expect(payload.grants?.voice?.incoming?.allow).toBe(true);
  });

  it("throws when env vars missing", () => {
    delete process.env.TWILIO_API_KEY_SID;
    expect(() => createVoiceAccessToken("user-uuid-123")).toThrow(
      "TWILIO_API_KEY_SID",
    );
  });
});
