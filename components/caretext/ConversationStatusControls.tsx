"use client";

import { useState } from "react";
import { StatusBadge } from "@/components/caretext/StatusBadge";

const statuses = ["new", "sms_sent", "awaiting_reply", "replied", "escalated", "closed"];

type ConversationStatusControlsProps = {
  status?: string;
  onStatusChange?: (status: string) => Promise<void>;
};

export function ConversationStatusControls({
  status,
  onStatusChange,
}: ConversationStatusControlsProps) {
  const [isSaving, setIsSaving] = useState(false);

  if (!status) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <StatusBadge status={status} />
      {onStatusChange ? (
        <select
          defaultValue={status}
          disabled={isSaving}
          className="rounded-lg border border-border px-2 py-1 text-xs"
          onChange={async (event) => {
            setIsSaving(true);
            try {
              await onStatusChange(event.target.value);
            } finally {
              setIsSaving(false);
            }
          }}
        >
          {statuses.map((statusValue) => (
            <option key={statusValue} value={statusValue}>
              {statusValue.replaceAll("_", " ")}
            </option>
          ))}
        </select>
      ) : null}
    </div>
  );
}
