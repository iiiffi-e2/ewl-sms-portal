"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useVoiceCall } from "@/components/caretext/VoiceCallProvider";
import { formatCallDuration, formatCallStatusLabel } from "@/lib/call-log-display";
import { canSaveContactFromCallLog, type CallLogListItem } from "@/lib/voice/call-log-list";
import { formatMessageTime } from "@/lib/format";

export function CallsPageClient() {
  const { startCall, isCallActive, errorMessage } = useVoiceCall();
  const [callLogs, setCallLogs] = useState<CallLogListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saveFor, setSaveFor] = useState<CallLogListItem | null>(null);
  const [saveName, setSaveName] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch("/api/calls");
    if (!response.ok) {
      throw new Error("Failed to load calls.");
    }
    const data = (await response.json()) as { callLogs: CallLogListItem[] };
    setCallLogs(data.callLogs);
  }, []);

  useEffect(() => {
    void load().catch((loadError: unknown) => {
      setError(loadError instanceof Error ? loadError.message : "Failed to load calls.");
    });
  }, [load]);

  async function onSaveContact() {
    if (!saveFor) {
      return;
    }
    setIsSaving(true);
    setSaveError(null);
    try {
      const response = await fetch("/api/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: saveName.trim() || null, phone: saveFor.phone }),
      });
      if (!response.ok) {
        const data = (await response.json()) as { error?: unknown };
        throw new Error(
          typeof data.error === "string" ? data.error : "Could not save contact.",
        );
      }
      await load();
      setSaveFor(null);
      setSaveName("");
    } catch (saveErr) {
      setSaveError(saveErr instanceof Error ? saveErr.message : "Could not save contact.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="rounded-xl border border-border bg-white p-4">
      <h1 className="text-lg font-semibold">Calls</h1>
      <p className="mb-4 text-sm text-muted">Inbound and outbound facility call history.</p>
      {errorMessage ? <p className="text-sm text-rose-700">{errorMessage}</p> : null}
      {error ? <p className="text-sm text-rose-700">{error}</p> : null}
      {!callLogs && !error ? <p className="text-sm text-muted">Loading…</p> : null}
      {callLogs && callLogs.length === 0 ? (
        <p className="text-sm text-muted">No calls yet.</p>
      ) : null}
      <div className="space-y-2">
        {callLogs?.map((log) => {
          const duration = formatCallDuration(log.durationSeconds);
          const showSave = canSaveContactFromCallLog({
            hasContact: Boolean(log.contact),
            status: log.status,
          });
          const nameNode = log.contact ? (
            log.conversationId ? (
              <Link
                href={`/dashboard?conversationId=${log.conversationId}`}
                className="font-medium text-emerald-800 underline"
              >
                {log.contact.name || log.phone}
              </Link>
            ) : (
              <Link href="/contacts" className="font-medium text-emerald-800 underline">
                {log.contact.name || log.phone}
              </Link>
            )
          ) : (
            <span className="font-medium">{log.phone}</span>
          );

          return (
            <article key={log.id} className="rounded-lg border border-border bg-slate-50 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs capitalize text-muted">
                  {log.direction === "inbound" ? "Incoming" : "Outbound"}
                </span>
                <span className="text-xs capitalize text-muted">{formatCallStatusLabel(log.status)}</span>
                {duration ? <span className="text-xs text-muted">{duration}</span> : null}
              </div>
              <p className="mt-1 text-sm">{nameNode}</p>
              <p className="text-[11px] text-muted">
                {log.initiatedBy?.name ?? (log.direction === "inbound" ? "Missed" : "Unknown")}{" "}
                · {formatMessageTime(log.startedAt)}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={isCallActive}
                  className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={() => void startCall({ phone: log.phone, contactName: log.contact?.name })}
                >
                  Redial
                </button>
                {showSave ? (
                  <button
                    type="button"
                    className="rounded-lg border border-border bg-white px-3 py-1.5 text-sm"
                    onClick={() => {
                      setSaveFor(log);
                      setSaveName(log.contact?.name ?? "");
                      setSaveError(null);
                    }}
                  >
                    Save contact
                  </button>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>

      {saveFor ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-sm rounded-xl border border-border bg-white p-4">
            <h2 className="text-lg font-semibold">Save contact</h2>
            <p className="mb-3 text-sm text-muted">{saveFor.phone}</p>
            <label className="mb-1 block text-sm" htmlFor="save-contact-name">
              Name
            </label>
            <input
              id="save-contact-name"
              value={saveName}
              onChange={(event) => setSaveName(event.target.value)}
              className="mb-3 w-full rounded-lg border border-border px-3 py-2"
            />
            {saveError ? <p className="mb-2 text-sm text-rose-700">{saveError}</p> : null}
            <div className="flex gap-2">
              <button
                type="button"
                className="flex-1 rounded-lg border border-border px-3 py-2 text-sm"
                onClick={() => setSaveFor(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isSaving}
                className="flex-1 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                onClick={() => void onSaveContact()}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
