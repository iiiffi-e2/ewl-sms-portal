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
  isAdmin?: boolean;
  onClick: () => void;
  onDelete?: () => void;
};

export function ConversationListItem(props: ConversationListItemProps) {
  const optedOut = props.consentStatus === "opted_out";
  const showDelete = props.isAdmin && props.onDelete;

  return (
    <div
      className={clsx(
        "flex w-full items-start gap-1 rounded-lg border px-3 py-2.5 transition-colors",
        optedOut
          ? props.selected
            ? "border-red-400 bg-red-100 hover:bg-red-100"
            : "border-red-300 bg-red-50 hover:border-red-400 hover:bg-red-100"
          : props.selected
            ? "border-indigo-300 bg-indigo-50"
            : "border-border bg-white hover:border-indigo-200 hover:bg-slate-50",
      )}
    >
      <button type="button" onClick={props.onClick} className="min-w-0 flex-1 space-y-1.5 text-left">
        <div className="flex items-center gap-2">
          <p className={clsx("min-w-0 flex-1 truncate text-sm font-semibold", optedOut && "text-red-800")}>
            {props.name || props.phone}
          </p>
          <span className="shrink-0 whitespace-nowrap text-[11px] leading-none text-muted">
            {formatRelativeTime(props.lastMessageAt)}
          </span>
        </div>
        <p className="truncate text-xs text-muted">{props.preview || "No messages yet."}</p>
        <div className="flex items-center justify-between gap-2">
          {optedOut ? (
            <span className="inline-flex items-center rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
              Opted out — do not text
            </span>
          ) : (
            <StatusBadge status={props.status} />
          )}
          <span className="shrink-0 text-[11px] text-muted">{props.assignedTo || "Unassigned"}</span>
        </div>
        {props.unread ? <span className="inline-flex h-2 w-2 rounded-full bg-emerald-500" /> : null}
      </button>
      {showDelete ? (
        <button
          type="button"
          aria-label={`Remove thread for ${props.name || props.phone}`}
          className="-mr-1 shrink-0 rounded-md p-1 text-slate-400 hover:bg-white/80 hover:text-rose-600"
          onClick={(event) => {
            event.stopPropagation();
            props.onDelete?.();
          }}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="h-4 w-4"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 1 0 .23 1.482l.149-.022.841 10.518A2.75 2.75 0 0 0 7.596 19h4.807a2.75 2.75 0 0 0 2.742-2.53l.841-10.52.149.023a.75.75 0 0 0 .23-1.482A41.03 41.03 0 0 0 14 4.193V3.75A2.75 2.75 0 0 0 11.25 1h-2.5ZM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4ZM8.58 7.72a.75.75 0 0 0-1.5.06l.3 7.5a.75.75 0 1 0 1.5-.06l-.3-7.5Zm4.34.06a.75.75 0 1 0-1.5-.06l-.3 7.5a.75.75 0 1 0 1.5.06l.3-7.5Z"
              clipRule="evenodd"
            />
          </svg>
        </button>
      ) : null}
    </div>
  );
}
