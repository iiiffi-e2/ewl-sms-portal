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
  isAdmin?: boolean;
  onDeleteConversation?: () => Promise<void>;
};

const statuses = ["new", "sms_sent", "awaiting_reply", "replied", "escalated", "closed"];

export function ConversationHeader({
  conversationId,
  contactName,
  phone,
  facility,
  status,
  onStatusChange,
  isAdmin,
  onDeleteConversation,
}: ConversationHeaderProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deleteConfirmationValue, setDeleteConfirmationValue] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  if (!phone) {
    return (
      <div className="rounded-xl border border-border bg-white p-4">
        <p className="text-sm text-muted">Start a new conversation to see details.</p>
      </div>
    );
  }

  return (
    <>
      <div className="rounded-xl border border-border bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-lg font-semibold">{contactName || phone}</p>
            <p className="text-sm text-muted">{phone}</p>
            {facility ? <p className="text-sm text-muted">Facility: {facility}</p> : null}
          </div>
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:flex-nowrap">
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
            {isAdmin && conversationId && onDeleteConversation ? (
              <button
                type="button"
                className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700"
                onClick={() => {
                  setDeleteError(null);
                  setDeleteConfirmationValue("");
                  setIsDeleteModalOpen(true);
                }}
              >
                Delete thread
              </button>
            ) : null}
            <a
              href={`tel:${phone}`}
              className="ml-auto rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white sm:ml-0"
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

      {isDeleteModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
          <div className="w-full max-w-md rounded-xl border border-border bg-white p-5 shadow-lg">
            <h2 className="text-lg font-semibold text-slate-900">Delete this thread?</h2>
            <p className="mt-2 text-sm text-muted">
              This permanently deletes the conversation and its messages. Type{" "}
              <span className="font-semibold text-slate-900">CONFIRM</span> to continue.
            </p>
            <input
              value={deleteConfirmationValue}
              onChange={(event) => setDeleteConfirmationValue(event.target.value)}
              placeholder="Type CONFIRM"
              className="mt-3 w-full rounded-lg border border-border px-3 py-2 text-sm"
            />
            {deleteError ? <p className="mt-2 text-sm text-rose-700">{deleteError}</p> : null}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                disabled={isDeleting}
                className="rounded-lg border border-border bg-white px-3 py-2 text-sm font-medium"
                onClick={() => {
                  setIsDeleteModalOpen(false);
                  setDeleteError(null);
                  setDeleteConfirmationValue("");
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeleting || deleteConfirmationValue !== "CONFIRM"}
                className="rounded-lg bg-rose-600 px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                onClick={async () => {
                  if (deleteConfirmationValue !== "CONFIRM") {
                    return;
                  }

                  setIsDeleting(true);
                  setDeleteError(null);
                  try {
                    await onDeleteConversation?.();
                    setIsDeleteModalOpen(false);
                    setDeleteConfirmationValue("");
                  } catch (error) {
                    setDeleteError(
                      error instanceof Error ? error.message : "Failed to delete conversation.",
                    );
                  } finally {
                    setIsDeleting(false);
                  }
                }}
              >
                {isDeleting ? "Deleting..." : "Delete thread"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
