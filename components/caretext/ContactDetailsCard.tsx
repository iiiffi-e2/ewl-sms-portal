"use client";

import { FormEvent, useEffect, useRef, useState } from "react";

type Contact = {
  id: string;
  name: string | null;
  phone: string | null;
  notifyClientId: string | null;
  facility: string | null;
  address: string | null;
  notes: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
};

type ContactFormState = {
  name: string;
  channel: "sms" | "notify";
  phone: string;
  notifyClientId: string;
  facility: string;
  address: string;
};

type ContactDetailsCardProps = {
  contact?: Contact;
  isDraft?: boolean;
  draftPhone?: string;
  onDraftPhoneChange?: (phone: string) => void;
  onCreate?: (payload: {
    name: string;
    phone?: string;
    notifyClientId?: string;
    facility: string;
    address: string;
  }) => Promise<void> | void;
  onUpdated?: () => Promise<void> | void;
};

export function ContactDetailsCard({
  contact,
  isDraft = false,
  draftPhone = "",
  onDraftPhoneChange,
  onCreate,
  onUpdated,
}: ContactDetailsCardProps) {
  const [form, setForm] = useState<ContactFormState>({
    name: "",
    channel: "sms",
    phone: draftPhone,
    notifyClientId: "",
    facility: "",
    address: "",
  });
  const [isSaving, setIsSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(isDraft);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const lastContactIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (isDraft && !contact) {
      setForm((current) => ({
        ...current,
        phone: draftPhone,
        channel: "sms",
      }));
      setIsEditing(true);
      return;
    }

    if (!contact) {
      return;
    }

    const didContactChange = lastContactIdRef.current !== contact.id;
    lastContactIdRef.current = contact.id;

    if (didContactChange || !isEditing) {
      setForm({
        name: contact.name ?? "",
        channel: contact.notifyClientId ? "notify" : "sms",
        phone: contact.phone ?? "",
        notifyClientId: contact.notifyClientId ?? "",
        facility: contact.facility ?? "",
        address: contact.address ?? "",
      });
    }

    if (didContactChange) {
      setError(null);
      setSuccess(null);
      setIsEditing(false);
    }
  }, [contact, draftPhone, isDraft, isEditing]);

  if (!contact && !isDraft) {
    return null;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setError(null);
    setSuccess(null);

    try {
      if (isDraft && !contact) {
        if (!onCreate) {
          throw new Error("Unable to create conversation.");
        }
        await onCreate({
          name: form.name,
          facility: form.facility,
          address: form.address,
          ...(form.channel === "sms"
            ? { phone: form.phone.trim() }
            : { notifyClientId: form.notifyClientId.trim() }),
        });
        setSuccess("Conversation saved.");
        return;
      }

      if (!contact) {
        return;
      }

      const response = await fetch(`/api/contacts/${contact.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim() ? form.name.trim() : null,
          facility: form.facility.trim() ? form.facility.trim() : null,
          address: form.address.trim() ? form.address.trim() : null,
          ...(form.channel === "sms"
            ? { phone: form.phone.trim(), notifyClientId: null }
            : { notifyClientId: form.notifyClientId.trim(), phone: null }),
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(
          typeof data.error === "string"
            ? data.error
            : (data.error?.formErrors?.[0] ?? "Failed to update contact details."),
        );
      }

      setSuccess("Saved.");
      setIsEditing(false);
      if (onUpdated) {
        await onUpdated();
      }
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : "Failed to save contact details.");
    } finally {
      setIsSaving(false);
    }
  }

  function updateForm(next: Partial<ContactFormState>) {
    setForm((current) => {
      const updated = { ...current, ...next };
      if (next.phone !== undefined && onDraftPhoneChange) {
        onDraftPhoneChange(next.phone);
      }
      return updated;
    });
  }

  const isDraftMode = isDraft && !contact;
  const identityLocked = Boolean(contact) && !isDraftMode;

  return (
    <div className="rounded-xl border border-border bg-white p-4 text-sm">
      <div className="flex items-center justify-between">
        <p className="font-semibold">Contact Details</p>
        {!isDraftMode ? (
          <button
            type="button"
            className="rounded-md border border-border px-3 py-1 text-xs font-medium"
            onClick={() => {
              if (!contact) {
                return;
              }
              if (isEditing) {
                setForm({
                  name: contact.name ?? "",
                  channel: contact.notifyClientId ? "notify" : "sms",
                  phone: contact.phone ?? "",
                  notifyClientId: contact.notifyClientId ?? "",
                  facility: contact.facility ?? "",
                  address: contact.address ?? "",
                });
                setError(null);
                setSuccess(null);
                setIsEditing(false);
                return;
              }
              setSuccess(null);
              setIsEditing(true);
            }}
          >
            {isEditing ? "Cancel" : "Edit"}
          </button>
        ) : null}
      </div>
      {isDraftMode ? (
        <p className="mt-1 text-xs text-muted">
          Enter contact details and save to create this conversation before messaging.
        </p>
      ) : null}
      <form className="mt-3 space-y-3" onSubmit={handleSubmit}>
        <label className="block">
          <span className="text-xs font-medium text-muted">Contact name</span>
          <input
            className="mt-1 w-full rounded-lg border border-border px-3 py-2"
            value={form.name}
            onChange={(event) => updateForm({ name: event.target.value })}
            placeholder="Contact name"
            readOnly={!isEditing}
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-muted">Facility name</span>
          <input
            className="mt-1 w-full rounded-lg border border-border px-3 py-2"
            value={form.facility}
            onChange={(event) => updateForm({ facility: event.target.value })}
            placeholder="Facility name"
            readOnly={!isEditing}
          />
        </label>
        {isDraftMode || (isEditing && !identityLocked) ? (
          <div className="flex gap-2">
            <button
              type="button"
              disabled={!isEditing}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                form.channel === "sms"
                  ? "bg-indigo-600 text-white"
                  : "border border-border bg-white text-slate-700"
              }`}
              onClick={() => updateForm({ channel: "sms" })}
            >
              SMS
            </button>
            <button
              type="button"
              disabled={!isEditing}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                form.channel === "notify"
                  ? "bg-indigo-600 text-white"
                  : "border border-border bg-white text-slate-700"
              }`}
              onClick={() => updateForm({ channel: "notify" })}
            >
              Notify
            </button>
          </div>
        ) : (
          <p className="text-xs text-muted">
            Channel: {contact?.notifyClientId ? "Notify" : "SMS"}
          </p>
        )}
        {form.channel === "sms" ? (
          <label className="block">
            <span className="text-xs font-medium text-muted">Phone number</span>
            <input
              className="mt-1 w-full rounded-lg border border-border px-3 py-2"
              value={form.phone}
              onChange={(event) => updateForm({ phone: event.target.value })}
              placeholder="+15551234567"
              required={form.channel === "sms"}
              readOnly={!isEditing}
            />
          </label>
        ) : (
          <label className="block">
            <span className="text-xs font-medium text-muted">Notify client ID</span>
            <input
              className="mt-1 w-full rounded-lg border border-border px-3 py-2"
              value={form.notifyClientId}
              onChange={(event) => updateForm({ notifyClientId: event.target.value })}
              placeholder="Notify client ID"
              required={form.channel === "notify"}
              readOnly={!isEditing}
            />
          </label>
        )}
        <label className="block">
          <span className="text-xs font-medium text-muted">Address</span>
          <textarea
            className="mt-1 min-h-20 w-full rounded-lg border border-border px-3 py-2"
            value={form.address}
            onChange={(event) => updateForm({ address: event.target.value })}
            placeholder="Address"
            readOnly={!isEditing}
          />
        </label>
        {error ? <p className="text-xs text-red-600">{error}</p> : null}
        {success ? <p className="text-xs text-emerald-600">{success}</p> : null}
        {isEditing ? (
          <button
            type="submit"
            disabled={isSaving}
            className="w-full rounded-lg bg-indigo-600 px-3 py-2 font-semibold text-white disabled:opacity-60"
          >
            {isSaving
              ? "Saving..."
              : isDraftMode
                ? "Save Conversation"
                : "Save Contact Details"}
          </button>
        ) : null}
      </form>
    </div>
  );
}
