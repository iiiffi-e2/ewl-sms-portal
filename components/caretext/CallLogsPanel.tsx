"use client";

import { formatCallDuration, formatCallStatusLabel } from "@/lib/call-log-display";
import { formatMessageTime } from "@/lib/format";

type CallLog = {
  id: string;
  phone: string;
  status: string;
  direction?: string | null;
  durationSeconds: number | null;
  startedAt: string;
  endedAt: string | null;
  outcome: string | null;
  initiatedBy: { name: string | null } | null;
};

type CallLogsPanelProps = {
  callLogs: CallLog[];
};

function statusTone(status: string): string {
  switch (status) {
    case "completed":
      return "text-emerald-700 bg-emerald-50 border-emerald-200";
    case "in_progress":
    case "ringing":
    case "initiating":
      return "text-indigo-700 bg-indigo-50 border-indigo-200";
    case "no_answer":
    case "busy":
      return "text-amber-700 bg-amber-50 border-amber-200";
    case "failed":
    case "canceled":
      return "text-rose-700 bg-rose-50 border-rose-200";
    default:
      return "text-slate-700 bg-slate-50 border-border";
  }
}

export function CallLogsPanel({ callLogs }: CallLogsPanelProps) {
  return (
    <div className="space-y-3 rounded-xl border border-border bg-white p-4">
      <p className="font-semibold">Call History</p>
      <div className="max-h-44 space-y-2 overflow-y-auto">
        {callLogs.map((callLog) => {
          const duration = formatCallDuration(callLog.durationSeconds);

          return (
            <div key={callLog.id} className="rounded-lg border border-border bg-slate-50 p-2">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`rounded-full border px-2 py-0.5 text-[11px] font-medium capitalize ${statusTone(callLog.status)}`}
                >
                  {formatCallStatusLabel(callLog.status)}
                </span>
                {duration ? <span className="text-[11px] text-muted">{duration}</span> : null}
              </div>
              <p className="mt-1 text-sm text-slate-900">
                {callLog.direction === "inbound" ? "Incoming" : "Outbound"} · {callLog.phone}
              </p>
              <p className="mt-1 text-[11px] text-muted">
                {callLog.initiatedBy?.name ??
                  (callLog.direction === "inbound" ? "Missed" : "Unknown")}{" "}
                · {formatMessageTime(callLog.startedAt)}
              </p>
            </div>
          );
        })}
        {!callLogs.length ? <p className="text-sm text-muted">No calls yet.</p> : null}
      </div>
    </div>
  );
}
