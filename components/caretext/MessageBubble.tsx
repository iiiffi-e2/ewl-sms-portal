import clsx from "clsx";
import { memo } from "react";
import { formatCallDuration } from "@/lib/call-log-display";
import { formatMessageTime } from "@/lib/format";

type MessageBubbleProps = {
  body: string;
  direction: "inbound" | "outbound";
  status: string;
  createdAt: string;
  reactions?: string[];
  // Optional inbound bubble styling override (e.g. per-sender colors in groups).
  inboundClassName?: string;
  messageType?: "text" | "voice" | "photo" | "pdf";
  durationSeconds?: number | null;
  hasAttachment?: boolean;
  messageId?: string;
};

export const MessageBubble = memo(function MessageBubble({
  body,
  direction,
  status,
  createdAt,
  reactions = [],
  inboundClassName,
  messageType,
  durationSeconds,
  hasAttachment,
  messageId,
}: MessageBubbleProps) {
  const outbound = direction === "outbound";
  const isVoice = messageType === "voice";
  const durationLabel = formatCallDuration(durationSeconds ?? null);

  return (
    <div className={clsx("flex", outbound ? "justify-end" : "justify-start")}>
      <div className={clsx("relative max-w-[85%] sm:max-w-[70%]", outbound ? "pr-1" : "pl-1")}>
        <div
          className={clsx(
            "rounded-2xl px-4 py-2 shadow-sm",
            outbound
              ? "bg-indigo-600 text-white"
              : (inboundClassName ?? "bg-white border border-border text-foreground"),
          )}
        >
          {isVoice ? (
            hasAttachment && messageId ? (
              <div className="space-y-1">
                <audio
                  controls
                  preload="metadata"
                  src={`/api/messages/${messageId}/attachment`}
                  className="max-w-full"
                />
                {durationLabel ? (
                  <p
                    className={clsx(
                      "text-xs",
                      outbound ? "text-indigo-100" : "text-muted",
                    )}
                  >
                    {durationLabel}
                  </p>
                ) : null}
              </div>
            ) : (
              <p className="text-sm italic">Audio unavailable</p>
            )
          ) : (
            <p className="whitespace-pre-wrap text-sm leading-relaxed">{body}</p>
          )}
          <div
            className={clsx(
              "mt-2 text-[11px]",
              outbound ? "text-indigo-100" : "text-muted",
            )}
          >
            {formatMessageTime(createdAt)} · {status}
          </div>
        </div>
        {reactions.length > 0 ? (
          <div
            className={clsx(
              "absolute -bottom-2 flex gap-0.5 rounded-full border border-border bg-white px-1.5 py-0.5 shadow-sm",
              outbound ? "right-2" : "left-2",
            )}
            aria-label={`${reactions.length} reaction${reactions.length === 1 ? "" : "s"}`}
          >
            {reactions.map((emoji, index) => (
              <span key={`${emoji}-${index}`} className="text-sm leading-none">
                {emoji}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
});
