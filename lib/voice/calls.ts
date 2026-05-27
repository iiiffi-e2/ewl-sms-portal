import { CallStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const SETUP_STALE_MS = 2 * 60 * 1000;
const IN_PROGRESS_STALE_MS = 4 * 60 * 60 * 1000;

export async function expireStaleActiveCalls(userId: string) {
  const now = Date.now();

  // Calls that never reached Twilio can be cleared immediately on retry.
  await prisma.callLog.updateMany({
    where: {
      initiatedById: userId,
      status: { in: [CallStatus.initiating, CallStatus.ringing] },
      twilioSid: null,
    },
    data: {
      status: CallStatus.canceled,
      endedAt: new Date(),
      outcome: "stale",
    },
  });

  await prisma.callLog.updateMany({
    where: {
      initiatedById: userId,
      status: { in: [CallStatus.initiating, CallStatus.ringing] },
      startedAt: { lt: new Date(now - SETUP_STALE_MS) },
    },
    data: {
      status: CallStatus.canceled,
      endedAt: new Date(),
      outcome: "stale",
    },
  });

  await prisma.callLog.updateMany({
    where: {
      initiatedById: userId,
      status: CallStatus.in_progress,
      startedAt: { lt: new Date(now - IN_PROGRESS_STALE_MS) },
    },
    data: {
      status: CallStatus.canceled,
      endedAt: new Date(),
      outcome: "stale",
    },
  });
}

export const ACTIVE_CALL_STATUSES: CallStatus[] = [
  CallStatus.initiating,
  CallStatus.ringing,
  CallStatus.in_progress,
];

export function activeCallWhere(userId: string): Prisma.CallLogWhereInput {
  return {
    initiatedById: userId,
    status: { in: ACTIVE_CALL_STATUSES },
  };
}
