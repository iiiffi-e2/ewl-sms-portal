"use client";

import { useState } from "react";
import { TemplateSelector } from "@/components/caretext/TemplateSelector";

type Template = {
  id: string;
  title: string;
  body: string;
};

type MessageComposerProps = {
  templates: Template[];
  conversationId?: string;
  defaultPhone?: string;
  onSend: (payload: { body: string; phone: string; conversationId?: string }) => Promise<void>;
};

export function MessageComposer({
  templates,
  conversationId,
  defaultPhone,
  onSend,
}: MessageComposerProps) {
  const [body, setBody] = useState("");
  const [phone, setPhone] = useState(defaultPhone ?? "");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-2 rounded-xl border border-border bg-white p-4">
      {!conversationId && (
        <input
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          placeholder="Recipient phone number"
          className="w-full rounded-lg border border-border px-3 py-2 text-sm"
        />
      )}
      <TemplateSelector templates={templates} onChoose={(templateBody) => setBody(templateBody)} />
      <textarea
        className="h-28 w-full rounded-lg border border-border px-3 py-2 text-sm"
        placeholder="Type your message..."
        value={body}
        onChange={(event) => setBody(event.target.value)}
      />
      {error && <p className="text-xs text-rose-600">{error}</p>}
      <div className="flex justify-end">
        <button
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          disabled={isSending}
          onClick={async () => {
            setIsSending(true);
            setError(null);
            try {
              await onSend({ body, phone, conversationId });
              setBody("");
            } catch (sendError) {
              setError(sendError instanceof Error ? sendError.message : "Failed to send.");
            } finally {
              setIsSending(false);
            }
          }}
        >
          {isSending ? "Sending..." : "Send SMS"}
        </button>
      </div>
    </div>
  );
}
