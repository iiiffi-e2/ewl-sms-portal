import { describe, expect, it } from "vitest";
import {
  canSaveContactFromCallLog,
  decorateCallLogsWithContacts,
  parseCallLogListLimit,
} from "@/lib/voice/call-log-list";

describe("parseCallLogListLimit", () => {
  it("defaults to 50 and caps at 100", () => {
    expect(parseCallLogListLimit(null)).toBe(50);
    expect(parseCallLogListLimit("10")).toBe(10);
    expect(parseCallLogListLimit("999")).toBe(100);
    expect(parseCallLogListLimit("nope")).toBe(50);
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
