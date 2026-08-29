import { prisma } from "@/lib/prisma";
import { ACTIVE_CALL_STATUSES } from "@/lib/voice/calls";
import {
  MAX_INBOUND_RING_TARGETS,
  PRESENCE_FRESH_MS,
  selectFallbackRingIdentities,
  selectInboundRingIdentities,
} from "@/lib/voice/presence";

async function busyUserIdsFor(userIds: string[]): Promise<Set<string>> {
  if (userIds.length === 0) {
    return new Set();
  }

  const busyCalls = await prisma.callLog.findMany({
    where: {
      initiatedById: { in: userIds },
      status: { in: ACTIVE_CALL_STATUSES },
    },
    select: { initiatedById: true },
  });

  return new Set(
    busyCalls
      .map((call) => call.initiatedById)
      .filter((id): id is string => Boolean(id)),
  );
}

export async function listInboundRingIdentities(now = new Date()): Promise<string[]> {
  const cutoff = new Date(now.getTime() - PRESENCE_FRESH_MS);

  const rows = await prisma.voicePresence.findMany({
    where: {
      lastSeenAt: { gte: cutoff },
      user: { disabledAt: null },
    },
    orderBy: { lastSeenAt: "desc" },
    select: {
      userId: true,
      lastSeenAt: true,
      user: { select: { disabledAt: true } },
    },
  });

  const presentIds = selectInboundRingIdentities({
    now,
    presence: rows.map((row) => ({
      userId: row.userId,
      lastSeenAt: row.lastSeenAt,
      disabledAt: row.user.disabledAt,
    })),
    busyUserIds: await busyUserIdsFor(rows.map((row) => row.userId)),
  });

  if (presentIds.length > 0) {
    return presentIds;
  }

  const users = await prisma.user.findMany({
    where: { disabledAt: null },
    orderBy: { updatedAt: "desc" },
    take: MAX_INBOUND_RING_TARGETS * 2,
    select: { id: true },
  });

  return selectFallbackRingIdentities({
    userIds: users.map((user) => user.id),
    busyUserIds: await busyUserIdsFor(users.map((user) => user.id)),
  });
}
