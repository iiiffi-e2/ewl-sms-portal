"use client";

import { useEffect, useState } from "react";

type SendAlertModalProps = {
  open: boolean;
  sourceMessagePreview: string;
  initialRoom: string;
  conversationId: string;
  messageId: string;
  onClose: () => void;
  onSent: () => void;
};

export function SendAlertModal({
  open,
  sourceMessagePreview,
  initialRoom,
  conversationId,
  messageId,
  onClose,
  onSent,
}: SendAlertModalProps) {
  const [room, setRoom] = useState(initialRoom);
  const [note, setNote] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }
    setRoom(initialRoom);
    setNote("");
    setIsSending(false);
    setError(null);
    setSuccess(false);
  }, [open, initialRoom, conversationId, messageId]);

  if (!open) {
    return null;
  }

  const canSubmit = room.trim().length > 0 && !isSending && !success;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-white p-5 shadow-lg">
        <h2 className="text-lg font-semibold text-slate-900">Send alert</h2>
        <p className="mt-2 text-sm text-muted">
          Send a Notify alert for this message. Room is required; note is optional and stays in
          CareText only.
        </p>
        <p className="mt-3 rounded-lg border border-border bg-slate-50 px-3 py-2 text-sm text-slate-700 whitespace-pre-wrap">
          {sourceMessagePreview}
        </p>

        <label className="mt-4 block text-sm font-medium text-slate-900">
          Room
          <input
            value={room}
            onChange={(event) => setRoom(event.target.value)}
            disabled={isSending || success}
            className="mt-1 w-full rounded-lg border border-border bg-white px-3 py-2 text-sm"
            placeholder="e.g. 214"
          />
        </label>

        <label className="mt-3 block text-sm font-medium text-slate-900">
          Note <span className="font-normal text-muted">(optional)</span>
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            disabled={isSending || success}
            rows={3}
            className="mt-1 w-full rounded-lg border border-border bg-white px-3 py-2 text-sm"
            placeholder="Internal note for CareText audit"
          />
        </label>

        {error ? <p className="mt-2 text-sm text-rose-700">{error}</p> : null}
        {success ? <p className="mt-2 text-sm text-emerald-700">Alert sent.</p> : null}

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            disabled={isSending}
            className="rounded-lg border border-border bg-white px-3 py-2 text-sm font-medium"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canSubmit}
            className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
            onClick={async () => {
              const trimmedRoom = room.trim();
              if (!trimmedRoom) {
                setError("Room is required.");
                return;
              }

              setIsSending(true);
              setError(null);
              try {
                const response = await fetch("/api/alerts/send", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    conversationId,
                    messageId,
                    room: trimmedRoom,
                    note: note.trim() || undefined,
                  }),
                });

                const data = (await response.json().catch(() => ({}))) as {
                  error?: string | { formErrors?: string[] };
                };

                if (!response.ok) {
                  const message =
                    typeof data.error === "string"
                      ? data.error
                      : data.error?.formErrors?.[0] || "Failed to send alert.";
                  throw new Error(message);
                }

                setSuccess(true);
                onSent();
                window.setTimeout(() => {
                  onClose();
                }, 900);
              } catch (sendError) {
                setError(
                  sendError instanceof Error ? sendError.message : "Failed to send alert.",
                );
              } finally {
                setIsSending(false);
              }
            }}
          >
            {isSending ? "Sending..." : "Send alert"}
          </button>
        </div>
      </div>
    </div>
  );
}
