import clsx from "clsx";
import { formatMessageTime } from "@/lib/format";

type MessageBubbleProps = {
  body: string;
  direction: "inbound" | "outbound";
  status: string;
  createdAt: string;
  reactions?: string[];
};

export function MessageBubble({
  body,
  direction,
  status,
  createdAt,
  reactions = [],
}: MessageBubbleProps) {
  const outbound = direction === "outbound";

  return (
    <div className={clsx("flex", outbound ? "justify-end" : "justify-start")}>
      <div className={clsx("relative max-w-[85%] sm:max-w-[70%]", outbound ? "pr-1" : "pl-1")}>
        <div
          className={clsx(
            "rounded-2xl px-4 py-2 shadow-sm",
            outbound ? "bg-indigo-600 text-white" : "bg-white border border-border text-foreground",
          )}
        >
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{body}</p>
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
}
