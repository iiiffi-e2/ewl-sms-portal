import { CallDirection, CallStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { canClaimInboundCall, inboundDialResultStatus } from "@/lib/voice/inbound";

describe("inboundDialResultStatus", () => {
  it("maps unclaimed ringing calls to no_answer on no-answer", () => {
    expect(
      inboundDialResultStatus({
        status: CallStatus.ringing,
        initiatedById: null,
        dialCallStatus: "no-answer",
      }),
    ).toBe(CallStatus.no_answer);
  });

  it("does not overwrite an already claimed call", () => {
    expect(
      inboundDialResultStatus({
        status: CallStatus.ringing,
        initiatedById: "user-1",
        dialCallStatus: "no-answer",
      }),
    ).toBeNull();
  });

  it("completes a claimed call when Dial finishes", () => {
    expect(
      inboundDialResultStatus({
        status: CallStatus.in_progress,
        initiatedById: "user-1",
        dialCallStatus: "completed",
      }),
    ).toBe(CallStatus.completed);
  });

  it("does not overwrite a terminal call log", () => {
    expect(
      inboundDialResultStatus({
        status: CallStatus.completed,
        initiatedById: null,
        dialCallStatus: "no-answer",
      }),
    ).toBeNull();
  });

  it("maps busy, failed, and canceled for unclaimed ringing calls", () => {
    expect(
      inboundDialResultStatus({
        status: CallStatus.ringing,
        initiatedById: null,
        dialCallStatus: "busy",
      }),
    ).toBe(CallStatus.busy);
    expect(
      inboundDialResultStatus({
        status: CallStatus.ringing,
        initiatedById: null,
        dialCallStatus: "failed",
      }),
    ).toBe(CallStatus.failed);
    expect(
      inboundDialResultStatus({
        status: CallStatus.ringing,
        initiatedById: null,
        dialCallStatus: "canceled",
      }),
    ).toBe(CallStatus.canceled);
  });
});

describe("canClaimInboundCall", () => {
  it("allows claiming an inbound ringing call", () => {
    expect(
      canClaimInboundCall({
        direction: CallDirection.inbound,
        status: CallStatus.ringing,
        endedAt: null,
      }),
    ).toBe(true);
  });

  it("allows claiming an inbound in-progress call", () => {
    expect(
      canClaimInboundCall({
        direction: CallDirection.inbound,
        status: CallStatus.in_progress,
        endedAt: null,
      }),
    ).toBe(true);
  });

  it("rejects outbound or ended calls", () => {
    expect(
      canClaimInboundCall({
        direction: CallDirection.outbound,
        status: CallStatus.ringing,
        endedAt: null,
      }),
    ).toBe(false);
    expect(
      canClaimInboundCall({
        direction: CallDirection.inbound,
        status: CallStatus.ringing,
        endedAt: new Date(),
      }),
    ).toBe(false);
  });
});
