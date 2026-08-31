import { describe, expect, it } from "vitest";
import { completeIncomingInvite, parseIncomingInvite } from "@/lib/voice/incoming-invite";

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

describe("completeIncomingInvite", () => {
  it("accepts a ringing fallback without conversationId", () => {
    expect(
      completeIncomingInvite(
        parseIncomingInvite({
          customParameters: new Map([
            ["callLogId", "log-9"],
            ["phone", "+15551112222"],
          ]),
        }),
      ),
    ).toEqual({
      callLogId: "log-9",
      conversationId: null,
      phone: "+15551112222",
      contactName: null,
    });
  });

  it("returns null without callLogId or phone", () => {
    expect(completeIncomingInvite(parseIncomingInvite({}))).toBeNull();
  });

  it("fills missing fields from the ringing endpoint payload", () => {
    expect(
      completeIncomingInvite(parseIncomingInvite({}), {
        callLogId: "log-3",
        conversationId: null,
        phone: "+15550001111",
        contactName: null,
      }),
    ).toEqual({
      callLogId: "log-3",
      conversationId: null,
      phone: "+15550001111",
      contactName: null,
    });
  });
});
