/**
 * Delay before the next poll. Consecutive failures (5xx, network errors) back
 * off exponentially so an outage doesn't keep every open tab hammering the
 * database at full rate; the first success resets `failures` to 0.
 */
export function nextPollDelayMs(input: {
  baseMs: number;
  jitterMs: number;
  maxMs: number;
  failures: number;
  retryAfterMs?: number | null;
  random?: () => number;
}): number {
  const random = input.random ?? Math.random;
  const backedOff = Math.min(input.baseMs * 2 ** Math.max(0, input.failures), input.maxMs);
  const floor = Math.max(backedOff, input.retryAfterMs ?? 0);
  return floor + random() * input.jitterMs;
}

/** Parse a Retry-After header given in seconds. */
export function retryAfterMs(response: Response): number | null {
  const seconds = Number(response.headers.get("Retry-After"));
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : null;
}
