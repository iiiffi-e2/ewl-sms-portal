export type LeaseStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
};

export function browserLeaseStorage(): LeaseStorage | null {
  return typeof window === "undefined" ? null : window.localStorage;
}

/**
 * Let one tab of this browser claim `key` for `leaseMs`. Sister tabs see the
 * claim through localStorage and skip until it expires. Without storage (SSR,
 * blocked storage) every caller wins, which matches the old per-tab behavior.
 */
export function claimCrossTabLease(
  key: string,
  leaseMs: number,
  now: number,
  storage: LeaseStorage | null,
): boolean {
  if (!storage) return true;

  try {
    const raw = storage.getItem(key);
    const until = raw == null ? 0 : Number(raw);
    if (Number.isFinite(until) && until > now) {
      return false;
    }

    storage.setItem(key, String(now + leaseMs));
    return true;
  } catch {
    return true;
  }
}

export function releaseCrossTabLease(key: string, storage: LeaseStorage | null): void {
  try {
    storage?.removeItem?.(key);
  } catch {
    // Storage unavailable; the lease simply expires.
  }
}
