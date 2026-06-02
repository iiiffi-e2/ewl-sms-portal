"use client";

import { useState } from "react";
import { StatusBadge } from "@/components/caretext/StatusBadge";
import { DeleteConversationModal } from "@/components/caretext/DeleteConversationModal";
import { useVoiceCall } from "@/components/caretext/VoiceCallProvider";

type ConversationHeaderProps = {
  conversationId?: string;
  contactName?: string | null;
  phone?: string;
  facility?: string | null;
  status?: string;
  isDraft?: boolean;
  onStatusChange?: (status: string) => Promise<void>;
  isAdmin?: boolean;
  onDeleteConversation?: () => Promise<void>;
};

const statuses = ["new", "sms_sent", "awaiting_reply", "replied", "escalated", "closed"];

export function ConversationHeader({
  conversationId,
  contactName,
  phone,
  facility,
  status,
  isDraft,
  onStatusChange,
  isAdmin,
  onDeleteConversation,
}: ConversationHeaderProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isOptionsOpen, setIsOptionsOpen] = useState(false);
  const { startCall, isCallActive, callPhase, errorMessage } = useVoiceCall();
  const isStartingCall = callPhase === "connecting";

  if (!phone) {
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
      <div className="relative rounded-xl border border-border bg-white p-4">
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
            <p className="text-lg font-semibold">{contactName || phone}</p>
            <p className="text-sm text-muted">{phone}</p>
            {facility ? <p className="text-sm text-muted">Facility: {facility}</p> : null}
          </div>
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:flex-nowrap">
            {status ? <StatusBadge status={status} /> : null}
            {status && onStatusChange ? (
              <select
                defaultValue={status}
                disabled={isSaving}
                className="rounded-lg border border-border px-2 py-1 text-xs"
                onChange={async (event) => {
                  setIsSaving(true);
                  try {
                    await onStatusChange(event.target.value);
                  } finally {
                    setIsSaving(false);
                  }
                }}
              >
                {statuses.map((statusValue) => (
                  <option key={statusValue} value={statusValue}>
                    {statusValue.replaceAll("_", " ")}
                  </option>
                ))}
              </select>
            ) : null}
            <button
              type="button"
              disabled={!conversationId || isCallActive || isStartingCall}
              className="ml-auto min-w-[5.5rem] rounded-lg bg-emerald-600 px-5 py-3 text-base font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50 sm:ml-0"
              onClick={async () => {
                if (!conversationId || !phone) return;
                await startCall({ conversationId, phone, contactName });
              }}
            >
              {isStartingCall ? "Calling..." : "Call"}
            </button>
            {errorMessage ? <p className="w-full text-xs text-rose-600">{errorMessage}</p> : null}
          </div>
        </div>
      </div>

      {isDeleteModalOpen ? (
        <DeleteConversationModal
          contactLabel={contactName || phone}
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
