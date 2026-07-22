import { Prisma } from "@prisma/client";

// Accelerate caching only applies when we actually go through the Accelerate
// proxy (prod). On a direct connection (local dev) we omit cacheStrategy so it
// stays a clean no-op.
const ACCELERATE_ACTIVE =
  process.env.DATABASE_URL?.startsWith("prisma://") === true ||
  process.env.DATABASE_URL?.startsWith("prisma+postgres://") === true;

/**
 * Build an Accelerate `cacheStrategy` value, or `undefined` when Accelerate is
 * not in use. `ttl` is how long a response is served from cache without hitting
 * the database; `swr` (stale-while-revalidate) is how long a stale response may
 * be served while it refreshes in the background.
 *
 * Because these reads aren't user-scoped, every tab/user issues the same query,
 * so the cache is shared fleet-wide — collapsing N concurrent polls into roughly
 * one origin query per `ttl` window. This is what keeps 30-tab users from
 * tripping Accelerate's rate limits.
 */
export function cacheFor(
  strategy: { ttl?: number; swr?: number },
): { ttl?: number; swr?: number } | undefined {
  return ACCELERATE_ACTIVE ? strategy : undefined;
}

// Error codes that represent a transient infrastructure blip (unreachable DB,
// pool timeout, Accelerate 429/503) as opposed to a deterministic error in the
// query itself. These are surfaced to callers as a 503 + Retry-After.
// See https://www.prisma.io/docs/orm/reference/error-reference
const TRANSIENT_PRISMA_CODES = new Set<string>([
  "P1001", // Can't reach database server
  "P1002", // Database server reached but timed out
  "P1008", // Operations timed out
  "P1017", // Server has closed the connection
  "P2024", // Timed out fetching a new connection from the pool
  "P6004", // Accelerate: query timeout
  "P6008", // Accelerate: connection / engine start error
]);

// The subset of transient codes that are safe to retry *in-process*. We
// deliberately EXCLUDE the resource-exhaustion codes:
//   - P2024 (pool timeout): the connection pool is already full, so retrying
//     just stacks another waiter onto a saturated pool (each waiting the full
//     ~10s pool_timeout) and prevents it from ever draining — a retry storm.
//   - P6004 (query timeout): the query already ran past Accelerate's duration
//     limit; re-running the same slow query wastes another connection slot.
// For these we fail fast → 503 + Retry-After, and let the client's next poll
// try again once the pool has recovered. Only genuine connectivity blips
// (server unreachable / connection dropped) are retried, since those fail fast
// and a fresh attempt is likely to land on a healthy connection.
const RETRYABLE_PRISMA_CODES = new Set<string>([
  "P1001", // Can't reach database server
  "P1002", // Database server reached but timed out
  "P1008", // Operations timed out
  "P1017", // Server has closed the connection
  "P6008", // Accelerate: connection / engine start error
]);

/**
 * Whether an error thrown by Prisma Client is a transient infrastructure blip
 * (unreachable DB, pool timeout, Accelerate 429/503) that should be reported to
 * the caller as retryable (503), as opposed to a deterministic error (500).
 */
export function isTransientDbError(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientInitializationError) {
    return true;
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return TRANSIENT_PRISMA_CODES.has(error.code);
  }

  // Accelerate rate limiting (429) and service degradation (503) surface as
  // "unknown request" errors; sniff the message for the transient signals.
  if (error instanceof Prisma.PrismaClientUnknownRequestError) {
    const message = error.message.toLowerCase();
    return (
      message.includes("429") ||
      message.includes("too many requests") ||
      message.includes("503") ||
      message.includes("service unavailable") ||
      message.includes("connection")
    );
  }

  return false;
}

/**
 * Whether a transient error is safe to retry *in-process*. This is a strict
 * subset of {@link isTransientDbError}: it excludes resource-exhaustion codes
 * (pool timeout P2024, query timeout P6004) because retrying those amplifies
 * the very saturation that caused them. See RETRYABLE_PRISMA_CODES above.
 */
export function isRetryableDbError(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientInitializationError) {
    return true;
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return RETRYABLE_PRISMA_CODES.has(error.code);
  }

  // Accelerate rate limiting (429) and service degradation (503) surface as
  // "unknown request" errors; a backoff retry is the appropriate response.
  if (error instanceof Prisma.PrismaClientUnknownRequestError) {
    const message = error.message.toLowerCase();
    return (
      message.includes("429") ||
      message.includes("too many requests") ||
      message.includes("503") ||
      message.includes("service unavailable") ||
      message.includes("connection")
    );
  }

  return false;
}

/**
 * Run an idempotent database read, retrying transient failures with exponential
 * backoff + jitter. Only use this for reads: retrying writes risks duplicates.
 *
 * Pool/query timeouts (P2024/P6004) are intentionally NOT retried here — they
 * signal the pool is already exhausted, so we fail fast and let the caller
 * return 503 + Retry-After instead of stacking more load onto a full pool.
 */
export async function withDbRetry<T>(
  fn: () => Promise<T>,
  { retries = 3, baseDelayMs = 150 }: { retries?: number; baseDelayMs?: number } = {},
): Promise<T> {
  let attempt = 0;

  for (;;) {
    try {
      return await fn();
    } catch (error) {
      if (attempt >= retries || !isRetryableDbError(error)) {
        throw error;
      }

      const backoff = baseDelayMs * 2 ** attempt;
      const jitter = Math.random() * baseDelayMs;
      await new Promise((resolve) => setTimeout(resolve, backoff + jitter));
      attempt += 1;
    }
  }
}
