import { describe, expect, it } from "vitest";
import { parseIncomingInvite } from "@/lib/voice/incoming-invite";

describe("parseIncomingInvite", () => {
  it("reads TwiML custom parameters", () => {
    expect(
      parseIncomingInvite({
        customParameters: new Map([
          ["callLogId", "log-1"],
          ["conversationId", "conv-1"],
          ["phone", "+15559876543"],
          ["contactName", "Ada"],
        ]),
      }),
    ).toEqual({
      callLogId: "log-1",
      conversationId: "conv-1",
      phone: "+15559876543",
      contactName: "Ada",
    });
  });

  it("falls back to Call.parameters when customParameters are empty", () => {
    expect(
      parseIncomingInvite({
        customParameters: new Map(),
        parameters: new Map([
          ["callLogId", "log-2"],
          ["conversationId", "conv-2"],
          ["From", "+14693230954"],
        ]),
      }),
    ).toEqual({
      callLogId: "log-2",
      conversationId: "conv-2",
      phone: "+14693230954",
      contactName: null,
    });
  });

  it("does not treat a client identity From as the caller phone", () => {
    expect(
      parseIncomingInvite({
        parameters: { From: "client:user-1" },
      }),
    ).toEqual({
      callLogId: undefined,
      conversationId: undefined,
      phone: undefined,
      contactName: null,
    });
  });
});
