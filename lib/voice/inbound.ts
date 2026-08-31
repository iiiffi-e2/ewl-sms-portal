import { CallDirection, CallStatus } from "@prisma/client";
import { isTerminalCallStatus } from "@/lib/voice/status";

const UNCLAIMED_DIAL_STATUS_MAP: Record<string, CallStatus> = {
  "no-answer": CallStatus.no_answer,
  busy: CallStatus.busy,
  failed: CallStatus.failed,
  canceled: CallStatus.canceled,
  completed: CallStatus.no_answer,
};

const CLAIMED_DIAL_STATUS_MAP: Record<string, CallStatus> = {
  completed: CallStatus.completed,
  busy: CallStatus.busy,
  failed: CallStatus.failed,
  canceled: CallStatus.canceled,
};

export function inboundDialResultStatus(input: {
  status: CallStatus;
  initiatedById: string | null;
  dialCallStatus: string;
}): CallStatus | null {
  if (isTerminalCallStatus(input.status)) {
    return null;
  }

  if (input.initiatedById) {
    return CLAIMED_DIAL_STATUS_MAP[input.dialCallStatus] ?? null;
  }

  if (input.status !== CallStatus.ringing) {
    return null;
  }

  return UNCLAIMED_DIAL_STATUS_MAP[input.dialCallStatus] ?? null;
}

const MISSED_INBOUND_CALL_STATUSES = new Set<CallStatus>([
  CallStatus.no_answer,
  CallStatus.busy,
  CallStatus.failed,
  CallStatus.canceled,
]);

export function shouldEscalateConversationForMissedInbound(input: {
  initiatedById: string | null;
  nextCallStatus: CallStatus;
}): boolean {
  return input.initiatedById == null && MISSED_INBOUND_CALL_STATUSES.has(input.nextCallStatus);
}

export function canClaimInboundCall(input: {
  direction: CallDirection;
  status: CallStatus;
  endedAt: Date | null;
}): boolean {
  if (input.direction !== CallDirection.inbound || input.endedAt) {
    return false;
  }

  return input.status === CallStatus.ringing || input.status === CallStatus.in_progress;
}
