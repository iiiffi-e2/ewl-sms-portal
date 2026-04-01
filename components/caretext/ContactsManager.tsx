"use client";

import { useCallback, useEffect, useState } from "react";

type Contact = {
  id: string;
  name: string | null;
  phone: string;
  facility: string | null;
  notes: string | null;
};

export function ContactsManager() {
  const [search, setSearch] = useState("");
  const [contacts, setContacts] = useState<Contact[]>([]);

  const loadContacts = useCallback(async () => {
    const response = await fetch(`/api/contacts${search ? `?q=${encodeURIComponent(search)}` : ""}`);
    const data = await response.json();
    setContacts(data.contacts);
  }, [search]);

  useEffect(() => {
    void loadContacts();
  }, [loadContacts]);

  return (
    <section className="space-y-4">
      <div className="rounded-xl border border-border bg-white p-4">
        <h1 className="text-lg font-semibold">Contacts</h1>
        <input
          className="mt-2 w-full rounded-lg border border-border px-3 py-2 text-sm"
          placeholder="Search name, phone, facility"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>
      <div className="space-y-2 rounded-xl border border-border bg-white p-4">
        {contacts.map((contact) => (
          <div key={contact.id} className="rounded-lg border border-border p-3">
            <p className="font-semibold">{contact.name ?? "Unknown contact"}</p>
            <p className="text-sm text-muted">{contact.phone}</p>
            <p className="text-sm text-muted">{contact.facility ?? "No facility"}</p>
            {contact.notes ? <p className="mt-1 text-sm">{contact.notes}</p> : null}
          </div>
        ))}
        {!contacts.length ? <p className="text-sm text-muted">No contacts found.</p> : null}
      </div>
    </section>
  );
}
