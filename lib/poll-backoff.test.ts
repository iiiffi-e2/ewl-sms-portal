import { describe, expect, it } from "vitest";
import { nextPollDelayMs } from "@/lib/poll-backoff";

describe("nextPollDelayMs", () => {
  const base = { baseMs: 10_000, jitterMs: 5_000, maxMs: 120_000 };

  it("uses the base interval plus jitter while requests succeed", () => {
    expect(nextPollDelayMs({ ...base, failures: 0, random: () => 0 })).toBe(10_000);
    expect(nextPollDelayMs({ ...base, failures: 0, random: () => 0.5 })).toBe(12_500);
  });

  it("doubles the interval for each consecutive failure", () => {
    expect(nextPollDelayMs({ ...base, failures: 1, random: () => 0 })).toBe(20_000);
    expect(nextPollDelayMs({ ...base, failures: 3, random: () => 0 })).toBe(80_000);
  });

  it("caps the backed-off interval and keeps jitter so tabs don't realign", () => {
    expect(nextPollDelayMs({ ...base, failures: 10, random: () => 0 })).toBe(120_000);
    expect(nextPollDelayMs({ ...base, failures: 10, random: () => 1 })).toBe(125_000);
  });

  it("waits at least as long as the server's Retry-After", () => {
    expect(
      nextPollDelayMs({ ...base, failures: 1, retryAfterMs: 60_000, random: () => 0 }),
    ).toBe(60_000);
  });
});
