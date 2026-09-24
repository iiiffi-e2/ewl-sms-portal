import { MessageStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  buildSmsStatusCallbackUrl,
  canAdvanceMessageStatus,
  planTwilioMessageStatusWrite,
  shouldRecordConsentStatusEvent,
} from "@/lib/status";

describe("canAdvanceMessageStatus", () => {
  it("moves an outbound message forward from queued to sent to delivered", () => {
    expect(canAdvanceMessageStatus(MessageStatus.queued, MessageStatus.sent)).toBe(true);
    expect(canAdvanceMessageStatus(MessageStatus.sent, MessageStatus.delivered)).toBe(true);
    expect(canAdvanceMessageStatus(MessageStatus.queued, MessageStatus.delivered)).toBe(true);
  });

  it("does not let a late queued callback overwrite sent or delivered", () => {
    expect(canAdvanceMessageStatus(MessageStatus.sent, MessageStatus.queued)).toBe(false);
    expect(canAdvanceMessageStatus(MessageStatus.delivered, MessageStatus.queued)).toBe(false);
    expect(canAdvanceMessageStatus(MessageStatus.delivered, MessageStatus.sent)).toBe(false);
  });

  it("treats failed and delivered as terminal", () => {
    expect(canAdvanceMessageStatus(MessageStatus.queued, MessageStatus.failed)).toBe(true);
    expect(canAdvanceMessageStatus(MessageStatus.sent, MessageStatus.failed)).toBe(true);
    expect(canAdvanceMessageStatus(MessageStatus.failed, MessageStatus.sent)).toBe(false);
    expect(canAdvanceMessageStatus(MessageStatus.failed, MessageStatus.delivered)).toBe(false);
    expect(canAdvanceMessageStatus(MessageStatus.delivered, MessageStatus.failed)).toBe(false);
  });

  it("does not apply the same status twice", () => {
    expect(canAdvanceMessageStatus(MessageStatus.sent, MessageStatus.sent)).toBe(false);
  });
});

describe("planTwilioMessageStatusWrite", () => {
  it("plans a forward status write and stores the sid when it is missing", () => {
    expect(
      planTwilioMessageStatusWrite({
        currentStatus: MessageStatus.queued,
        incomingStatus: MessageStatus.sent,
        currentSid: null,
        incomingSid: "SM123",
        errorMessage: null,
      }),
    ).toEqual({
      kind: "status",
      status: MessageStatus.sent,
      twilioSid: "SM123",
      errorMessage: null,
    });
  });

  it("ignores a queued callback once the message is already delivered", () => {
    expect(
      planTwilioMessageStatusWrite({
        currentStatus: MessageStatus.delivered,
        incomingStatus: MessageStatus.queued,
        currentSid: "SM123",
        incomingSid: "SM123",
        errorMessage: null,
      }),
    ).toBeNull();
  });

  it("still saves the sid from a stale callback when the row does not have one yet", () => {
    expect(
      planTwilioMessageStatusWrite({
        currentStatus: MessageStatus.delivered,
        incomingStatus: MessageStatus.queued,
        currentSid: null,
        incomingSid: "SM123",
        errorMessage: null,
      }),
    ).toEqual({ kind: "sid", twilioSid: "SM123" });
  });

  it("does not attach a callback sid that belongs to a different message", () => {
    expect(
      planTwilioMessageStatusWrite({
        currentStatus: MessageStatus.queued,
        incomingStatus: MessageStatus.sent,
        currentSid: "SMother",
        incomingSid: "SM123",
        errorMessage: null,
      }),
    ).toBeNull();
  });
});

describe("shouldRecordConsentStatusEvent", () => {
  it("records the first delivered callback and a retry of that same terminal status", () => {
    expect(
      shouldRecordConsentStatusEvent({
        isConsentIntro: true,
        currentStatus: MessageStatus.sent,
        incomingStatus: MessageStatus.delivered,
      }),
    ).toBe(true);
    expect(
      shouldRecordConsentStatusEvent({
        isConsentIntro: true,
        currentStatus: MessageStatus.delivered,
        incomingStatus: MessageStatus.delivered,
      }),
    ).toBe(true);
  });

  it("does not record a consent event for a stale queued callback", () => {
    expect(
      shouldRecordConsentStatusEvent({
        isConsentIntro: true,
        currentStatus: MessageStatus.delivered,
        incomingStatus: MessageStatus.queued,
      }),
    ).toBe(false);
  });
});

describe("buildSmsStatusCallbackUrl", () => {
  it("points Twilio at the status webhook with the local message id", () => {
    expect(buildSmsStatusCallbackUrl("msg 1", "https://caretext.example.com/")).toBe(
      "https://caretext.example.com/api/webhooks/sms-status?messageId=msg%201",
    );
  });
});
