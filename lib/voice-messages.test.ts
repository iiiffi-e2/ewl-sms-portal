import { describe, expect, it } from "vitest";
import {
  VOICE_MAX_DURATION_SECONDS,
  VOICE_MESSAGE_BODY,
  assertValidVoiceDuration,
  isIngestibleCommStackMessage,
  isVoiceCommStackMessage,
  toClientMessageAttachment,
} from "@/lib/voice-messages";

describe("voice-messages helpers", () => {
  it("uses stable voice body placeholder and 120s max", () => {
    expect(VOICE_MESSAGE_BODY).toBe("Voice message");
    expect(VOICE_MAX_DURATION_SECONDS).toBe(120);
  });

  it("ingests text with body and voice with file even when text empty", () => {
    expect(isIngestibleCommStackMessage({ type: "text", text: "hi", file: "" })).toBe(true);
    expect(isIngestibleCommStackMessage({ type: "voice", text: "", file: "a.m4a" })).toBe(true);
    expect(isIngestibleCommStackMessage({ type: "text", text: "  ", file: "" })).toBe(false);
    expect(isIngestibleCommStackMessage({ type: "voice", text: "", file: "" })).toBe(false);
  });

  it("detects voice type", () => {
    expect(isVoiceCommStackMessage({ type: "voice", file: "a.m4a" })).toBe(true);
    expect(isVoiceCommStackMessage({ type: "text", file: "" })).toBe(false);
  });

  it("validates duration", () => {
    expect(() => assertValidVoiceDuration(1)).not.toThrow();
    expect(() => assertValidVoiceDuration(120)).not.toThrow();
    expect(() => assertValidVoiceDuration(0)).toThrow(/1 and 120/);
    expect(() => assertValidVoiceDuration(121)).toThrow(/1 and 120/);
    expect(() => assertValidVoiceDuration(1.5)).toThrow(/1 and 120/);
  });

  it("maps attachment metadata without bytes", () => {
    expect(toClientMessageAttachment(null)).toEqual({ hasAttachment: false });
    expect(
      toClientMessageAttachment({
        id: "1",
        contentType: "audio/mp4",
        filename: "note.m4a",
        sizeBytes: 12,
      }),
    ).toEqual({
      hasAttachment: true,
      contentType: "audio/mp4",
      filename: "note.m4a",
      sizeBytes: 12,
    });
  });
});
