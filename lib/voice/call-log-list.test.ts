import { describe, expect, it } from "vitest";
import {
  buildCallLogPageItems,
  callLogPageCount,
  canSaveContactFromCallLog,
  decorateCallLogsWithContacts,
  isPlaceholderCallLog,
  parseCallLogListLimit,
  parseCallLogListPage,
} from "@/lib/voice/call-log-list";

describe("parseCallLogListLimit", () => {
  it("defaults to 50 and caps at 100", () => {
    expect(parseCallLogListLimit(null)).toBe(50);
    expect(parseCallLogListLimit("10")).toBe(10);
    expect(parseCallLogListLimit("999")).toBe(100);
    expect(parseCallLogListLimit("nope")).toBe(50);
  });
});

describe("parseCallLogListPage", () => {
  it("defaults to page 1 and rejects invalid values", () => {
    expect(parseCallLogListPage(null)).toBe(1);
    expect(parseCallLogListPage("3")).toBe(3);
    expect(parseCallLogListPage("0")).toBe(1);
    expect(parseCallLogListPage("-2")).toBe(1);
    expect(parseCallLogListPage("nope")).toBe(1);
  });
});

describe("decorateCallLogsWithContacts", () => {
  it("attaches the current contact by phone without requiring conversationId", () => {
    const items = decorateCallLogsWithContacts(
      [
        {
          id: "log-1",
          phone: "+15551234567",
          direction: "outbound",
          status: "completed",
          outcome: "completed",
          durationSeconds: 12,
          startedAt: new Date("2026-08-31T12:00:00.000Z"),
          endedAt: new Date("2026-08-31T12:00:12.000Z"),
          conversationId: null,
          initiatedBy: { id: "user-1", name: "Nurse" },
        },
      ],
      new Map([["+15551234567", { id: "contact-1", name: "Ada" }]]),
    );

    expect(items[0]?.contact).toEqual({ id: "contact-1", name: "Ada" });
    expect(items[0]?.conversationId).toBeNull();
    expect(items[0]?.startedAt).toBe("2026-08-31T12:00:00.000Z");
  });
});

describe("canSaveContactFromCallLog", () => {
  it("is true only for ended unknown numbers", () => {
    expect(canSaveContactFromCallLog({ hasContact: false, status: "completed" })).toBe(true);
    expect(canSaveContactFromCallLog({ hasContact: false, status: "no_answer" })).toBe(true);
    expect(canSaveContactFromCallLog({ hasContact: false, status: "ringing" })).toBe(false);
    expect(canSaveContactFromCallLog({ hasContact: true, status: "completed" })).toBe(false);
  });
});

describe("callLogPageCount", () => {
  it("returns 0 when there are no rows and otherwise rounds up", () => {
    expect(callLogPageCount(0, 50)).toBe(0);
    expect(callLogPageCount(50, 50)).toBe(1);
    expect(callLogPageCount(51, 50)).toBe(2);
  });
});

describe("buildCallLogPageItems", () => {
  it("lists every page when there are few of them", () => {
    expect(buildCallLogPageItems({ page: 2, pageCount: 5 })).toEqual([1, 2, 3, 4, 5]);
  });

  it("keeps first, last, and neighbors with ellipses when there are many pages", () => {
    expect(buildCallLogPageItems({ page: 1, pageCount: 12 })).toEqual([
      1,
      2,
      3,
      "ellipsis",
      12,
    ]);
    expect(buildCallLogPageItems({ page: 6, pageCount: 12 })).toEqual([
      1,
      "ellipsis",
      5,
      6,
      7,
      "ellipsis",
      12,
    ]);
    expect(buildCallLogPageItems({ page: 12, pageCount: 12 })).toEqual([
      1,
      "ellipsis",
      10,
      11,
      12,
    ]);
  });
});

describe("isPlaceholderCallLog", () => {
  it("hides stale leftovers and canceled rows that never reached Twilio", () => {
    expect(
      isPlaceholderCallLog({ status: "canceled", outcome: "stale", twilioSid: null }),
    ).toBe(true);
    expect(
      isPlaceholderCallLog({ status: "canceled", outcome: "stale", twilioSid: "CA123" }),
    ).toBe(true);
    expect(
      isPlaceholderCallLog({ status: "canceled", outcome: "canceled", twilioSid: null }),
    ).toBe(true);
    expect(
      isPlaceholderCallLog({ status: "canceled", outcome: null, twilioSid: null }),
    ).toBe(true);
  });

  it("keeps calls that reached Twilio, including a real Twilio cancel", () => {
    expect(
      isPlaceholderCallLog({ status: "canceled", outcome: "canceled", twilioSid: "CA123" }),
    ).toBe(false);
    expect(
      isPlaceholderCallLog({ status: "completed", outcome: "completed", twilioSid: "CA123" }),
    ).toBe(false);
    expect(
      isPlaceholderCallLog({ status: "no_answer", outcome: "no-staff", twilioSid: "CA123" }),
    ).toBe(false);
    expect(
      isPlaceholderCallLog({ status: "initiating", outcome: null, twilioSid: null }),
    ).toBe(false);
  });
});
