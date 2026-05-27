"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Device, Call } from "@twilio/voice-sdk";

type CallPhase = "idle" | "connecting" | "ringing" | "connected" | "disconnecting" | "error";

type ActiveCallInfo = {
  callLogId: string;
  conversationId: string;
  phone: string;
  contactName?: string | null;
};

type VoiceCallContextValue = {
  callPhase: CallPhase;
  isCallActive: boolean;
  isMuted: boolean;
  elapsedSeconds: number;
  activeCall: ActiveCallInfo | null;
  errorMessage: string | null;
  startCall: (input: {
    conversationId: string;
    phone: string;
    contactName?: string | null;
  }) => Promise<void>;
  endCall: () => void;
  toggleMute: () => void;
};

const VoiceCallContext = createContext<VoiceCallContextValue | null>(null);

export function useVoiceCall() {
  const context = useContext(VoiceCallContext);
  if (!context) {
    throw new Error("useVoiceCall must be used within VoiceCallProvider");
  }
  return context;
}

export function VoiceCallProvider({ children }: { children: ReactNode }) {
  const deviceRef = useRef<Device | null>(null);
  const activeCallRef = useRef<Call | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const connectedAtRef = useRef<number | null>(null);

  const [callPhase, setCallPhase] = useState<CallPhase>("idle");
  const [isMuted, setIsMuted] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [activeCall, setActiveCall] = useState<ActiveCallInfo | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const resetCallState = useCallback(() => {
    clearTimer();
    connectedAtRef.current = null;
    activeCallRef.current = null;
    setIsMuted(false);
    setElapsedSeconds(0);
    setActiveCall(null);
    setCallPhase("idle");
  }, [clearTimer]);

  const cancelCallLog = useCallback(async (callLogId: string) => {
    await fetch(`/api/calls/${callLogId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "canceled" }),
    });
  }, []);

  const setupDevice = useCallback(async () => {
    const response = await fetch("/api/voice/token");
    if (!response.ok) {
      throw new Error("Voice calling is not available.");
    }

    const data = await response.json();
    const device = new Device(data.token, {
      codecPreferences: [Call.Codec.Opus, Call.Codec.PCMU],
    });

    device.on("error", (error) => {
      console.error("Twilio Device error:", error);
      setErrorMessage(error.message);
      setCallPhase("error");
    });

    device.on("tokenWillExpire", async () => {
      const tokenResponse = await fetch("/api/voice/token");
      if (tokenResponse.ok) {
        const tokenData = await tokenResponse.json();
        device.updateToken(tokenData.token);
      }
    });

    await device.register();
    deviceRef.current = device;
  }, []);

  useEffect(() => {
    let cancelled = false;

    setupDevice().catch((error) => {
      if (!cancelled) {
        console.error("Failed to initialize voice device:", error);
        setErrorMessage("Voice calling is not available.");
      }
    });

    return () => {
      cancelled = true;
      clearTimer();
      deviceRef.current?.destroy();
      deviceRef.current = null;
    };
  }, [clearTimer, setupDevice]);

  const bindCallEvents = useCallback(
    (call: Call, callLogId: string) => {
      let wasConnected = false;

      call.on("ringing", () => setCallPhase("ringing"));
      call.on("accept", () => {
        wasConnected = true;
        setCallPhase("connected");
        connectedAtRef.current = Date.now();
        clearTimer();
        timerRef.current = setInterval(() => {
          if (connectedAtRef.current) {
            setElapsedSeconds(Math.floor((Date.now() - connectedAtRef.current) / 1000));
          }
        }, 1000);
      });
      call.on("disconnect", async () => {
        setCallPhase("disconnecting");
        if (!wasConnected) {
          await cancelCallLog(callLogId);
        }
        resetCallState();
      });
      call.on("cancel", async () => {
        await cancelCallLog(callLogId);
        resetCallState();
      });
      call.on("error", async (error) => {
        console.error("Twilio Call error:", error);
        setErrorMessage(error.message);
        await cancelCallLog(callLogId);
        setCallPhase("error");
        resetCallState();
      });
    },
    [cancelCallLog, clearTimer, resetCallState],
  );

  const startCall = useCallback(
    async (input: { conversationId: string; phone: string; contactName?: string | null }) => {
      if (!deviceRef.current || callPhase !== "idle") {
        return;
      }

      setErrorMessage(null);
      setCallPhase("connecting");

      let callLogId: string | null = null;

      try {
        const initiateResponse = await fetch("/api/calls/initiate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            conversationId: input.conversationId,
            phone: input.phone,
          }),
        });

        if (!initiateResponse.ok) {
          const errorData = await initiateResponse.json();
          throw new Error(errorData.error ?? "Failed to start call.");
        }

        const initiateData = await initiateResponse.json();
        callLogId = initiateData.callLogId as string;

        setActiveCall({
          callLogId,
          conversationId: input.conversationId,
          phone: input.phone,
          contactName: input.contactName,
        });

        const call = await deviceRef.current.connect({
          params: {
            To: input.phone,
            callLogId,
            conversationId: input.conversationId,
          },
        });

        activeCallRef.current = call;
        bindCallEvents(call, callLogId);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to start call.";
        setErrorMessage(message);
        if (callLogId) {
          await cancelCallLog(callLogId);
        }
        resetCallState();
      }
    },
    [bindCallEvents, callPhase, cancelCallLog, resetCallState],
  );

  const endCall = useCallback(() => {
    setCallPhase("disconnecting");
    deviceRef.current?.disconnectAll();
  }, []);

  const toggleMute = useCallback(() => {
    const call = activeCallRef.current;
    if (!call) return;
    const nextMuted = !call.isMuted();
    call.mute(nextMuted);
    setIsMuted(nextMuted);
  }, []);

  const value = useMemo(
    () => ({
      callPhase,
      isCallActive: callPhase !== "idle" && callPhase !== "error",
      isMuted,
      elapsedSeconds,
      activeCall,
      errorMessage,
      startCall,
      endCall,
      toggleMute,
    }),
    [activeCall, callPhase, elapsedSeconds, endCall, errorMessage, isMuted, startCall, toggleMute],
  );

  return <VoiceCallContext.Provider value={value}>{children}</VoiceCallContext.Provider>;
}
