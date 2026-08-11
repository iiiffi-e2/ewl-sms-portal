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
    const duration = Number(item.duration ?? 0);
    return {
      messageType: "voice",
      body: item.text?.trim() || VOICE_MESSAGE_BODY,
      durationSeconds: duration || null,
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

async function tryCreateVoiceAttachment(
  config: ContactCommStackConfig,
  messageId: string,
  file: string,
): Promise<void> {
  try {
    const downloaded = await downloadCommStackAttachment(config, file);
    const bytes = Uint8Array.from(downloaded);
    await prisma.messageAttachment.create({
      data: {
        messageId,
        bytes,
        contentType: VOICE_CONTENT_TYPE,
        filename: voiceAttachmentFilename(file),
        sizeBytes: bytes.byteLength,
        commStackFile: file,
      },
    });
  } catch (error) {
    console.error(
      "[commstack] failed to download/store voice attachment",
      file,
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
