"use client";

import { GroupParticipantsPanel } from "@/components/caretext/GroupParticipantsPanel";
import { useVoiceCall } from "@/components/caretext/VoiceCallProvider";

type GroupParticipant = {
  status: string;
  contact: {
    name: string | null;
    phone: string;
  };
};

type EmbedConversationHeaderProps = {
  conversationId?: string;
  contactName?: string | null;
  phone?: string;
  isDraft?: boolean;
  isGroup?: boolean;
  title?: string | null;
  participants?: GroupParticipant[];
};

export function EmbedConversationHeader({
  conversationId,
  contactName,
  phone,
  isDraft,
  isGroup,
  title,
  participants,
}: EmbedConversationHeaderProps) {
  const { startCall, isCallActive, callPhase, errorMessage } = useVoiceCall();
  const isStartingCall = callPhase === "connecting";

  if (isGroup) {
    return (
      <div className="rounded-xl border border-border bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-lg font-semibold">{title || "Group conversation"}</p>
            <p className="text-sm text-muted">
              {(participants?.length ?? 0)} participant{(participants?.length ?? 0) === 1 ? "" : "s"}
            </p>
          </div>
          <button
            type="button"
            disabled
            title="Group voice calling isn't available."
            className="min-w-[5.5rem] cursor-not-allowed rounded-lg bg-emerald-600 px-5 py-3 text-base font-semibold text-white opacity-50"
          >
            Call
          </button>
        </div>
        {participants?.length ? (
          <div className="mt-3">
            <GroupParticipantsPanel participants={participants} />
          </div>
        ) : null}
      </div>
    );
  }

  if (!phone) {
    return (
      <div className="rounded-xl border border-border bg-white p-4">
        <p className="text-lg font-semibold">{isDraft ? "New Conversation" : "Conversation"}</p>
        <p className="text-sm text-muted">
          {isDraft ? "Enter a phone number to start." : "Select a conversation from the list."}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-lg font-semibold">{contactName || phone}</p>
          <p className="text-sm text-muted">{phone}</p>
        </div>
        <button
          type="button"
          disabled={!conversationId || isCallActive || isStartingCall}
          className="min-w-[5.5rem] rounded-lg bg-emerald-600 px-5 py-3 text-base font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          onClick={async () => {
            if (!conversationId || !phone) return;
            await startCall({ conversationId, phone, contactName });
          }}
        >
          {isStartingCall ? "Calling..." : "Call"}
        </button>
      </div>
      {errorMessage ? <p className="mt-2 text-xs text-rose-600">{errorMessage}</p> : null}
    </div>
  );
}
