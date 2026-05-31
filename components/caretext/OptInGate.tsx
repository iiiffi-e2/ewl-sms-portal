"use client";

import { useState } from "react";
import { OPT_IN_INTRO_TEXT } from "@/lib/consent";

type OptInGateProps = {
  conversationId: string;
  onIntroSent: () => Promise<void> | void;
};

export function OptInGate({ conversationId, onIntroSent }: OptInGateProps) {
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-3 rounded-xl border border-amber-300 bg-amber-50 p-4">
      <div>
        <p className="text-sm font-semibold text-amber-900">Opt-in required</p>
        <p className="text-xs text-amber-800">
          Send the opt-in intro before any other message. This is recorded as consent evidence.
        </p>
      </div>
      <p className="rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm text-slate-700">
        {OPT_IN_INTRO_TEXT}
      </p>
      {error && <p className="text-xs text-rose-600">{error}</p>}
      <button
        className="w-full rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60 sm:w-auto"
        disabled={isSending}
        onClick={async () => {
          setIsSending(true);
          setError(null);
          try {
            const response = await fetch(`/api/conversations/${conversationId}/consent-intro`, {
              method: "POST",
            });
            if (!response.ok) {
              const data = await response.json().catch(() => null);
              throw new Error(data?.error ?? "Failed to send opt-in intro.");
            }
            await onIntroSent();
          } catch (sendError) {
            setError(sendError instanceof Error ? sendError.message : "Failed to send opt-in intro.");
          } finally {
            setIsSending(false);
          }
        }}
      >
        {isSending ? "Sending..." : "Send opt-in intro"}
      </button>
    </div>
  );
}
