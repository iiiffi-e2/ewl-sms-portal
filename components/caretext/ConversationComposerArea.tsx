"use client";

import { MessageComposer } from "@/components/caretext/MessageComposer";
import { OptInGate } from "@/components/caretext/OptInGate";

type Template = {
  id: string;
  title: string;
  body: string;
};

type ConsentStatusValue = "none" | "opted_in" | "opted_out";

type ConversationComposerAreaProps = {
  templates: Template[];
  isDraft: boolean;
  conversationId?: string;
  consentStatus?: ConsentStatusValue;
  /** Notify contacts skip SMS consent and message via CommStack. */
  transport?: "sms" | "notify";
  defaultPhone?: string;
  onPhoneChange?: (phone: string) => void;
  onSend: (payload: { body: string; phone: string; conversationId?: string }) => Promise<void>;
  onSendVoice?: (payload: {
    conversationId: string;
    blob: Blob;
    durationSeconds: number;
  }) => Promise<void>;
  onIntroSent: () => Promise<void> | void;
};

export function ConversationComposerArea({
  templates,
  isDraft,
  conversationId,
  consentStatus,
  transport = "sms",
  defaultPhone,
  onPhoneChange,
  onSend,
  onSendVoice,
  onIntroSent,
}: ConversationComposerAreaProps) {
  if (isDraft || !conversationId) {
    return (
      <div className="rounded-xl border border-border bg-white p-4 text-sm text-slate-600">
        Save this conversation in Contact Details to start messaging.
      </div>
    );
  }

  if (transport !== "notify") {
    if (consentStatus === "opted_out") {
      return (
        <div className="rounded-xl border border-rose-300 bg-rose-50 p-4 text-sm text-rose-700">
          This contact has opted out of SMS messages. You can no longer text them.
        </div>
      );
    }

    if (consentStatus !== "opted_in") {
      return <OptInGate conversationId={conversationId} onIntroSent={onIntroSent} />;
    }
  }

  return (
    <MessageComposer
      templates={templates}
      conversationId={conversationId}
      defaultPhone={defaultPhone}
      onPhoneChange={onPhoneChange}
      onSend={onSend}
      enableVoice={transport === "notify"}
      onSendVoice={onSendVoice}
    />
  );
}
