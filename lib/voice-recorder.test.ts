import { describe, expect, it } from "vitest";
import {
  VOICE_RECORD_MAX_SECONDS,
  createVoiceSendFormData,
  extensionForMimeType,
  formatRecordingElapsed,
  pickRecorderMimeType,
  toVoiceDurationSeconds,
} from "@/lib/voice-recorder";

describe("voice-recorder helpers", () => {
  it("matches the 120s hard stop used by the server", () => {
    expect(VOICE_RECORD_MAX_SECONDS).toBe(120);
  });

  it("prefers audio/mp4 then webm when supported", () => {
    expect(
      pickRecorderMimeType((type) => type === "audio/mp4" || type.startsWith("audio/webm")),
    ).toBe("audio/mp4");

    expect(
      pickRecorderMimeType((type) => type.startsWith("audio/webm")),
    ).toBe("audio/webm;codecs=opus");

    expect(pickRecorderMimeType(() => false)).toBeUndefined();
  });

  it("formats elapsed recording time as m:ss", () => {
    expect(formatRecordingElapsed(0)).toBe("0:00");
    expect(formatRecordingElapsed(9)).toBe("0:09");
    expect(formatRecordingElapsed(65)).toBe("1:05");
    expect(formatRecordingElapsed(120)).toBe("2:00");
  });

  it("maps mime types to filenames", () => {
    expect(extensionForMimeType("audio/mp4")).toBe("m4a");
    expect(extensionForMimeType("audio/webm;codecs=opus")).toBe("webm");
    expect(extensionForMimeType("")).toBe("webm");
  });

  it("clamps recorded duration to an integer in 1..120", () => {
    expect(toVoiceDurationSeconds(0.4)).toBe(1);
    expect(toVoiceDurationSeconds(12.4)).toBe(12);
    expect(toVoiceDurationSeconds(12.6)).toBe(13);
    expect(toVoiceDurationSeconds(200)).toBe(120);
  });

  it("builds multipart FormData for send-voice", () => {
    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: "audio/webm" });
    const form = createVoiceSendFormData({
      conversationId: "conv-1",
      durationSeconds: 8,
      blob,
    });

    expect(form.get("conversationId")).toBe("conv-1");
    expect(form.get("duration")).toBe("8");
    const audio = form.get("audio");
    expect(audio).toBeInstanceOf(File);
    expect((audio as File).name).toBe("note.webm");
    expect((audio as File).type).toBe("audio/webm");
  });
});
