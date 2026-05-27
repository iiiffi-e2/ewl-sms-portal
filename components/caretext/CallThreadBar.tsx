"use client";

import { formatCallThreadSummary } from "@/lib/call-log-display";
import { formatMessageTime } from "@/lib/format";

type CallThreadBarProps = {
  startedAt: string;
  status: string;
  durationSeconds: number | null;
};

export function CallThreadBar({ startedAt, status, durationSeconds }: CallThreadBarProps) {
  const durationLabel = formatCallThreadSummary({ status, durationSeconds });

  return (
    <div className="w-full rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-center text-sm text-emerald-900">
      <span className="font-semibold">Call placed</span>
      <span className="text-emerald-700"> · {formatMessageTime(startedAt)} · {durationLabel}</span>
    </div>
  );
}
