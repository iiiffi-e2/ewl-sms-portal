"use client";

import { useCallback, useEffect, useState } from "react";
import { isValidPhoneNumber } from "@/lib/phone";

type Contact = {
  id: string;
  name: string | null;
  phone: string | null;
  facility: string | null;
  address: string | null;
  notes: string | null;
};

const EMPTY_FORM = {
  phone: "",
  name: "",
  facility: "",
  address: "",
  notes: "",
};

export function ContactsManager() {
  const [search, setSearch] = useState("");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadContacts = useCallback(async () => {
    const response = await fetch(`/api/contacts${search ? `?q=${encodeURIComponent(search)}` : ""}`);
    const data = await response.json();
    setContacts(data.contacts);
  }, [search]);

  useEffect(() => {
    void loadContacts();
  }, [loadContacts]);

  function updateField(field: keyof typeof EMPTY_FORM, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function resetForm() {
    setForm(EMPTY_FORM);
    setError(null);
  }

  async function handleCreate() {
    const phone = form.phone.trim();
    if (!isValidPhoneNumber(phone)) {
      setError("Enter a valid phone number.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone,
          name: form.name.trim() || undefined,
          facility: form.facility.trim() || undefined,
          address: form.address.trim() || undefined,
          notes: form.notes.trim() || undefined,
        }),
      });

      if (response.status === 201) {
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
            <div className="grid gap-2 sm:grid-cols-2">
              <input
                className="w-full rounded-lg border border-border px-3 py-2 text-sm"
                placeholder="Phone number (required)"
                value={form.phone}
                onChange={(event) => updateField("phone", event.target.value)}
              />
              <input
                className="w-full rounded-lg border border-border px-3 py-2 text-sm"
                placeholder="Name (optional)"
                value={form.name}
                onChange={(event) => updateField("name", event.target.value)}
              />
              <input
                className="w-full rounded-lg border border-border px-3 py-2 text-sm"
                placeholder="Facility (optional)"
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
                disabled={isSubmitting || !form.phone.trim()}
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
          placeholder="Search name, phone, facility"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>
      <div className="space-y-2 rounded-xl border border-border bg-white p-4">
        {contacts.map((contact) => (
          <div key={contact.id} className="rounded-lg border border-border p-3">
            <p className="font-semibold">{contact.name ?? "Unknown contact"}</p>
            <p className="text-sm text-muted">{contact.phone ?? "No phone number"}</p>
            <p className="text-sm text-muted">{contact.facility ?? "No facility"}</p>
            <p className="text-sm text-muted">{contact.address ?? "No address"}</p>
            {contact.notes ? <p className="mt-1 text-sm">{contact.notes}</p> : null}
          </div>
        ))}
        {!contacts.length ? <p className="text-sm text-muted">No contacts found.</p> : null}
      </div>
    </section>
  );
}
