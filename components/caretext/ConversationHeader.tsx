"use client";

import { useState } from "react";
import { ConversationStatusControls } from "@/components/caretext/ConversationStatusControls";
import { DeleteConversationModal } from "@/components/caretext/DeleteConversationModal";
import { GroupParticipantsPanel } from "@/components/caretext/GroupParticipantsPanel";
import { useVoiceCall } from "@/components/caretext/VoiceCallProvider";

type GroupParticipant = {
  status: string;
  contact: {
    name: string | null;
    phone: string | null;
  };
};

type ConversationHeaderProps = {
  conversationId?: string;
  contactName?: string | null;
  phone?: string | null;
  notifyClientId?: string | null;
  facility?: string | null;
  status?: string;
  isDraft?: boolean;
  onStatusChange?: (status: string) => Promise<void>;
  isAdmin?: boolean;
  onDeleteConversation?: () => Promise<void>;
  isGroup?: boolean;
  title?: string | null;
  participants?: GroupParticipant[];
  variant?: "full" | "slim";
};

export function ConversationHeader({
  conversationId,
  contactName,
  phone,
  notifyClientId,
  facility,
  status,
  isDraft,
  onStatusChange,
  isAdmin,
  onDeleteConversation,
  isGroup,
  title,
  participants,
  variant = "full",
}: ConversationHeaderProps) {
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isOptionsOpen, setIsOptionsOpen] = useState(false);
  const { startCall, isCallActive, callPhase, errorMessage } = useVoiceCall();
  const isStartingCall = callPhase === "connecting";
  const identityLabel = phone || (notifyClientId ? `Notify: ${notifyClientId}` : "");
  const canCall = Boolean(phone) && !notifyClientId;

  const deleteLabel = isGroup ? title || "this group" : contactName || identityLabel || "";
  const callButtonClassName =
    variant === "slim"
      ? "ml-auto min-w-[5.5rem] rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50 sm:ml-0"
      : "ml-auto min-w-[5.5rem] rounded-lg bg-emerald-600 px-5 py-3 text-base font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50 sm:ml-0";

  if (!identityLabel && !isGroup) {
    return (
      <div className="rounded-xl border border-border bg-white p-4">
        <p className="text-lg font-semibold">{isDraft ? "New Conversation" : "Conversation"}</p>
        <p className="text-sm text-muted">
          {isDraft
            ? "Add contact details below and save to create this conversation."
            : "Start a new conversation to see details."}
        </p>
      </div>
    );
  }

  return (
    <>
      <div
        className={`relative rounded-xl border border-border bg-white ${variant === "slim" ? "p-3" : "p-4"}`}
      >
        {isAdmin && conversationId && onDeleteConversation ? (
          <div className="absolute right-3 top-3">
            <button
              type="button"
              aria-label="Thread options"
              aria-expanded={isOptionsOpen}
              className="rounded-md px-2 py-1 text-lg leading-none text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              onClick={() => setIsOptionsOpen((open) => !open)}
            >
              ···
            </button>
            {isOptionsOpen ? (
              <div className="absolute right-0 z-10 mt-1 w-36 rounded-lg border border-border bg-white py-1 shadow-md">
                <button
                  type="button"
                  className="w-full px-3 py-2 text-left text-sm text-rose-600 hover:bg-rose-50"
                  onClick={() => {
                    setIsOptionsOpen(false);
                    setIsDeleteModalOpen(true);
                  }}
                >
                  Remove thread
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className={`min-w-0 ${isAdmin && conversationId && onDeleteConversation ? "pr-8" : ""}`}>
            {isGroup ? (
              <>
                <p className="text-lg font-semibold">{title || "Group conversation"}</p>
                <p className="text-sm text-muted">
                  {(participants?.length ?? 0)} participant{(participants?.length ?? 0) === 1 ? "" : "s"}
                </p>
              </>
            ) : (
              <>
                <p className="text-lg font-semibold">{contactName || identityLabel}</p>
                {variant === "full" ? <p className="text-sm text-muted">{identityLabel}</p> : null}
                {facility ? (
                  <p className="text-sm text-muted">
                    {variant === "full" ? `Facility: ${facility}` : facility}
                  </p>
                ) : null}
              </>
            )}
          </div>
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:flex-nowrap">
            {variant === "full" ? (
              <ConversationStatusControls status={status} onStatusChange={onStatusChange} />
            ) : null}
            {isGroup || !canCall ? (
              <button
                type="button"
                disabled
                title={
                  isGroup
                    ? "Group voice calling isn't available."
                    : "Voice calling isn't available for Notify contacts."
                }
                className={`${callButtonClassName} cursor-not-allowed opacity-50`}
              >
                Call
              </button>
            ) : (
              <button
                type="button"
                disabled={!conversationId || isCallActive || isStartingCall}
                className={callButtonClassName}
                onClick={async () => {
                  if (!conversationId || !phone) return;
                  await startCall({ conversationId, phone, contactName });
                }}
              >
                {isStartingCall ? "Calling..." : "Call"}
              </button>
            )}
            {errorMessage && !isGroup && canCall ? (
              <p className="w-full text-xs text-rose-600">{errorMessage}</p>
            ) : null}
          </div>
        </div>
        {isGroup && participants?.length ? (
          <div className="mt-3">
            <GroupParticipantsPanel participants={participants} />
          </div>
        ) : null}
      </div>

      {isDeleteModalOpen ? (
        <DeleteConversationModal
          contactLabel={deleteLabel}
          onCancel={() => setIsDeleteModalOpen(false)}
          onConfirm={async () => {
            await onDeleteConversation?.();
            setIsDeleteModalOpen(false);
          }}
        />
      ) : null}
    </>
  );
}
