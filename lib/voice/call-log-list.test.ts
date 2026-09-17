import { CallStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  CALL_LOG_STATUS_FILTER_OPTIONS,
  buildCallLogListSearchParams,
  buildCallLogPageItems,
  callLogListHasFilters,
  callLogPageCount,
  canSaveContactFromCallLog,
  datetimeLocalToIso,
  decorateCallLogsWithContacts,
  isPlaceholderCallLog,
  parseCallLogListLimit,
  parseCallLogListPage,
  parseCallLogListQuery,
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

describe("parseCallLogListQuery", () => {
  it("treats omitted and blank params as no filters", () => {
    expect(parseCallLogListQuery({})).toEqual({
      ok: true,
      query: {
        q: null,
        startedFrom: null,
        startedTo: null,
        minDurationSeconds: null,
        maxDurationSeconds: null,
        status: null,
      },
    });
    const blank = parseCallLogListQuery({ q: "  ", status: "" });
    expect(blank.ok).toBe(true);
    if (blank.ok) {
      expect(callLogListHasFilters(blank.query)).toBe(false);
    }
    const empty = parseCallLogListQuery({});
    if (empty.ok) {
      expect(callLogListHasFilters(empty.query)).toBe(false);
    }
  });

  it("parses search, dates, duration, and status", () => {
    const parsed = parseCallLogListQuery({
      q: "  Ada  ",
      startedFrom: "2026-09-01T15:00:00.000Z",
      startedTo: "2026-09-03T13:00:00.000Z",
      minDurationSeconds: "30",
      maxDurationSeconds: "300",
      status: "completed",
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }
    expect(parsed.query.q).toBe("Ada");
    expect(parsed.query.startedFrom?.toISOString()).toBe("2026-09-01T15:00:00.000Z");
    expect(parsed.query.startedTo?.toISOString()).toBe("2026-09-03T13:00:00.000Z");
    expect(parsed.query.minDurationSeconds).toBe(30);
    expect(parsed.query.maxDurationSeconds).toBe(300);
    expect(parsed.query.status).toBe(CallStatus.completed);
    expect(callLogListHasFilters(parsed.query)).toBe(true);
  });

  it("rejects invalid dates, inverted ranges, bad duration, and unknown status", () => {
    expect(parseCallLogListQuery({ startedFrom: "not-a-date" })).toEqual({
      ok: false,
      error: "startedFrom must be a valid datetime.",
    });
    expect(parseCallLogListQuery({ startedTo: "not-a-date" })).toEqual({
      ok: false,
      error: "startedTo must be a valid datetime.",
    });
    expect(
      parseCallLogListQuery({
        startedFrom: "2026-09-03T13:00:00.000Z",
        startedTo: "2026-09-01T15:00:00.000Z",
      }),
    ).toEqual({ ok: false, error: "startedFrom must be on or before startedTo." });
    expect(parseCallLogListQuery({ minDurationSeconds: "-1" })).toEqual({
      ok: false,
      error: "minDurationSeconds must be a non-negative integer.",
    });
    expect(parseCallLogListQuery({ maxDurationSeconds: "1.5" })).toEqual({
      ok: false,
      error: "maxDurationSeconds must be a non-negative integer.",
    });
    expect(
      parseCallLogListQuery({ minDurationSeconds: "40", maxDurationSeconds: "10" }),
    ).toEqual({
      ok: false,
      error: "minDurationSeconds must be on or before maxDurationSeconds.",
    });
    expect(parseCallLogListQuery({ status: "missed" })).toEqual({
      ok: false,
      error: "status is not a valid call status.",
    });
  });
});

describe("datetimeLocalToIso", () => {
  it("returns null for blank input and ISO for a local datetime", () => {
    expect(datetimeLocalToIso("")).toBeNull();
    expect(datetimeLocalToIso("   ")).toBeNull();
    const iso = datetimeLocalToIso("2026-09-17T15:00");
    expect(iso).toBe(new Date("2026-09-17T15:00").toISOString());
  });
});

describe("buildCallLogListSearchParams", () => {
  it("always includes page and limit and omits empty filters", () => {
    expect(buildCallLogListSearchParams({ page: 2 })).toBe("page=2&limit=50");
    expect(
      buildCallLogListSearchParams({
        page: 1,
        q: "Ada",
        startedFrom: "2026-09-01T15:00:00.000Z",
        status: "completed",
      }),
    ).toBe(
      "page=1&limit=50&q=Ada&startedFrom=2026-09-01T15%3A00%3A00.000Z&status=completed",
    );
  });
});

describe("CALL_LOG_STATUS_FILTER_OPTIONS", () => {
  it("lists ended statuses before live ones", () => {
    expect(CALL_LOG_STATUS_FILTER_OPTIONS).toEqual([
      CallStatus.completed,
      CallStatus.no_answer,
      CallStatus.busy,
      CallStatus.failed,
      CallStatus.canceled,
      CallStatus.initiating,
      CallStatus.ringing,
      CallStatus.in_progress,
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
