export const VOICE_MESSAGE_BODY = "Voice message";
export const VOICE_MAX_DURATION_SECONDS = 120;
/** CommStack attachment upload limit. */
export const VOICE_MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
export const VOICE_CONTENT_TYPE = "audio/mp4";
export const VOICE_FILENAME = "note.m4a";

export function isVoiceCommStackMessage(item: {
  type?: string | null;
  file?: string | null;
}): boolean {
  return item.type === "voice" && Boolean(item.file?.trim());
}

export function isIngestibleCommStackMessage(item: {
  type?: string | null;
  text?: string | null;
  file?: string | null;
}): boolean {
  if (isVoiceCommStackMessage(item)) return true;
  return Boolean(item.text?.trim());
}

export function assertValidVoiceDuration(seconds: number): void {
  if (!Number.isInteger(seconds) || seconds < 1 || seconds > VOICE_MAX_DURATION_SECONDS) {
    throw new Error(
      `Voice messages must be between 1 and ${VOICE_MAX_DURATION_SECONDS} seconds.`,
    );
  }
}

export function toClientMessageAttachment(
  attachment:
    | {
        id: string;
        contentType: string;
        filename: string;
        sizeBytes: number;
      }
    | null
    | undefined,
): {
  hasAttachment: boolean;
  contentType?: string;
  filename?: string;
  sizeBytes?: number;
} {
  if (!attachment) return { hasAttachment: false };
  return {
    hasAttachment: true,
    contentType: attachment.contentType,
    filename: attachment.filename,
    sizeBytes: attachment.sizeBytes,
  };
}

type ClientAttachmentMeta = {
  id: string;
  contentType: string;
  filename: string;
  sizeBytes: number;
};

export function serializeMessageForClient<
  T extends { attachment?: ClientAttachmentMeta | null },
>(message: T): Omit<T, "attachment"> & {
  hasAttachment: boolean;
  contentType?: string;
  filename?: string;
  sizeBytes?: number;
} {
  const { attachment, ...rest } = message;
  return {
    ...rest,
    ...toClientMessageAttachment(attachment),
  };
}
