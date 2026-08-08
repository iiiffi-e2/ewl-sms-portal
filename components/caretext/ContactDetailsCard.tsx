"use client";

import { FormEvent, useEffect, useRef, useState } from "react";

type Contact = {
  id: string;
  name: string | null;
  phone: string | null;
  notifyClientId: string | null;
  notifyChannelId: string | null;
  facility: string | null;
  address: string | null;
  notes: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  commStackAppId: string | null;
  commStackAppName: string | null;
  commStackBaseUrl: string | null;
  commStackPortalUserId: string | null;
};

type ContactFormState = {
  name: string;
  channel: "sms" | "notify";
  notifyKind: "individual" | "channel";
  phone: string;
  notifyClientId: string;
  notifyChannelId: string;
  facility: string;
  address: string;
  commStackAppId: string;
  commStackAppName: string;
  commStackBaseUrl: string;
  commStackPortalUserId: string;
};

type NotifyCreatePayload = {
  name: string;
  notifyClientId?: string;
  notifyChannelId?: string;
  facility: string;
  address: string;
  commStackAppId: string;
  commStackAppName: string;
  commStackBaseUrl: string;
  commStackPortalUserId: string;
};

type SmsCreatePayload = {
  name: string;
  phone: string;
  facility: string;
  address: string;
};

type ContactDetailsCardProps = {
  contact?: Contact;
  isDraft?: boolean;
  draftPhone?: string;
  onDraftPhoneChange?: (phone: string) => void;
  onCreate?: (payload: SmsCreatePayload | NotifyCreatePayload) => Promise<void> | void;
  onUpdated?: () => Promise<void> | void;
  onDelete?: () => Promise<void> | void;
};

function formFromContact(contact: Contact): ContactFormState {
  const isNotify = Boolean(contact.notifyClientId || contact.notifyChannelId);
  return {
    name: contact.name ?? "",
    channel: isNotify ? "notify" : "sms",
    notifyKind: contact.notifyChannelId ? "channel" : "individual",
    phone: contact.phone ?? "",
    notifyClientId: contact.notifyClientId ?? "",
    notifyChannelId: contact.notifyChannelId ?? "",
    facility: contact.facility ?? "",
    address: contact.address ?? "",
    commStackAppId: contact.commStackAppId ?? "",
    commStackAppName: contact.commStackAppName ?? "",
    commStackBaseUrl: contact.commStackBaseUrl ?? "",
    commStackPortalUserId: contact.commStackPortalUserId ?? "",
  };
}

export function ContactDetailsCard({
  contact,
  isDraft = false,
  draftPhone = "",
  onDraftPhoneChange,
  onCreate,
  onUpdated,
  onDelete,
}: ContactDetailsCardProps) {
  const [form, setForm] = useState<ContactFormState>({
    name: "",
    channel: "sms",
    notifyKind: "individual",
    phone: draftPhone,
    notifyClientId: "",
    notifyChannelId: "",
    facility: "",
    address: "",
    commStackAppId: "",
    commStackAppName: "",
    commStackBaseUrl: "",
    commStackPortalUserId: "",
  });
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isEditing, setIsEditing] = useState(isDraft);
  const [showNotifySettings, setShowNotifySettings] = useState(isDraft);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const lastContactIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (isDraft && !contact) {
      setForm((current) => ({
        ...current,
        phone: draftPhone,
        channel: current.channel,
      }));
      setIsEditing(true);
      // Draft Notify creation needs the settings visible to fill required fields.
      setShowNotifySettings(true);
      return;
    }

    if (!contact) {
      return;
    }

    const didContactChange = lastContactIdRef.current !== contact.id;
    lastContactIdRef.current = contact.id;

    if (didContactChange || !isEditing) {
      setForm(formFromContact(contact));
    }

    if (didContactChange) {
      setError(null);
      setSuccess(null);
      setIsEditing(false);
      setShowNotifySettings(false);
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
        if (form.channel === "sms") {
          await onCreate({
            name: form.name,
            phone: form.phone.trim(),
            facility: form.facility,
            address: form.address,
          });
        } else {
          await onCreate({
            name: form.name,
            ...(form.notifyKind === "individual"
              ? { notifyClientId: form.notifyClientId.trim() }
              : { notifyChannelId: form.notifyChannelId.trim() }),
            facility: form.facility,
            address: form.address,
            commStackAppId: form.commStackAppId.trim(),
            commStackAppName: form.commStackAppName.trim(),
            commStackBaseUrl: form.commStackBaseUrl.trim(),
            commStackPortalUserId: form.commStackPortalUserId.trim(),
          });
        }
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
            ? {
                phone: form.phone.trim(),
                notifyClientId: null,
                notifyChannelId: null,
                commStackAppId: null,
                commStackAppName: null,
                commStackBaseUrl: null,
                commStackPortalUserId: null,
              }
            : {
                phone: null,
                notifyClientId:
                  form.notifyKind === "individual" ? form.notifyClientId.trim() : null,
                notifyChannelId:
                  form.notifyKind === "channel" ? form.notifyChannelId.trim() : null,
                commStackAppId: form.commStackAppId.trim(),
                commStackAppName: form.commStackAppName.trim(),
                commStackBaseUrl: form.commStackBaseUrl.trim(),
                commStackPortalUserId: form.commStackPortalUserId.trim(),
              }),
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
      setShowNotifySettings(false);
      if (onUpdated) {
        await onUpdated();
      }
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : "Failed to save contact details.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete() {
    if (!onDelete || !contact) return;
    const confirmed = window.confirm(
      "Delete this contact? They can be restored by creating a contact with the same phone/Notify ID.",
    );
    if (!confirmed) return;

    setIsDeleting(true);
    setError(null);
    setSuccess(null);
    try {
      await onDelete();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Could not delete contact.");
    } finally {
      setIsDeleting(false);
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
                setForm(formFromContact(contact));
                setError(null);
                setSuccess(null);
                setIsEditing(false);
                setShowNotifySettings(false);
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
          <span className="text-xs font-medium text-muted">
            Contact name{form.channel === "notify" ? " (required)" : ""}
          </span>
          <input
            className="mt-1 w-full rounded-lg border border-border px-3 py-2"
            value={form.name}
            onChange={(event) => updateForm({ name: event.target.value })}
            placeholder="Contact name"
            required={form.channel === "notify"}
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
          <div className="flex flex-wrap gap-2">
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
              onClick={() => {
                updateForm({ channel: "notify" });
                setShowNotifySettings(true);
              }}
            >
              Notify
            </button>
          </div>
        ) : (
          <p className="text-xs text-muted">
            Channel:{" "}
            {contact?.notifyChannelId
              ? "Notify channel"
              : contact?.notifyClientId
                ? "Notify individual"
                : "SMS"}
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
        ) : null}
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
        {form.channel === "notify" ? (
          <div className="space-y-2">
            <button
              type="button"
              className="text-xs font-medium text-indigo-700 underline-offset-2 hover:underline"
              onClick={() => setShowNotifySettings((open) => !open)}
            >
              {showNotifySettings ? "Hide Notify Settings" : "Notify Settings"}
            </button>
            {showNotifySettings ? (
              <div className="space-y-3 rounded-lg border border-border bg-slate-50 p-3">
                {isDraftMode || (isEditing && !identityLocked) ? (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={!isEditing}
                      className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                        form.notifyKind === "individual"
                          ? "bg-slate-800 text-white"
                          : "border border-border bg-white text-slate-700"
                      }`}
                      onClick={() => updateForm({ notifyKind: "individual" })}
                    >
                      Individual
                    </button>
                    <button
                      type="button"
                      disabled={!isEditing}
                      className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                        form.notifyKind === "channel"
                          ? "bg-slate-800 text-white"
                          : "border border-border bg-white text-slate-700"
                      }`}
                      onClick={() => updateForm({ notifyKind: "channel" })}
                    >
                      Channel
                    </button>
                  </div>
                ) : null}
                {form.notifyKind === "individual" ? (
                  <label className="block">
                    <span className="text-xs font-medium text-muted">Notify client UUID</span>
                    <input
                      className="mt-1 w-full rounded-lg border border-border bg-white px-3 py-2"
                      value={form.notifyClientId}
                      onChange={(event) => updateForm({ notifyClientId: event.target.value })}
                      placeholder="Notify client UUID"
                      required={showNotifySettings}
                      readOnly={!isEditing}
                    />
                  </label>
                ) : (
                  <label className="block">
                    <span className="text-xs font-medium text-muted">Notify channel UUID</span>
                    <input
                      className="mt-1 w-full rounded-lg border border-border bg-white px-3 py-2"
                      value={form.notifyChannelId}
                      onChange={(event) => updateForm({ notifyChannelId: event.target.value })}
                      placeholder="Notify channel UUID"
                      required={showNotifySettings}
                      readOnly={!isEditing}
                    />
                  </label>
                )}
                <label className="block">
                  <span className="text-xs font-medium text-muted">COMM_STACK_APP_ID</span>
                  <input
                    className="mt-1 w-full rounded-lg border border-border bg-white px-3 py-2"
                    value={form.commStackAppId}
                    onChange={(event) => updateForm({ commStackAppId: event.target.value })}
                    placeholder="Application UUID"
                    required={showNotifySettings}
                    readOnly={!isEditing}
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-muted">COMM_STACK_APP_NAME</span>
                  <input
                    className="mt-1 w-full rounded-lg border border-border bg-white px-3 py-2"
                    value={form.commStackAppName}
                    onChange={(event) => updateForm({ commStackAppName: event.target.value })}
                    placeholder="Application name"
                    required={showNotifySettings}
                    readOnly={!isEditing}
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-muted">COMM_STACK_BASE_URL</span>
                  <input
                    className="mt-1 w-full rounded-lg border border-border bg-white px-3 py-2"
                    value={form.commStackBaseUrl}
                    onChange={(event) => updateForm({ commStackBaseUrl: event.target.value })}
                    placeholder="qsscommbe3.notifync.com"
                    required={showNotifySettings}
                    readOnly={!isEditing}
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-muted">COMM_STACK_PORTAL_USER_ID</span>
                  <input
                    className="mt-1 w-full rounded-lg border border-border bg-white px-3 py-2"
                    value={form.commStackPortalUserId}
                    onChange={(event) => updateForm({ commStackPortalUserId: event.target.value })}
                    placeholder="Portal sender UUID"
                    required={showNotifySettings}
                    readOnly={!isEditing}
                  />
                </label>
              </div>
            ) : null}
          </div>
        ) : null}
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
      {onDelete && contact && !isDraftMode ? (
        <div className="mt-3 border-t border-border pt-3">
          <button
            type="button"
            disabled={isDeleting || isEditing}
            onClick={() => void handleDelete()}
            className="w-full rounded-lg border border-rose-300 px-3 py-2 text-sm font-semibold text-rose-700 disabled:opacity-60"
          >
            {isDeleting ? "Deleting..." : "Delete contact"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
