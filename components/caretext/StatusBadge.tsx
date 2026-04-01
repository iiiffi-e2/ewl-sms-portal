import clsx from "clsx";

const statusStyleMap: Record<string, string> = {
  new: "bg-slate-100 text-slate-700",
  sms_sent: "bg-indigo-100 text-indigo-700",
  awaiting_reply: "bg-amber-100 text-amber-700",
  replied: "bg-emerald-100 text-emerald-700",
  escalated: "bg-rose-100 text-rose-700",
  closed: "bg-zinc-200 text-zinc-700",
};

function statusLabel(status: string) {
  return status.replaceAll("_", " ");
}

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold capitalize",
        statusStyleMap[status] ?? "bg-zinc-100 text-zinc-700",
      )}
    >
      {statusLabel(status)}
    </span>
  );
}
