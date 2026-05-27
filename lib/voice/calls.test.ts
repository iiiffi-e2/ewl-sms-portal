import { CallStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { ACTIVE_CALL_STATUSES } from "@/lib/voice/calls";

describe("ACTIVE_CALL_STATUSES", () => {
  it("includes non-terminal in-flight statuses", () => {
    expect(ACTIVE_CALL_STATUSES).toEqual([
      CallStatus.initiating,
      CallStatus.ringing,
      CallStatus.in_progress,
    ]);
  });
});
