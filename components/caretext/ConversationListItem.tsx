import clsx from "clsx";
import { StatusBadge } from "@/components/caretext/StatusBadge";
import { formatRelativeTime } from "@/lib/format";

type ConversationListItemProps = {
  id: string;
  name: string;
  phone: string;
  preview: string;
  status: string;
  consentStatus?: "none" | "opted_in" | "opted_out";
  assignedTo?: string | null;
  lastMessageAt: string;
  unread?: boolean;
  selected?: boolean;
  onClick: () => void;
};

export function ConversationListItem(props: ConversationListItemProps) {
  const optedOut = props.consentStatus === "opted_out";

  return (
    <button
      onClick={props.onClick}
      className={clsx(
        "w-full space-y-1 rounded-lg border px-3 py-2 text-left transition-colors",
        optedOut
          ? props.selected
            ? "border-red-400 bg-red-100 hover:bg-red-100"
            : "border-red-300 bg-red-50 hover:border-red-400 hover:bg-red-100"
          : props.selected
            ? "border-indigo-300 bg-indigo-50"
            : "border-border bg-white hover:border-indigo-200 hover:bg-slate-50",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className={clsx("truncate text-sm font-semibold", optedOut && "text-red-800")}>
          {props.name || props.phone}
        </p>
        <span className="text-[11px] text-muted">{formatRelativeTime(props.lastMessageAt)}</span>
      </div>
      <p className="truncate text-xs text-muted">{props.preview || "No messages yet."}</p>
      <div className="flex items-center justify-between">
        {optedOut ? (
          <span className="inline-flex items-center rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
            Opted out — do not text
          </span>
        ) : (
          <StatusBadge status={props.status} />
        )}
        <span className="text-[11px] text-muted">{props.assignedTo || "Unassigned"}</span>
      </div>
      {props.unread ? <span className="inline-flex h-2 w-2 rounded-full bg-emerald-500" /> : null}
    </button>
  );
}
