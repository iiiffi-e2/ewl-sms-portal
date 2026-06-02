"use client";

import { useState } from "react";

type DeleteConversationModalProps = {
  contactLabel: string;
  onCancel: () => void;
  onConfirm: () => Promise<void>;
};

export function DeleteConversationModal({
  contactLabel,
  onCancel,
  onConfirm,
}: DeleteConversationModalProps) {
  const [deleteConfirmationValue, setDeleteConfirmationValue] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-white p-5 shadow-lg">
        <h2 className="text-lg font-semibold text-slate-900">Remove this thread?</h2>
        <p className="mt-2 text-sm text-muted">
          This removes the conversation with{" "}
          <span className="font-semibold text-slate-900">{contactLabel}</span> from your view. The
          thread and its messages will remain stored in the database.
        </p>
        <p className="mt-2 text-sm text-muted">
          Type <span className="font-semibold text-slate-900">CONFIRM</span> to continue.
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
            onClick={onCancel}
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
                await onConfirm();
              } catch (error) {
                setDeleteError(
                  error instanceof Error ? error.message : "Failed to remove conversation.",
                );
              } finally {
                setIsDeleting(false);
              }
            }}
          >
            {isDeleting ? "Removing..." : "Remove thread"}
          </button>
        </div>
      </div>
    </div>
  );
}
