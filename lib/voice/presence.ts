export const PRESENCE_FRESH_MS = 45_000;
export const PRESENCE_HEARTBEAT_MS = 15_000;
export const MAX_INBOUND_RING_TARGETS = 10;

export type PresenceRow = {
  userId: string;
  lastSeenAt: Date;
  disabledAt: Date | null;
};

export function selectInboundRingIdentities(input: {
  now: Date;
  presence: PresenceRow[];
  busyUserIds: Set<string>;
}): string[] {
  const cutoff = input.now.getTime() - PRESENCE_FRESH_MS;

  return input.presence
    .filter((row) => row.lastSeenAt.getTime() >= cutoff)
    .filter((row) => row.disabledAt == null)
    .filter((row) => !input.busyUserIds.has(row.userId))
    .sort((left, right) => right.lastSeenAt.getTime() - left.lastSeenAt.getTime())
    .slice(0, MAX_INBOUND_RING_TARGETS)
    .map((row) => row.userId);
}
