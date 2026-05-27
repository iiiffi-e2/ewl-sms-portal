import { describe, expect, it } from "vitest";
import { mapTwilioCallStatus, isTerminalCallStatus } from "@/lib/voice/status";
import { CallStatus } from "@prisma/client";

describe("mapTwilioCallStatus", () => {
  it("maps queued and initiated to initiating", () => {
    expect(mapTwilioCallStatus("queued")).toBe(CallStatus.initiating);
    expect(mapTwilioCallStatus("initiated")).toBe(CallStatus.initiating);
  });

  it("maps ringing", () => {
    expect(mapTwilioCallStatus("ringing")).toBe(CallStatus.ringing);
  });

  it("maps in-progress and answered to in_progress", () => {
    expect(mapTwilioCallStatus("in-progress")).toBe(CallStatus.in_progress);
    expect(mapTwilioCallStatus("answered")).toBe(CallStatus.in_progress);
  });

  it("maps completed", () => {
    expect(mapTwilioCallStatus("completed")).toBe(CallStatus.completed);
  });

  it("maps no-answer", () => {
    expect(mapTwilioCallStatus("no-answer")).toBe(CallStatus.no_answer);
  });

  it("maps busy", () => {
    expect(mapTwilioCallStatus("busy")).toBe(CallStatus.busy);
  });

  it("maps failed", () => {
    expect(mapTwilioCallStatus("failed")).toBe(CallStatus.failed);
  });

  it("maps canceled", () => {
    expect(mapTwilioCallStatus("canceled")).toBe(CallStatus.canceled);
  });

  it("maps unknown to failed", () => {
    expect(mapTwilioCallStatus("unknown-value")).toBe(CallStatus.failed);
  });
});

describe("isTerminalCallStatus", () => {
  it("returns true for terminal statuses", () => {
    expect(isTerminalCallStatus(CallStatus.completed)).toBe(true);
    expect(isTerminalCallStatus(CallStatus.failed)).toBe(true);
    expect(isTerminalCallStatus(CallStatus.no_answer)).toBe(true);
    expect(isTerminalCallStatus(CallStatus.busy)).toBe(true);
    expect(isTerminalCallStatus(CallStatus.canceled)).toBe(true);
  });

  it("returns false for non-terminal statuses", () => {
    expect(isTerminalCallStatus(CallStatus.in_progress)).toBe(false);
    expect(isTerminalCallStatus(CallStatus.ringing)).toBe(false);
    expect(isTerminalCallStatus(CallStatus.initiating)).toBe(false);
  });
});
