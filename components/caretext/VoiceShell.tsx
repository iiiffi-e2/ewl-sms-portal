"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { IncomingCallBar } from "@/components/caretext/IncomingCallBar";
import { VoiceCallProvider } from "@/components/caretext/VoiceCallProvider";

export function VoiceShell({ children }: { children: ReactNode }) {
  return <VoiceCallProvider>{children}</VoiceCallProvider>;
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
