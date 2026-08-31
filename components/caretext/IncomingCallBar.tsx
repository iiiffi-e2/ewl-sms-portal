"use client";

import { useVoiceCall } from "@/components/caretext/VoiceCallProvider";

export function IncomingCallBar({
  onAccepted,
}: {
  onAccepted?: (conversationId: string) => void;
}) {
  const { callPhase, incomingCall, acceptIncoming, declineIncoming } = useVoiceCall();

  if (callPhase !== "incoming" || !incomingCall) {
    return null;
  }

  return (
    <div className="sticky top-0 z-50 mb-3 flex shrink-0 flex-wrap items-center gap-3 rounded-xl border border-indigo-300 bg-indigo-50 px-4 py-3 shadow-md">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-indigo-950">Incoming call</p>
        <p className="text-xs text-indigo-800">
          {incomingCall.contactName || incomingCall.phone}
          {incomingCall.contactName ? ` · ${incomingCall.phone}` : null}
        </p>
      </div>
      <button
        type="button"
        onClick={() => {
          declineIncoming();
        }}
        className="rounded-lg border border-indigo-300 bg-white px-3 py-2 text-sm font-medium text-indigo-900"
      >
        Decline
      </button>
      <button
        type="button"
        onClick={() => {
          void acceptIncoming().then((conversationId) => {
            if (conversationId) {
              onAccepted?.(conversationId);
            }
          });
        }}
        className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white"
      >
        Accept
      </button>
    </div>
  );
}
