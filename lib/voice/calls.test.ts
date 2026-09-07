import { CallStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { ACTIVE_CALL_STATUSES, mapPatchCallLogStatus } from "@/lib/voice/calls";

describe("ACTIVE_CALL_STATUSES", () => {
  it("includes non-terminal in-flight statuses", () => {
    expect(ACTIVE_CALL_STATUSES).toEqual([
      CallStatus.initiating,
      CallStatus.ringing,
      CallStatus.in_progress,
    ]);
  });
});

describe("mapPatchCallLogStatus", () => {
  it("maps canceled, failed, and completed", () => {
    expect(mapPatchCallLogStatus("canceled")).toBe(CallStatus.canceled);
    expect(mapPatchCallLogStatus("failed")).toBe(CallStatus.failed);
    expect(mapPatchCallLogStatus("completed")).toBe(CallStatus.completed);
  });
});
