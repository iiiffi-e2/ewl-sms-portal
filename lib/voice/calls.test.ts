import { CallDirection, CallStatus } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const updateMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    callLog: {
      updateMany: (...args: unknown[]) => updateMany(...args),
    },
  },
}));

import {
  ACTIVE_CALL_STATUSES,
  expireStaleActiveCalls,
  hangupCallLogPatchStatus,
  mapPatchCallLogStatus,
} from "@/lib/voice/calls";

const NOW = 1_725_000_000_000;

describe("expireStaleActiveCalls", () => {
  beforeEach(() => {
    updateMany.mockReset();
    updateMany.mockResolvedValue({ count: 0 });
    vi.spyOn(Date, "now").mockReturnValue(NOW);
  });

  it("cancels in_progress rows older than 10 minutes", async () => {
    await expireStaleActiveCalls("user-1");

    const inProgress = updateMany.mock.calls
      .map((call) => call[0])
      .find((arg) => arg.where.status === CallStatus.in_progress);

    expect(inProgress).toEqual({
      where: {
        initiatedById: "user-1",
        status: CallStatus.in_progress,
        startedAt: { lt: new Date(NOW - 10 * 60 * 1000) },
      },
      data: {
        status: CallStatus.canceled,
        endedAt: expect.any(Date),
        outcome: "stale",
      },
    });
  });

  it("cancels unclaimed inbound ringing older than 2 minutes", async () => {
    await expireStaleActiveCalls("user-1");

    const inbound = updateMany.mock.calls
      .map((call) => call[0])
      .find((arg) => arg.where.direction === CallDirection.inbound);

    expect(inbound).toEqual({
      where: {
        direction: CallDirection.inbound,
        initiatedById: null,
        status: CallStatus.ringing,
        startedAt: { lt: new Date(NOW - 2 * 60 * 1000) },
      },
      data: {
        status: CallStatus.canceled,
        endedAt: expect.any(Date),
        outcome: "stale",
      },
    });
  });

  it("still cancels this user's initiating/ringing rows with no Twilio SID immediately", async () => {
    await expireStaleActiveCalls("user-1");

    const noSid = updateMany.mock.calls
      .map((call) => call[0])
      .find((arg) => arg.where.twilioSid === null);

    expect(noSid.where).toEqual({
      initiatedById: "user-1",
      status: { in: [CallStatus.initiating, CallStatus.ringing] },
      twilioSid: null,
    });
  });
});

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

describe("hangupCallLogPatchStatus", () => {
  it("cancels a call that never connected", () => {
    expect(hangupCallLogPatchStatus(false)).toBe("canceled");
  });

  it("completes a call that connected", () => {
    expect(hangupCallLogPatchStatus(true)).toBe("completed");
  });
});
