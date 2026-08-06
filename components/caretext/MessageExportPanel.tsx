"use client";

import { useCallback, useEffect, useState } from "react";

type ContactOption = {
  id: string;
  name: string | null;
  phone: string | null;
};

type ConversationOption = {
  id: string;
  lastMessageAt: string;
  status: string;
};

export function MessageExportPanel() {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [contactQuery, setContactQuery] = useState("");
  const [contactOptions, setContactOptions] = useState<ContactOption[]>([]);
  const [selectedContactId, setSelectedContactId] = useState("");
  const [conversationOptions, setConversationOptions] = useState<ConversationOption[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);

  const loadContacts = useCallback(async (query: string) => {
    const params = query.trim() ? `?q=${encodeURIComponent(query.trim())}` : "";
    const response = await fetch(`/api/contacts${params}`);
    if (!response.ok) {
      return;
    }

    const data = (await response.json()) as { contacts: ContactOption[] };
    setContactOptions(data.contacts);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadContacts(contactQuery);
    }, 250);

    return () => window.clearTimeout(timer);
  }, [contactQuery, loadContacts]);

  useEffect(() => {
    if (!selectedContactId) {
      setConversationOptions([]);
      setSelectedConversationId("");
      return;
    }

    void (async () => {
      const response = await fetch(
        `/api/conversations?contactId=${encodeURIComponent(selectedContactId)}&includeArchived=1`,
      );
      if (!response.ok) {
        setConversationOptions([]);
        setSelectedConversationId("");
        return;
      }

      const data = (await response.json()) as { conversations: ConversationOption[] };
      setConversationOptions(data.conversations);
      setSelectedConversationId("");
    })();
  }, [selectedContactId]);

  async function handleDownload() {
    setError(null);
    setIsDownloading(true);

    try {
      const params = new URLSearchParams();
      if (startDate) {
        params.set("startDate", startDate);
      }
      if (endDate) {
        params.set("endDate", endDate);
      }
      if (selectedContactId) {
        params.set("contactId", selectedContactId);
      }
      if (selectedConversationId) {
        params.set("conversationId", selectedConversationId);
      }

      const query = params.toString();
      const response = await fetch(query ? `/api/messages/export?${query}` : "/api/messages/export");

      if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        setError(typeof data.error === "string" ? data.error : "Export failed.");
        return;
      }

      const blob = await response.blob();
      const disposition = response.headers.get("Content-Disposition") ?? "";
      const filenameMatch = disposition.match(/filename="([^"]+)"/);
      const filename = filenameMatch?.[1] ?? "caretext-messages.csv";

      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("Export failed.");
    } finally {
      setIsDownloading(false);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-white p-4">
      <h2 className="text-lg font-semibold">Export Messages</h2>
      <p className="mt-1 text-sm text-muted">
        Download SMS history as CSV. All filters are optional.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Start date</span>
          <input
            type="date"
            className="rounded-lg border border-border px-3 py-2"
            value={startDate}
            onChange={(event) => setStartDate(event.target.value)}
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium">End date</span>
          <input
            type="date"
            className="rounded-lg border border-border px-3 py-2"
            value={endDate}
            onChange={(event) => setEndDate(event.target.value)}
          />
        </label>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Contact</span>
          <input
            className="rounded-lg border border-border px-3 py-2"
            placeholder="Search by name or phone"
            value={contactQuery}
            onChange={(event) => setContactQuery(event.target.value)}
          />
          <select
            className="rounded-lg border border-border px-3 py-2"
            value={selectedContactId}
            onChange={(event) => setSelectedContactId(event.target.value)}
          >
            <option value="">All contacts</option>
            {contactOptions.map((contact) => (
              <option key={contact.id} value={contact.id}>
                {(contact.name ?? "Unknown") + ` (${contact.phone ?? "no phone"})`}
              </option>
            ))}
          </select>
        </label>

        <label className="grid gap-1 text-sm">
          <span className="font-medium">Conversation</span>
          <select
            className="rounded-lg border border-border px-3 py-2"
            value={selectedConversationId}
            onChange={(event) => setSelectedConversationId(event.target.value)}
            disabled={!selectedContactId}
          >
            <option value="">
              {selectedContactId ? "All conversations for contact" : "Select a contact first"}
            </option>
            {conversationOptions.map((conversation) => (
              <option key={conversation.id} value={conversation.id}>
                {conversation.status} · {new Date(conversation.lastMessageAt).toLocaleString()}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}

      <button
        type="button"
        className="mt-4 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        onClick={() => void handleDownload()}
        disabled={isDownloading}
      >
        {isDownloading ? "Preparing download..." : "Download CSV"}
      </button>
    </div>
  );
}
