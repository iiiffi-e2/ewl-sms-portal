"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { isValidPhoneNumber } from "@/lib/phone";

type Contact = {
  id: string;
  name: string | null;
  phone: string | null;
  notifyClientId: string | null;
  facility: string | null;
  address: string | null;
  notes: string | null;
  commStackAppId: string | null;
  commStackAppName: string | null;
  commStackBaseUrl: string | null;
  commStackPortalUserId: string | null;
};

type Channel = "sms" | "notify";

const EMPTY_FORM = {
  channel: "sms" as Channel,
  phone: "",
  notifyClientId: "",
  name: "",
  facility: "",
  address: "",
  notes: "",
  commStackAppId: "",
  commStackAppName: "",
  commStackBaseUrl: "",
  commStackPortalUserId: "",
};

export function ContactsManager() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [messagingContactId, setMessagingContactId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadContacts = useCallback(async () => {
    const response = await fetch(`/api/contacts${search ? `?q=${encodeURIComponent(search)}` : ""}`);
    const data = await response.json();
    setContacts(data.contacts);
  }, [search]);

  useEffect(() => {
    void loadContacts();
  }, [loadContacts]);

  function updateField<K extends keyof typeof EMPTY_FORM>(field: K, value: (typeof EMPTY_FORM)[K]) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function resetForm() {
    setForm(EMPTY_FORM);
    setError(null);
  }

  async function handleSendMessage(contactId: string) {
    setMessagingContactId(contactId);
    setError(null);
    try {
      const response = await fetch(`/api/contacts/${contactId}/conversation`, {
        method: "POST",
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        setError(
          typeof data?.error === "string"
            ? data.error
            : "Could not open conversation for this contact.",
        );
        return;
      }
      if (typeof data?.conversationId !== "string") {
        setError("Could not open conversation for this contact.");
        return;
      }
      router.push(`/dashboard?conversationId=${data.conversationId}`);
    } catch (sendError) {
      setError(
        sendError instanceof Error ? sendError.message : "Could not open conversation.",
      );
    } finally {
      setMessagingContactId(null);
    }
  }

  async function handleCreate() {
    if (form.channel === "sms") {
      const phone = form.phone.trim();
      if (!isValidPhoneNumber(phone)) {
        setError("Enter a valid phone number.");
        return;
      }
    } else {
      if (!form.name.trim()) {
        setError("Name is required for Notify contacts.");
        return;
      }
      if (!form.notifyClientId.trim()) {
        setError("Enter a Notify client UUID.");
        return;
      }
      if (
        !form.commStackAppId.trim() ||
        !form.commStackAppName.trim() ||
        !form.commStackBaseUrl.trim() ||
        !form.commStackPortalUserId.trim()
      ) {
        setError("All CommStack fields are required for Notify contacts.");
        return;
      }
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(form.channel === "sms"
            ? { phone: form.phone.trim() }
            : {
                notifyClientId: form.notifyClientId.trim(),
                commStackAppId: form.commStackAppId.trim(),
                commStackAppName: form.commStackAppName.trim(),
                commStackBaseUrl: form.commStackBaseUrl.trim(),
                commStackPortalUserId: form.commStackPortalUserId.trim(),
              }),
          name: form.name.trim() || undefined,
          facility: form.facility.trim() || undefined,
          address: form.address.trim() || undefined,
          notes: form.notes.trim() || undefined,
        }),
      });

      if (response.ok) {
        resetForm();
        setIsFormOpen(false);
        await loadContacts();
        return;
      }

      const data = await response.json().catch(() => null);
      setError(
        typeof data?.error === "string"
          ? data.error
          : "Could not create contact. Check the details and try again.",
      );
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Could not create contact.");
    } finally {
      setIsSubmitting(false);
    }
  }

  const canSave =
    form.channel === "sms"
      ? Boolean(form.phone.trim())
      : Boolean(
          form.name.trim() &&
            form.notifyClientId.trim() &&
            form.commStackAppId.trim() &&
            form.commStackAppName.trim() &&
            form.commStackBaseUrl.trim() &&
            form.commStackPortalUserId.trim(),
        );

  return (
    <section className="space-y-4">
      <div className="rounded-xl border border-border bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-lg font-semibold">Contacts</h1>
          <button
            type="button"
            className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white"
            onClick={() => {
              setIsFormOpen((open) => !open);
              setError(null);
            }}
          >
            {isFormOpen ? "Close" : "New contact"}
          </button>
        </div>

        {isFormOpen ? (
          <div className="mt-3 space-y-2 rounded-lg border border-border p-3">
            <div className="flex gap-2">
              <button
                type="button"
                className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                  form.channel === "sms"
                    ? "bg-indigo-600 text-white"
                    : "border border-border bg-white text-slate-700"
                }`}
                onClick={() => updateField("channel", "sms")}
              >
                SMS (phone)
              </button>
              <button
                type="button"
                className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                  form.channel === "notify"
                    ? "bg-indigo-600 text-white"
                    : "border border-border bg-white text-slate-700"
                }`}
                onClick={() => updateField("channel", "notify")}
              >
                Notify client
              </button>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <input
                className="w-full rounded-lg border border-border px-3 py-2 text-sm"
                placeholder={form.channel === "notify" ? "Name (required)" : "Name (optional)"}
                value={form.name}
                onChange={(event) => updateField("name", event.target.value)}
              />
              {form.channel === "sms" ? (
                <input
                  className="w-full rounded-lg border border-border px-3 py-2 text-sm"
                  placeholder="Phone number (required)"
                  value={form.phone}
                  onChange={(event) => updateField("phone", event.target.value)}
                />
              ) : (
                <input
                  className="w-full rounded-lg border border-border px-3 py-2 text-sm"
                  placeholder="Notify client UUID (required)"
                  value={form.notifyClientId}
                  onChange={(event) => updateField("notifyClientId", event.target.value)}
                />
              )}
              <input
                className="w-full rounded-lg border border-border px-3 py-2 text-sm"
                placeholder="Facility name (optional)"
                value={form.facility}
                onChange={(event) => updateField("facility", event.target.value)}
              />
              <input
                className="w-full rounded-lg border border-border px-3 py-2 text-sm"
                placeholder="Address (optional)"
                value={form.address}
                onChange={(event) => updateField("address", event.target.value)}
              />
            </div>

            {form.channel === "notify" ? (
              <div className="grid gap-2 sm:grid-cols-2">
                <input
                  className="w-full rounded-lg border border-border px-3 py-2 text-sm"
                  placeholder="COMM_STACK_APP_ID (required)"
                  value={form.commStackAppId}
                  onChange={(event) => updateField("commStackAppId", event.target.value)}
                />
                <input
                  className="w-full rounded-lg border border-border px-3 py-2 text-sm"
                  placeholder="COMM_STACK_APP_NAME (required)"
                  value={form.commStackAppName}
                  onChange={(event) => updateField("commStackAppName", event.target.value)}
                />
                <input
                  className="w-full rounded-lg border border-border px-3 py-2 text-sm"
                  placeholder="COMM_STACK_BASE_URL (required)"
                  value={form.commStackBaseUrl}
                  onChange={(event) => updateField("commStackBaseUrl", event.target.value)}
                />
                <input
                  className="w-full rounded-lg border border-border px-3 py-2 text-sm"
                  placeholder="COMM_STACK_PORTAL_USER_ID (required)"
                  value={form.commStackPortalUserId}
                  onChange={(event) => updateField("commStackPortalUserId", event.target.value)}
                />
              </div>
            ) : null}

            <textarea
              className="w-full rounded-lg border border-border px-3 py-2 text-sm"
              placeholder="Notes (optional)"
              rows={2}
              value={form.notes}
              onChange={(event) => updateField("notes", event.target.value)}
            />

            {error ? <p className="text-sm text-rose-700">{error}</p> : null}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                disabled={isSubmitting}
                className="rounded-lg border border-border bg-white px-3 py-2 text-sm font-medium disabled:opacity-60"
                onClick={() => {
                  resetForm();
                  setIsFormOpen(false);
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isSubmitting || !canSave}
                className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                onClick={handleCreate}
              >
                {isSubmitting ? "Saving..." : "Save contact"}
              </button>
            </div>
          </div>
        ) : null}

        <input
          className="mt-3 w-full rounded-lg border border-border px-3 py-2 text-sm"
          placeholder="Search name, phone, Notify ID, facility"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>
      {error && !isFormOpen ? <p className="text-sm text-rose-700">{error}</p> : null}

      <div className="space-y-2 rounded-xl border border-border bg-white p-4">
        {contacts.map((contact) => (
          <div
            key={contact.id}
            className="flex flex-col gap-3 rounded-lg border border-border p-3 sm:flex-row sm:items-start sm:justify-between"
          >
            <div className="min-w-0">
              <p className="font-semibold">{contact.name ?? "Unknown contact"}</p>
              <p className="text-sm text-muted">
                {contact.phone
                  ? contact.phone
                  : contact.notifyClientId
                    ? `Notify: ${contact.notifyClientId}`
                    : "No identity"}
              </p>
              <p className="text-sm text-muted">{contact.facility ?? "No facility"}</p>
              <p className="text-sm text-muted">{contact.address ?? "No address"}</p>
              {contact.notifyClientId ? (
                <p className="mt-1 text-xs text-muted">
                  App: {contact.commStackAppName ?? "—"} · {contact.commStackBaseUrl ?? "—"}
                </p>
              ) : null}
              {contact.notes ? <p className="mt-1 text-sm">{contact.notes}</p> : null}
            </div>
            <button
              type="button"
              disabled={messagingContactId === contact.id}
              className="shrink-0 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
              onClick={() => void handleSendMessage(contact.id)}
            >
              {messagingContactId === contact.id ? "Opening..." : "Send Message"}
            </button>
          </div>
        ))}
        {!contacts.length ? <p className="text-sm text-muted">No contacts found.</p> : null}
      </div>
    </section>
  );
}
