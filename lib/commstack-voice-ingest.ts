import {
  MessageDirection,
  MessageStatus,
  MessageType,
  Prisma,
} from "@prisma/client";
import {
  downloadCommStackAttachment,
  type ContactCommStackConfig,
} from "@/lib/commstack";
import { prisma } from "@/lib/prisma";
import {
  VOICE_CONTENT_TYPE,
  VOICE_FILENAME,
  VOICE_MESSAGE_BODY,
  isIngestibleCommStackMessage,
  isVoiceCommStackMessage,
} from "@/lib/voice-messages";

export type IngestCommStackItem = {
  messageId: string;
  type: string;
  text: string;
  file: string;
  duration: number;
  sender: string;
  createdAt?: string | Date | null;
};

export function voiceAttachmentFilename(file: string): string {
  const trimmed = file.trim();
  if (!trimmed) return VOICE_FILENAME;
  const base = trimmed.split(/[/\\]/).pop()?.trim();
  return base || VOICE_FILENAME;
}

/**
 * History/realtime often return `file` as `/uploads/<name>`. The SDK download
 * call already prefixes `/messages/uploads/`, so pass only the bare filename.
 */
export function normalizeCommStackUploadFile(file: string): string {
  const trimmed = file.trim();
  if (!trimmed) return trimmed;
  return trimmed.replace(/^\/?uploads\//i, "");
}

/** Notify sometimes reports voice duration in milliseconds. */
export function normalizeVoiceDurationSeconds(
  duration: number | null | undefined,
): number | null {
  const raw = Number(duration ?? 0);
  if (!Number.isFinite(raw) || raw <= 0) return null;
  const seconds = raw >= 1000 ? Math.round(raw / 1000) : Math.round(raw);
  return seconds > 0 ? seconds : null;
}

export function resolveInboundMessageFields(item: {
  type?: string | null;
  text?: string | null;
  file?: string | null;
  duration?: number | null;
}): {
  messageType: "voice" | "text";
  body: string;
  durationSeconds: number | null;
} {
  if (isVoiceCommStackMessage(item)) {
    return {
      messageType: "voice",
      body: item.text?.trim() || VOICE_MESSAGE_BODY,
      durationSeconds: normalizeVoiceDurationSeconds(item.duration),
    };
  }

  return {
    messageType: "text",
    body: item.text ?? "",
    durationSeconds: null,
  };
}

export function outboundEchoMatchFilter(item: {
  type?: string | null;
  text?: string | null;
  file?: string | null;
}): { messageType: "voice"; body: string } | { body: string } | null {
  if (isVoiceCommStackMessage(item)) {
    return { messageType: "voice", body: VOICE_MESSAGE_BODY };
  }

  const body = item.text?.trim();
  if (!body) return null;
  return { body };
}

/** Resolve which contact identity an outbound realtime echo belongs to. */
export function outboundEchoContactLookup(message: {
  channel_id?: string | null;
  receiver?: string | null;
}):
  | { notifyChannelId: string }
  | { notifyClientId: string }
  | null {
  const channelId = message.channel_id?.trim();
  if (channelId) return { notifyChannelId: channelId };

  const receiver = message.receiver?.trim();
  if (receiver) return { notifyClientId: receiver };

  return null;
}

async function tryCreateVoiceAttachment(
  config: ContactCommStackConfig,
  messageId: string,
  file: string,
): Promise<void> {
  const downloadKey = normalizeCommStackUploadFile(file);
  if (!downloadKey) return;

  try {
    const downloaded = await downloadCommStackAttachment(config, downloadKey);
    const bytes = Uint8Array.from(downloaded);
    await prisma.messageAttachment.create({
      data: {
        messageId,
        bytes,
        contentType: VOICE_CONTENT_TYPE,
        filename: voiceAttachmentFilename(file),
        sizeBytes: bytes.byteLength,
        // Store the key we actually download with (bare filename).
        commStackFile: downloadKey,
      },
    });
  } catch (error) {
    console.error(
      "[commstack] failed to download/store voice attachment",
      { file, downloadKey },
      error,
    );
  }
}

export async function persistInboundCommStackMessage(args: {
  conversationId: string;
  config: ContactCommStackConfig;
  item: IngestCommStackItem;
}): Promise<"created" | "exists" | "skipped"> {
  const { conversationId, config, item } = args;

  if (!isIngestibleCommStackMessage(item)) {
    return "skipped";
  }

  const existing = await prisma.message.findUnique({
    where: { commStackMessageId: item.messageId },
    select: {
      id: true,
      attachment: { select: { id: true } },
    },
  });

  if (existing) {
    if (
      isVoiceCommStackMessage(item) &&
      !existing.attachment &&
      item.file.trim()
    ) {
      await tryCreateVoiceAttachment(config, existing.id, item.file);
    }
    return "exists";
  }

  const fields = resolveInboundMessageFields(item);
  const createdAt = item.createdAt ? new Date(item.createdAt) : new Date();

  try {
    const message = await prisma.message.create({
      data: {
        conversationId,
        body: fields.body,
        messageType:
          fields.messageType === "voice" ? MessageType.voice : MessageType.text,
        durationSeconds: fields.durationSeconds,
        direction: MessageDirection.inbound,
        status: MessageStatus.received,
        commStackMessageId: item.messageId,
        createdAt: Number.isNaN(createdAt.getTime()) ? undefined : createdAt,
      },
    });

    if (fields.messageType === "voice" && item.file.trim()) {
      await tryCreateVoiceAttachment(config, message.id, item.file);
    }

    return "created";
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return "exists";
    }
    throw error;
  }
}
