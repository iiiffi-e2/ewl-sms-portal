/** Share one inbox list computation across every open inbox on this instance. */
export const INBOX_LIST_SHARE_MS = 5_000;

type Entry = { at: number; value: unknown };

let entry: Entry | null = null;
let inflight: Promise<unknown> | null = null;

/**
 * The default inbox payload is identical for every signed-in user. While a
 * shift has many inboxes open, reuse one result for a few seconds and let
 * concurrent polls join the request already in flight.
 */
export function getSharedInboxList<T>(load: () => Promise<T>, now = Date.now()): Promise<T> {
  if (entry && now - entry.at < INBOX_LIST_SHARE_MS) {
    return Promise.resolve(entry.value as T);
  }
  if (inflight) {
    return inflight as Promise<T>;
  }

  const run = load().then((value) => {
    entry = { at: now, value };
    return value;
  });
  inflight = run;
  // `finally` returns a new promise that re-rejects; it must be caught or a
  // failed load becomes an unhandled rejection even though callers handle `run`.
  const clear = () => {
    if (inflight === run) {
      inflight = null;
    }
  };
  run.then(clear, clear);
  return run;
}

export function resetSharedInboxListCache(): void {
  entry = null;
  inflight = null;
}
