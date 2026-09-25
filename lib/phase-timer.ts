/**
 * Per-phase durations for a route. Always sets a Server-Timing header (visible
 * in the browser's network panel) and logs a breakdown when the request is slow.
 */
export function createPhaseTimer(
  label: string,
  options: { now?: () => number; slowMs?: number } = {},
) {
  const now = options.now ?? (() => performance.now());
  const slowMs = options.slowMs ?? 3_000;
  const startedAt = now();
  let last = startedAt;
  const phases: Record<string, number> = {};

  return {
    mark(phase: string) {
      const at = now();
      phases[phase] = Math.round((phases[phase] ?? 0) + (at - last));
      last = at;
    },
    finish<T extends Response>(response: T, context: Record<string, unknown> = {}): T {
      const totalMs = Math.round(now() - startedAt);
      const header = [
        ...Object.entries(phases).map(([phase, ms]) => `${phase};dur=${ms}`),
        `total;dur=${totalMs}`,
      ].join(", ");
      response.headers.set("Server-Timing", header);
      if (totalMs >= slowMs) {
        console.warn(`[${label}] slow request`, {
          status: response.status,
          totalMs,
          phases: { ...phases },
          ...context,
        });
      }
      return response;
    },
  };
}
