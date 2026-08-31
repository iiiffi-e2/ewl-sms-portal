"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useVoiceCall } from "@/components/caretext/VoiceCallProvider";
import { formatCallDuration, formatCallStatusLabel } from "@/lib/call-log-display";
import { formatDialerDisplay } from "@/lib/dialer";
import { formatMessageTime } from "@/lib/format";
import {
  DEFAULT_CALL_LOG_LIMIT,
  canSaveContactFromCallLog,
  type CallLogListItem,
} from "@/lib/voice/call-log-list";

export function CallsPageClient() {
  const { startCall, isCallActive, errorMessage } = useVoiceCall();
  const [callLogs, setCallLogs] = useState<CallLogListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saveFor, setSaveFor] = useState<CallLogListItem | null>(null);
  const [saveName, setSaveName] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_CALL_LOG_LIMIT);
  const [total, setTotal] = useState(0);

  const load = useCallback(async (nextPage = page) => {
    const response = await fetch(`/api/calls?page=${nextPage}&limit=${DEFAULT_CALL_LOG_LIMIT}`);
    if (!response.ok) {
      throw new Error("Failed to load calls.");
    }
    const data = (await response.json()) as {
      callLogs: CallLogListItem[];
      page?: number;
      pageSize?: number;
      total?: number;
    };
    setCallLogs(data.callLogs);
    setPage(data.page ?? nextPage);
    setPageSize(data.pageSize ?? DEFAULT_CALL_LOG_LIMIT);
    setTotal(data.total ?? data.callLogs.length);
    setError(null);
  }, [page]);

  useEffect(() => {
    void load(page).catch((loadError: unknown) => {
      setError(loadError instanceof Error ? loadError.message : "Failed to load calls.");
    });
  }, [load, page]);

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
      await load(page);
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
      {callLogs && callLogs.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="min-w-full border-collapse text-left text-sm">
            <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-muted">
              <tr>
                <th className="whitespace-nowrap px-3 py-2">Direction</th>
                <th className="whitespace-nowrap px-3 py-2">Number</th>
                <th className="whitespace-nowrap px-3 py-2">Staff</th>
                <th className="whitespace-nowrap px-3 py-2">Time</th>
                <th className="whitespace-nowrap px-3 py-2">Duration</th>
                <th className="whitespace-nowrap px-3 py-2">Status</th>
                <th className="whitespace-nowrap px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {callLogs.map((log) => {
                const duration = formatCallDuration(log.durationSeconds);
                const showSave = canSaveContactFromCallLog({
                  hasContact: Boolean(log.contact),
                  status: log.status,
                });
                const displayPhone = formatDialerDisplay(log.phone);
                const contactLabel = log.contact?.name || displayPhone;

                return (
                  <tr key={log.id} className="bg-white hover:bg-slate-50">
                    <td className="whitespace-nowrap px-3 py-2 text-muted">
                      {log.direction === "inbound" ? "Incoming" : "Outbound"}
                    </td>
                    <td className="px-3 py-2">
                      {log.contact ? (
                        <Link
                          href={
                            log.conversationId
                              ? `/dashboard?conversationId=${log.conversationId}`
                              : "/contacts"
                          }
                          className="font-medium text-emerald-800 underline"
                        >
                          {contactLabel}
                        </Link>
                      ) : (
                        <span className="font-medium">{displayPhone}</span>
                      )}
                      {log.contact?.name ? (
                        <p className="text-[11px] text-muted">{displayPhone}</p>
                      ) : null}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-muted">
                      {log.initiatedBy?.name ?? (log.direction === "inbound" ? "Missed" : "Unknown")}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-muted">
                      {formatMessageTime(log.startedAt)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-muted">{duration ?? "—"}</td>
                    <td className="whitespace-nowrap px-3 py-2 capitalize text-muted">
                      {formatCallStatusLabel(log.status)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          disabled={isCallActive}
                          className="rounded-md bg-emerald-600 px-2 py-1 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                          onClick={() =>
                            void startCall({ phone: log.phone, contactName: log.contact?.name })
                          }
                        >
                          Redial
                        </button>
                        {showSave ? (
                          <button
                            type="button"
                            className="rounded-md border border-border bg-white px-2 py-1 text-xs"
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
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
      {callLogs && total > 0 ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-muted">
          <p>
            Showing {Math.min((page - 1) * pageSize + 1, total)}–{Math.min(page * pageSize, total)} of{" "}
            {total}
          </p>
          {total > pageSize ? (
            <div className="flex gap-2">
              <button
                type="button"
                disabled={page <= 1}
                className="rounded-md border border-border bg-white px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                Previous
              </button>
              <button
                type="button"
                disabled={page * pageSize >= total}
                className="rounded-md border border-border bg-white px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                onClick={() => setPage((current) => current + 1)}
              >
                Next
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

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
