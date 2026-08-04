import clsx from "clsx";

type Participant = {
  status: string;
  contact: {
    name: string | null;
    phone: string | null;
  };
};

type GroupParticipantsPanelProps = {
  participants: Participant[];
};

const statusStyleMap: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-700",
  pending_intro: "bg-amber-100 text-amber-700",
  removed: "bg-zinc-200 text-zinc-700",
};

const statusLabelMap: Record<string, string> = {
  active: "Active",
  pending_intro: "Pending opt-in",
  removed: "Removed",
};

export function GroupParticipantsPanel({ participants }: GroupParticipantsPanelProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {participants.map((participant, index) => (
        <span
          key={`${participant.contact.phone ?? "unknown"}-${index}`}
          className="inline-flex items-center gap-2 rounded-full border border-border bg-white px-3 py-1 text-xs font-medium text-slate-900"
        >
          {participant.contact.name ?? participant.contact.phone ?? "Unknown"}
          <span
            className={clsx(
              "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold",
              statusStyleMap[participant.status] ?? "bg-zinc-100 text-zinc-700",
            )}
          >
            {statusLabelMap[participant.status] ?? participant.status.replaceAll("_", " ")}
          </span>
        </span>
      ))}
    </div>
  );
}
