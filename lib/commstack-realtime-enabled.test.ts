import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isCommStackRealtimeEnabled } from "@/lib/commstack";

describe("isCommStackRealtimeEnabled", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.COMM_STACK_REALTIME;
    delete process.env.VERCEL;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("is enabled locally when unset and VERCEL is unset", () => {
    expect(isCommStackRealtimeEnabled()).toBe(true);
  });

  it("is disabled when VERCEL is set and override unset", () => {
    process.env.VERCEL = "1";
    expect(isCommStackRealtimeEnabled()).toBe(false);
  });

  it("respects COMM_STACK_REALTIME=0 on local", () => {
    process.env.COMM_STACK_REALTIME = "0";
    expect(isCommStackRealtimeEnabled()).toBe(false);
  });

  it("respects COMM_STACK_REALTIME=false and off (case-insensitive)", () => {
    process.env.COMM_STACK_REALTIME = "False";
    expect(isCommStackRealtimeEnabled()).toBe(false);
    process.env.COMM_STACK_REALTIME = "OFF";
    expect(isCommStackRealtimeEnabled()).toBe(false);
  });

  it("respects COMM_STACK_REALTIME=1 on Vercel", () => {
    process.env.VERCEL = "1";
    process.env.COMM_STACK_REALTIME = "1";
    expect(isCommStackRealtimeEnabled()).toBe(true);
  });

  it("respects COMM_STACK_REALTIME=true and on", () => {
    process.env.VERCEL = "1";
    process.env.COMM_STACK_REALTIME = "true";
    expect(isCommStackRealtimeEnabled()).toBe(true);
    process.env.COMM_STACK_REALTIME = "ON";
    expect(isCommStackRealtimeEnabled()).toBe(true);
  });

  it("treats unknown COMM_STACK_REALTIME values as unset (fall through to VERCEL default)", () => {
    process.env.VERCEL = "1";
    process.env.COMM_STACK_REALTIME = "maybe";
    expect(isCommStackRealtimeEnabled()).toBe(false);
  });
});
