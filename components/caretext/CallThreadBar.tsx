"use client";

import { formatCallThreadSummary, formatCallThreadTitle } from "@/lib/call-log-display";
import { formatMessageTime } from "@/lib/format";

type CallThreadBarProps = {
  startedAt: string;
  status: string;
  durationSeconds: number | null;
  direction?: string | null;
};

export function CallThreadBar({
  startedAt,
  status,
  durationSeconds,
  direction,
}: CallThreadBarProps) {
  const durationLabel = formatCallThreadSummary({ status, durationSeconds });
  const title = formatCallThreadTitle({ direction, status });
  const missed = title === "Missed call";

  return (
    <div
      className={`w-full rounded-lg border px-4 py-3 text-center text-sm ${
        missed
          ? "border-amber-200 bg-amber-50 text-amber-950"
          : "border-emerald-200 bg-emerald-50 text-emerald-900"
      }`}
    >
      <span className="font-semibold">{title}</span>
      <span className={missed ? "text-amber-800" : "text-emerald-700"}>
        {" "}
        · {formatMessageTime(startedAt)} · {durationLabel}
      </span>
    </div>
  );
}
