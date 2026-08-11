import { describe, expect, it } from "vitest";
import {
  outboundEchoContactLookup,
  outboundEchoMatchFilter,
  resolveInboundMessageFields,
  voiceAttachmentFilename,
} from "@/lib/commstack-voice-ingest";
import { VOICE_FILENAME, VOICE_MESSAGE_BODY } from "@/lib/voice-messages";

describe("commstack-voice-ingest helpers", () => {
  it("derives attachment filename from file path or falls back", () => {
    expect(voiceAttachmentFilename("uploads/abc/note.m4a")).toBe("note.m4a");
    expect(voiceAttachmentFilename("plain.m4a")).toBe("plain.m4a");
    expect(voiceAttachmentFilename("")).toBe(VOICE_FILENAME);
    expect(voiceAttachmentFilename("   ")).toBe(VOICE_FILENAME);
  });

  it("resolves voice vs text inbound message fields", () => {
    expect(
      resolveInboundMessageFields({
        type: "voice",
        text: "",
        file: "a.m4a",
        duration: 12,
      }),
    ).toEqual({
      messageType: "voice",
      body: VOICE_MESSAGE_BODY,
      durationSeconds: 12,
    });

    expect(
      resolveInboundMessageFields({
        type: "voice",
        text: "  hello  ",
        file: "a.m4a",
        duration: 0,
      }),
    ).toEqual({
      messageType: "voice",
      body: "hello",
      durationSeconds: null,
    });

    expect(
      resolveInboundMessageFields({
        type: "text",
        text: "hi there",
        file: "",
        duration: 0,
      }),
    ).toEqual({
      messageType: "text",
      body: "hi there",
      durationSeconds: null,
    });
  });

  it("builds outbound echo match for voice and text", () => {
    expect(
      outboundEchoMatchFilter({ type: "voice", text: "", file: "a.m4a" }),
    ).toEqual({
      messageType: "voice",
      body: VOICE_MESSAGE_BODY,
    });

    expect(
      outboundEchoMatchFilter({ type: "text", text: "hello", file: "" }),
    ).toEqual({
      body: "hello",
    });

    expect(
      outboundEchoMatchFilter({ type: "text", text: "  ", file: "" }),
    ).toBeNull();
  });

  it("scopes outbound echo contact lookup by channel or receiver", () => {
    expect(
      outboundEchoContactLookup({ channel_id: "ch-1", receiver: "user-2" }),
    ).toEqual({ notifyChannelId: "ch-1" });

    expect(
      outboundEchoContactLookup({ channel_id: null, receiver: "user-2" }),
    ).toEqual({ notifyClientId: "user-2" });

    expect(outboundEchoContactLookup({ channel_id: "  ", receiver: "  " })).toBeNull();
  });
});
