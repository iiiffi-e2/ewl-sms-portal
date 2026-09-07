import { CallStatus } from "@prisma/client";

const TWILIO_STATUS_MAP: Record<string, CallStatus> = {
  queued: CallStatus.initiating,
  initiated: CallStatus.initiating,
  ringing: CallStatus.ringing,
  "in-progress": CallStatus.in_progress,
  answered: CallStatus.in_progress,
  completed: CallStatus.completed,
  busy: CallStatus.busy,
  "no-answer": CallStatus.no_answer,
  failed: CallStatus.failed,
  canceled: CallStatus.canceled,
};

export function mapTwilioCallStatus(twilioStatus: string): CallStatus {
  return TWILIO_STATUS_MAP[twilioStatus] ?? CallStatus.failed;
}

const TERMINAL_STATUSES = new Set<CallStatus>([
  CallStatus.completed,
  CallStatus.failed,
  CallStatus.no_answer,
  CallStatus.busy,
  CallStatus.canceled,
]);

export function isTerminalCallStatus(status: CallStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}

export function buildVoiceStatusUpdate(input: {
  currentStatus: CallStatus;
  endedAt: Date | null;
  mappedStatus: CallStatus;
  twilioOutcome: string;
  callSid: string;
  durationSeconds?: number;
}): {
  twilioSid: string;
  status?: CallStatus;
  outcome: string;
  endedAt?: Date;
  durationSeconds?: number;
} | null {
  const alreadyTerminal = Boolean(input.endedAt) || isTerminalCallStatus(input.currentStatus);
  const mappedTerminal = isTerminalCallStatus(input.mappedStatus);
  const durationSeconds = Number.isFinite(input.durationSeconds)
    ? input.durationSeconds
    : undefined;

  if (alreadyTerminal && !mappedTerminal) {
    return null;
  }

  if (alreadyTerminal) {
    return {
      twilioSid: input.callSid,
      outcome: input.twilioOutcome,
      ...(durationSeconds !== undefined ? { durationSeconds } : {}),
    };
  }

  return {
    twilioSid: input.callSid,
    status: input.mappedStatus,
    outcome: input.twilioOutcome,
    ...(mappedTerminal
      ? {
          endedAt: input.endedAt ?? new Date(),
          ...(durationSeconds !== undefined ? { durationSeconds } : {}),
        }
      : {}),
  };
}
