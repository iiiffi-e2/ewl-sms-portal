import {
  browserLeaseStorage,
  claimCrossTabLease,
  releaseCrossTabLease,
  type LeaseStorage,
} from "@/lib/cross-tab-lease";

/**
 * How often one browser writes presence. Ring targets count as present for
 * PRESENCE_FRESH_MS (3 min), so this leaves room for two missed publishes.
 */
export const PRESENCE_PUBLISH_MS = 60_000;

const LEASE_KEY = "caretext:voice-presence";

export function claimPresencePublish(
  now = Date.now(),
  storage: LeaseStorage | null = browserLeaseStorage(),
): boolean {
  return claimCrossTabLease(LEASE_KEY, PRESENCE_PUBLISH_MS, now, storage);
}

export function releasePresencePublish(storage: LeaseStorage | null = browserLeaseStorage()): void {
  releaseCrossTabLease(LEASE_KEY, storage);
}
