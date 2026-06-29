"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Contact = {
  id: string;
  name: string | null;
  phone: string;
  consentStatus: string;
};

type OptedOutContact = {
  id: string;
  name: string | null;
  phone: string;
};

type NewGroupConversationModalProps = {
  open: boolean;
  onClose: () => void;
  onCreated: (conversationId: string) => void;
};

const MIN_PARTICIPANTS = 2;
const MAX_PARTICIPANTS = 9;

export function NewGroupConversationModal({
  open,
  onClose,
  onCreated,
}: NewGroupConversationModalProps) {
  const [title, setTitle] = useState("");
  const [search, setSearch] = useState("");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [optedOut, setOptedOut] = useState<OptedOutContact[]>([]);

  const loadContacts = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/contacts");
      if (!response.ok) {
        throw new Error("Failed to load contacts.");
      }
      const data = await response.json();
      setContacts(data.contacts ?? []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load contacts.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }
    setTitle("");
    setSearch("");
    setSelectedIds([]);
    setError(null);
    setOptedOut([]);
    void loadContacts();
  }, [open, loadContacts]);

  const filteredContacts = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) {
      return contacts;
    }
    return contacts.filter((contact) => {
      const name = contact.name?.toLowerCase() ?? "";
      return name.includes(query) || contact.phone.toLowerCase().includes(query);
    });
  }, [contacts, search]);

  if (!open) {
    return null;
  }

  function toggleContact(id: string) {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );
  }

  const selectedCount = selectedIds.length;
  const isCountValid = selectedCount >= MIN_PARTICIPANTS && selectedCount <= MAX_PARTICIPANTS;

  async function handleSubmit() {
    if (!isCountValid) {
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setOptedOut([]);

    try {
      const response = await fetch("/api/conversations/group", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim() ? title.trim() : undefined,
          contactIds: selectedIds,
        }),
      });

      const data = await response.json().catch(() => null);

      if (response.status === 201 && data?.conversation?.id) {
        if (data.activationError) {
          setError(data.activationError);
          return;
        }
        onCreated(data.conversation.id);
        return;
      }

      if (response.status === 409 && data?.code === "consent_opted_out") {
        setOptedOut(Array.isArray(data.contacts) ? data.contacts : []);
        setError(data.error ?? "One or more contacts have opted out.");
        return;
      }

      setError(
        typeof data?.error === "string" ? data.error : "Failed to create group conversation.",
      );
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : "Failed to create group conversation.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
      <div className="flex max-h-[85vh] w-full max-w-md flex-col rounded-xl border border-border bg-white p-5 shadow-lg">
        <h2 className="text-lg font-semibold text-slate-900">New group conversation</h2>
        <p className="mt-1 text-sm text-muted">
          Select between {MIN_PARTICIPANTS} and {MAX_PARTICIPANTS} contacts to start a group thread.
        </p>

        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Group title (optional)"
          className="mt-3 w-full rounded-lg border border-border px-3 py-2 text-sm"
        />

        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search name or phone"
          className="mt-2 w-full rounded-lg border border-border px-3 py-2 text-sm"
        />

        <div className="mt-3 flex-1 space-y-1 overflow-y-auto rounded-lg border border-border p-2">
          {isLoading ? (
            <p className="px-1 py-2 text-sm text-muted">Loading contacts...</p>
          ) : filteredContacts.length ? (
            filteredContacts.map((contact) => {
              const isSelected = selectedIds.includes(contact.id);
              const isOptedOut = contact.consentStatus === "opted_out";
              const reachedMax = selectedCount >= MAX_PARTICIPANTS && !isSelected;
              return (
                <label
                  key={contact.id}
                  className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 text-sm hover:bg-slate-50"
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    disabled={reachedMax}
                    onChange={() => toggleContact(contact.id)}
                    className="h-4 w-4"
                  />
                  <span className="flex flex-col">
                    <span className="font-medium text-slate-900">
                      {contact.name ?? "Unknown contact"}
                    </span>
                    <span className="text-xs text-muted">{contact.phone}</span>
                  </span>
                  {isOptedOut ? (
                    <span className="ml-auto rounded-full bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-700">
                      Opted out
                    </span>
                  ) : null}
                </label>
              );
            })
          ) : (
            <p className="px-1 py-2 text-sm text-muted">No contacts found.</p>
          )}
        </div>

        <p className="mt-2 text-xs text-muted">
          {selectedCount} selected ({MIN_PARTICIPANTS}–{MAX_PARTICIPANTS} required)
        </p>

        {optedOut.length ? (
          <div className="mt-2 rounded-lg border border-rose-300 bg-rose-50 p-3 text-sm text-rose-700">
            <p className="font-semibold">These contacts have opted out:</p>
            <ul className="mt-1 list-disc pl-5">
              {optedOut.map((contact) => (
                <li key={contact.id}>
                  {contact.name ?? "Unknown contact"} ({contact.phone})
                </li>
              ))}
            </ul>
          </div>
        ) : error ? (
          <p className="mt-2 text-sm text-rose-700">{error}</p>
        ) : null}

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            disabled={isSubmitting}
            className="rounded-lg border border-border bg-white px-3 py-2 text-sm font-medium disabled:opacity-60"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={isSubmitting || !isCountValid}
            className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
            onClick={handleSubmit}
          >
            {isSubmitting ? "Creating..." : "Create group"}
          </button>
        </div>
      </div>
    </div>
  );
}
