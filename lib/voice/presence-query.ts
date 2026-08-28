import { prisma } from "@/lib/prisma";
import { ACTIVE_CALL_STATUSES } from "@/lib/voice/calls";
import { PRESENCE_FRESH_MS, selectInboundRingIdentities } from "@/lib/voice/presence";

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

  const userIds = rows.map((row) => row.userId);
  const busyCalls =
    userIds.length === 0
      ? []
      : await prisma.callLog.findMany({
          where: {
            initiatedById: { in: userIds },
            status: { in: ACTIVE_CALL_STATUSES },
          },
          select: { initiatedById: true },
        });

  const busyUserIds = new Set(
    busyCalls
      .map((call) => call.initiatedById)
      .filter((id): id is string => Boolean(id)),
  );

  return selectInboundRingIdentities({
    now,
    presence: rows.map((row) => ({
      userId: row.userId,
      lastSeenAt: row.lastSeenAt,
      disabledAt: row.user.disabledAt,
    })),
    busyUserIds,
  });
}
