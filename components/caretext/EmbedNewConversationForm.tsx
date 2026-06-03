"use client";

import { FormEvent, useState } from "react";

type EmbedNewConversationFormProps = {
  onCreate: (payload: { name: string; phone: string }) => Promise<void>;
};

export function EmbedNewConversationForm({ onCreate }: EmbedNewConversationFormProps) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setError(null);

    try {
      await onCreate({ name: name.trim(), phone: phone.trim() });
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Failed to create conversation.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form className="space-y-3 rounded-xl border border-border bg-white p-4" onSubmit={onSubmit}>
      <p className="text-sm font-semibold">Start a new conversation</p>
      <div>
        <label className="mb-1 block text-sm font-medium">Phone</label>
        <input
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          className="w-full rounded-lg border border-border px-3 py-2 text-sm"
          placeholder="+15551234567"
          required
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium">Name (optional)</label>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="w-full rounded-lg border border-border px-3 py-2 text-sm"
          placeholder="Contact name"
        />
      </div>
      {error ? <p className="text-sm text-rose-600">{error}</p> : null}
      <button
        type="submit"
        disabled={isSaving}
        className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
      >
        {isSaving ? "Creating..." : "Start conversation"}
      </button>
    </form>
  );
}
