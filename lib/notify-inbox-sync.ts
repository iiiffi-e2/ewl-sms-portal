import { browserLeaseStorage, claimCrossTabLease, type LeaseStorage } from "@/lib/cross-tab-lease";

/** One browser holds the inbox-sync lease so sister tabs don't all POST at once. */
export const NOTIFY_INBOX_SYNC_LEASE_MS = 12_000;

/** Open Notify threads pull CommStack history on this cadence, not every list poll. */
export const NOTIFY_THREAD_SYNC_MS = 15_000;

const LEASE_KEY = "caretext:notify-inbox-sync";

export function claimNotifyInboxSync(
  now = Date.now(),
  storage: LeaseStorage | null = browserLeaseStorage(),
  leaseMs = NOTIFY_INBOX_SYNC_LEASE_MS,
): boolean {
  return claimCrossTabLease(LEASE_KEY, leaseMs, now, storage);
}

export function shouldSyncNotifyThread(
  lastStartedAt: number | null,
  now: number,
  intervalMs = NOTIFY_THREAD_SYNC_MS,
): boolean {
  if (lastStartedAt == null) return true;
  return now - lastStartedAt >= intervalMs;
}
