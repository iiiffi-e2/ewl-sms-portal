"use client";

import { useState } from "react";
import { StatusBadge } from "@/components/caretext/StatusBadge";

type ConversationHeaderProps = {
  conversationId?: string;
  contactName?: string | null;
  phone?: string;
  facility?: string | null;
  status?: string;
  onStatusChange?: (status: string) => Promise<void>;
};

const statuses = ["new", "sms_sent", "awaiting_reply", "replied", "escalated", "closed"];

export function ConversationHeader({
  conversationId,
  contactName,
  phone,
  facility,
  status,
  onStatusChange,
}: ConversationHeaderProps) {
  const [isSaving, setIsSaving] = useState(false);

  if (!phone) {
    return (
      <div className="rounded-xl border border-border bg-white p-4">
        <p className="text-sm text-muted">Start a new conversation to see details.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-lg font-semibold">{contactName || phone}</p>
          <p className="text-sm text-muted">{phone}</p>
          {facility ? <p className="text-sm text-muted">Facility: {facility}</p> : null}
        </div>
        <div className="flex items-center gap-2">
          {status ? <StatusBadge status={status} /> : null}
          {status && onStatusChange ? (
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
          <a
            href={`tel:${phone}`}
            className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white"
            onClick={async () => {
              if (conversationId) {
                await fetch("/api/calls/log", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ conversationId, phone }),
                });
              }
            }}
          >
            Call
          </a>
        </div>
      </div>
    </div>
  );
}
