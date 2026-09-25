import { describe, expect, it, vi } from "vitest";
import { createPhaseTimer } from "@/lib/phase-timer";

describe("createPhaseTimer", () => {
  it("records each phase and reports them as Server-Timing", () => {
    let now = 1_000;
    const timer = createPhaseTimer("send", { now: () => now, slowMs: 10_000 });
    now += 40;
    timer.mark("auth");
    now += 2_500;
    timer.mark("provider");

    const response = timer.finish(new Response(null, { status: 200 }));

    expect(response.headers.get("Server-Timing")).toBe(
      "auth;dur=40, provider;dur=2500, total;dur=2540",
    );
  });

  it("logs a breakdown only for slow requests", () => {
    const log = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    let now = 0;
    const fast = createPhaseTimer("send", { now: () => now, slowMs: 3_000 });
    now = 100;
    fast.mark("db");
    fast.finish(new Response(null));
    expect(log).not.toHaveBeenCalled();

    now = 0;
    const slow = createPhaseTimer("send", { now: () => now, slowMs: 3_000 });
    now = 3_500;
    slow.mark("provider");
    slow.finish(new Response(null, { status: 502 }), { kind: "notify" });
    expect(log).toHaveBeenCalledWith("[send] slow request", {
      status: 502,
      totalMs: 3_500,
      phases: { provider: 3_500 },
      kind: "notify",
    });
    log.mockRestore();
  });
});
