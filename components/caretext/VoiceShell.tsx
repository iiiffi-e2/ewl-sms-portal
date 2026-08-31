"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { CallBar } from "@/components/caretext/CallBar";
import { DialerModal } from "@/components/caretext/DialerModal";
import { DialerProvider } from "@/components/caretext/DialerProvider";
import { IncomingCallBar } from "@/components/caretext/IncomingCallBar";
import { VoiceCallProvider } from "@/components/caretext/VoiceCallProvider";

export function VoiceShell({ children }: { children: ReactNode }) {
  return (
    <VoiceCallProvider>
      <DialerProvider>
        {children}
        <DialerModal />
      </DialerProvider>
    </VoiceCallProvider>
  );
}

export function GlobalIncomingCallBar() {
  const router = useRouter();

  return (
    <IncomingCallBar
      onAccepted={(conversationId) => {
        if (conversationId) {
          router.push(`/dashboard?conversationId=${conversationId}`);
        }
      }}
    />
  );
}

export function GlobalCallBar() {
  return <CallBar />;
}
