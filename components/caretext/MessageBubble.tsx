import clsx from "clsx";
import { formatMessageTime } from "@/lib/format";

type MessageBubbleProps = {
  body: string;
  direction: "inbound" | "outbound";
  status: string;
  createdAt: string;
};

export function MessageBubble({ body, direction, status, createdAt }: MessageBubbleProps) {
  const outbound = direction === "outbound";

  return (
    <div className={clsx("flex", outbound ? "justify-end" : "justify-start")}>
      <div
        className={clsx(
          "max-w-[85%] rounded-2xl px-4 py-2 shadow-sm sm:max-w-[70%]",
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
    </div>
  );
}
