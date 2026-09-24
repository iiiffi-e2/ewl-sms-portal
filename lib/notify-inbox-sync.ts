/** One browser holds the inbox-sync lease so sister tabs don't all POST at once. */
export const NOTIFY_INBOX_SYNC_LEASE_MS = 12_000;

/** Open Notify threads pull CommStack history on this cadence, not every list poll. */
export const NOTIFY_THREAD_SYNC_MS = 15_000;

const LEASE_KEY = "caretext:notify-inbox-sync";

type LeaseStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

export function claimNotifyInboxSync(
  now = Date.now(),
  storage: LeaseStorage | null = typeof window === "undefined" ? null : window.localStorage,
  leaseMs = NOTIFY_INBOX_SYNC_LEASE_MS,
): boolean {
  if (!storage) return true;

  try {
    const raw = storage.getItem(LEASE_KEY);
    const until = raw == null ? 0 : Number(raw);
    if (Number.isFinite(until) && until > now) {
      return false;
    }

    storage.setItem(LEASE_KEY, String(now + leaseMs));
    return true;
  } catch {
    return true;
  }
}

export function shouldSyncNotifyThread(
  lastStartedAt: number | null,
  now: number,
  intervalMs = NOTIFY_THREAD_SYNC_MS,
): boolean {
  if (lastStartedAt == null) return true;
  return now - lastStartedAt >= intervalMs;
}
