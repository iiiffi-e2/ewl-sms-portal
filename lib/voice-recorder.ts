/** Client-safe max duration; keep in sync with VOICE_MAX_DURATION_SECONDS. */
export const VOICE_RECORD_MAX_SECONDS = 120;

const RECORDER_MIME_CANDIDATES = [
  "audio/mp4",
  "audio/webm;codecs=opus",
  "audio/webm",
] as const;

export function pickRecorderMimeType(
  isTypeSupported: (mimeType: string) => boolean,
): string | undefined {
  return RECORDER_MIME_CANDIDATES.find((mimeType) => isTypeSupported(mimeType));
}

export function formatRecordingElapsed(seconds: number): string {
  const clamped = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(clamped / 60);
  const remainder = clamped % 60;
  return `${minutes}:${remainder.toString().padStart(2, "0")}`;
}

export function extensionForMimeType(mimeType: string): string {
  if (mimeType.includes("mp4")) return "m4a";
  return "webm";
}

export function toVoiceDurationSeconds(elapsedSeconds: number): number {
  const rounded = Math.round(elapsedSeconds);
  return Math.min(VOICE_RECORD_MAX_SECONDS, Math.max(1, rounded));
}

export function createVoiceSendFormData(payload: {
  conversationId: string;
  durationSeconds: number;
  blob: Blob;
  filename?: string;
}): FormData {
  const form = new FormData();
  form.append("conversationId", payload.conversationId);
  form.append("duration", String(payload.durationSeconds));
  const mimeType = payload.blob.type || "audio/webm";
  const filename =
    payload.filename ?? `note.${extensionForMimeType(mimeType)}`;
  form.append("audio", payload.blob, filename);
  return form;
}
