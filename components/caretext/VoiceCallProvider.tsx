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
import { PRESENCE_HEARTBEAT_MS } from "@/lib/voice/presence";

const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000;

type VoiceTokenResponse = {
  token: string;
  expiresIn: number;
};

type TwilioError = {
  code?: number;
  message?: string;
};

function isTokenExpiredError(error: TwilioError): boolean {
  return error.code === 20104 || Boolean(error.message?.includes("AccessTokenExpired"));
}

async function fetchVoiceToken(): Promise<VoiceTokenResponse> {
  const response = await fetch("/api/voice/token");
  if (!response.ok) {
    throw new Error("Voice calling is not available.");
  }
  return response.json();
}

function readCallParam(call: Call, key: string): string | undefined {
  const value = call.customParameters?.get(key);
  return value ? value : undefined;
}

async function pingPresence() {
  await fetch("/api/voice/presence", { method: "POST" });
}

async function clearPresence() {
  await fetch("/api/voice/presence", { method: "DELETE", keepalive: true });
}

type CallPhase =
  | "idle"
  | "incoming"
  | "connecting"
  | "ringing"
  | "connected"
  | "disconnecting"
  | "error";

type ActiveCallInfo = {
  callLogId: string;
  conversationId: string;
  phone: string;
  contactName?: string | null;
};

type IncomingCallInfo = ActiveCallInfo;

type VoiceCallContextValue = {
  callPhase: CallPhase;
  isCallActive: boolean;
  isMuted: boolean;
  elapsedSeconds: number;
  activeCall: ActiveCallInfo | null;
  incomingCall: IncomingCallInfo | null;
  errorMessage: string | null;
  startCall: (input: {
    conversationId: string;
    phone: string;
    contactName?: string | null;
  }) => Promise<void>;
  acceptIncoming: () => Promise<string | null>;
  declineIncoming: () => void;
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
  const incomingSdkCallRef = useRef<Call | null>(null);
  const incomingCallRef = useRef<IncomingCallInfo | null>(null);
  const callPhaseRef = useRef<CallPhase>("idle");
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heartbeatTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tokenExpiresAtRef = useRef<number | null>(null);
  const connectedAtRef = useRef<number | null>(null);

  const [callPhase, setCallPhase] = useState<CallPhase>("idle");
  const [isMuted, setIsMuted] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [activeCall, setActiveCall] = useState<ActiveCallInfo | null>(null);
  const [incomingCall, setIncomingCall] = useState<IncomingCallInfo | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  callPhaseRef.current = callPhase;
  incomingCallRef.current = incomingCall;

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const clearRefreshTimer = useCallback(() => {
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
  }, []);

  const clearHeartbeat = useCallback(() => {
    if (heartbeatTimerRef.current) {
      clearInterval(heartbeatTimerRef.current);
      heartbeatTimerRef.current = null;
    }
  }, []);

  const startHeartbeat = useCallback(() => {
    clearHeartbeat();
    void pingPresence().catch((error) => {
      console.error("Failed to publish voice presence:", error);
    });
    heartbeatTimerRef.current = setInterval(() => {
      void pingPresence().catch((error) => {
        console.error("Failed to publish voice presence:", error);
      });
    }, PRESENCE_HEARTBEAT_MS);
  }, [clearHeartbeat]);

  const clearIncoming = useCallback(() => {
    incomingSdkCallRef.current = null;
    incomingCallRef.current = null;
    setIncomingCall(null);
  }, []);

  const scheduleTokenRefresh = useCallback(
    (refreshFn: () => Promise<void>) => {
      clearRefreshTimer();
      const expiresAt = tokenExpiresAtRef.current;
      if (!expiresAt) {
        return;
      }

      const delay = Math.max(expiresAt - TOKEN_REFRESH_BUFFER_MS - Date.now(), 0);
      refreshTimerRef.current = setTimeout(() => {
        refreshFn().catch((error) => {
          console.error("Failed to refresh voice token:", error);
        });
      }, delay);
    },
    [clearRefreshTimer],
  );

  const refreshDeviceToken = useCallback(async () => {
    const device = deviceRef.current;
    if (!device) {
      throw new Error("Voice device is not initialized.");
    }

    const data = await fetchVoiceToken();
    await device.updateToken(data.token);
    tokenExpiresAtRef.current = Date.now() + data.expiresIn * 1000;
    scheduleTokenRefresh(() => refreshDeviceTokenRef.current());
    setErrorMessage(null);
  }, [scheduleTokenRefresh]);

  const refreshDeviceTokenRef = useRef(refreshDeviceToken);
  refreshDeviceTokenRef.current = refreshDeviceToken;

  const recoverExpiredToken = useCallback(async () => {
    const device = deviceRef.current;
    if (!device) {
      return false;
    }

    try {
      const data = await fetchVoiceToken();
      await device.updateToken(data.token);
      await device.register();
      tokenExpiresAtRef.current = Date.now() + data.expiresIn * 1000;
      scheduleTokenRefresh(() => refreshDeviceTokenRef.current());
      setErrorMessage(null);
      if (!activeCallRef.current && !incomingSdkCallRef.current) {
        setCallPhase("idle");
      }
      return true;
    } catch (error) {
      console.error("Failed to recover expired voice token:", error);
      return false;
    }
  }, [scheduleTokenRefresh]);

  const recoverExpiredTokenRef = useRef(recoverExpiredToken);
  recoverExpiredTokenRef.current = recoverExpiredToken;

  const resetCallState = useCallback(() => {
    clearTimer();
    connectedAtRef.current = null;
    activeCallRef.current = null;
    clearIncoming();
    setIsMuted(false);
    setElapsedSeconds(0);
    setActiveCall(null);
    setCallPhase("idle");
  }, [clearIncoming, clearTimer]);

  const cancelCallLog = useCallback(async (callLogId: string) => {
    await fetch(`/api/calls/${callLogId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "canceled" }),
    });
  }, []);

  const setupDevice = useCallback(async () => {
    const data = await fetchVoiceToken();
    const device = new Device(data.token, {
      codecPreferences: [Call.Codec.Opus, Call.Codec.PCMU],
    });

    tokenExpiresAtRef.current = Date.now() + data.expiresIn * 1000;

    device.on("error", async (error) => {
      console.error("Twilio Device error:", error);
      if (isTokenExpiredError(error)) {
        const recovered = await recoverExpiredTokenRef.current();
        if (recovered) {
          return;
        }
      }
      setErrorMessage(error.message ?? "Voice calling error.");
      setCallPhase("error");
    });

    device.on("tokenWillExpire", () => {
      refreshDeviceTokenRef.current().catch((error) => {
        console.error("Failed to refresh voice token on expiry warning:", error);
      });
    });

    device.on("incoming", (call) => {
      const phase = callPhaseRef.current;
      const busy =
        Boolean(activeCallRef.current) ||
        (phase !== "idle" && phase !== "error" && phase !== "incoming");

      if (busy || incomingSdkCallRef.current) {
        call.reject();
        return;
      }

      const callLogId = readCallParam(call, "callLogId");
      const conversationId = readCallParam(call, "conversationId");
      const phone = readCallParam(call, "phone");
      const contactName = readCallParam(call, "contactName") || null;

      if (!callLogId || !conversationId || !phone) {
        call.reject();
        return;
      }

      const info: IncomingCallInfo = {
        callLogId,
        conversationId,
        phone,
        contactName,
      };

      incomingSdkCallRef.current = call;
      incomingCallRef.current = info;
      setIncomingCall(info);
      setCallPhase("incoming");
      setErrorMessage(null);

      call.on("cancel", () => {
        if (incomingSdkCallRef.current !== call) {
          return;
        }
        clearIncoming();
        if (callPhaseRef.current === "incoming") {
          setCallPhase("idle");
        }
      });
    });

    await device.register();
    deviceRef.current = device;
    scheduleTokenRefresh(() => refreshDeviceTokenRef.current());
  }, [clearIncoming, scheduleTokenRefresh]);

  useEffect(() => {
    startHeartbeat();
    return () => {
      clearHeartbeat();
      void clearPresence().catch(() => undefined);
    };
  }, [clearHeartbeat, startHeartbeat]);

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
      clearRefreshTimer();
      deviceRef.current?.destroy();
      deviceRef.current = null;
      tokenExpiresAtRef.current = null;
    };
  }, [clearRefreshTimer, clearTimer, setupDevice]);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState !== "visible") {
        return;
      }

      void pingPresence().catch((error) => {
        console.error("Failed to publish voice presence after tab became visible:", error);
      });

      const expiresAt = tokenExpiresAtRef.current;
      if (!deviceRef.current || !expiresAt) {
        return;
      }

      if (Date.now() >= expiresAt - TOKEN_REFRESH_BUFFER_MS) {
        refreshDeviceToken().catch((error) => {
          console.error("Failed to refresh voice token after tab became visible:", error);
        });
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [refreshDeviceToken]);

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
      if (!deviceRef.current) {
        return;
      }

      const canStartCall = callPhase === "idle" || callPhase === "error";
      if (!canStartCall) {
        return;
      }

      setErrorMessage(null);
      setCallPhase("connecting");

      const expiresAt = tokenExpiresAtRef.current;
      if (expiresAt && Date.now() >= expiresAt - TOKEN_REFRESH_BUFFER_MS) {
        try {
          await refreshDeviceToken();
        } catch {
          const recovered = await recoverExpiredToken();
          if (!recovered) {
            setErrorMessage("Voice calling session expired. Refresh the page and try again.");
            setCallPhase("error");
            return;
          }
        }
      }

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
    [bindCallEvents, callPhase, cancelCallLog, recoverExpiredToken, refreshDeviceToken, resetCallState],
  );

  const acceptIncoming = useCallback(async () => {
    const call = incomingSdkCallRef.current;
    const info = incomingCallRef.current;
    if (!call || !info) {
      return null;
    }

    incomingSdkCallRef.current = null;
    setIncomingCall(null);
    setErrorMessage(null);
    setCallPhase("connecting");
    setActiveCall(info);
    activeCallRef.current = call;
    bindCallEvents(call, info.callLogId);

    try {
      call.accept();
      await fetch(`/api/calls/${info.callLogId}/answer`, { method: "POST" });
      return info.conversationId;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to answer call.";
      setErrorMessage(message);
      call.disconnect();
      resetCallState();
      return null;
    }
  }, [bindCallEvents, resetCallState]);

  const declineIncoming = useCallback(() => {
    const call = incomingSdkCallRef.current;
    call?.reject();
    clearIncoming();
    setCallPhase("idle");
  }, [clearIncoming]);

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
      incomingCall,
      errorMessage,
      startCall,
      acceptIncoming,
      declineIncoming,
      endCall,
      toggleMute,
    }),
    [
      acceptIncoming,
      activeCall,
      callPhase,
      declineIncoming,
      elapsedSeconds,
      endCall,
      errorMessage,
      incomingCall,
      isMuted,
      startCall,
      toggleMute,
    ],
  );

  return <VoiceCallContext.Provider value={value}>{children}</VoiceCallContext.Provider>;
}
