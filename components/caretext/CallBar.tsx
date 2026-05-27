"use client";

import { useVoiceCall } from "@/components/caretext/VoiceCallProvider";

function formatElapsed(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function statusLabel(phase: string): string {
  switch (phase) {
    case "connecting":
      return "Connecting";
    case "ringing":
      return "Ringing";
    case "connected":
      return "Connected";
    case "disconnecting":
      return "Ending call";
    default:
      return "Call";
  }
}

export function CallBar() {
  const { callPhase, isCallActive, isMuted, elapsedSeconds, activeCall, endCall, toggleMute } =
    useVoiceCall();

  if (!isCallActive || !activeCall) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-emerald-900">
          {activeCall.contactName || activeCall.phone}
        </p>
        <p className="text-xs text-emerald-700">
          {statusLabel(callPhase)}
          {callPhase === "connected" ? ` · ${formatElapsed(elapsedSeconds)}` : null}
        </p>
      </div>
      <button
        type="button"
        onClick={toggleMute}
        disabled={callPhase !== "connected"}
        className="rounded-lg border border-emerald-300 bg-white px-3 py-2 text-sm font-medium text-emerald-800 disabled:opacity-50"
      >
        {isMuted ? "Unmute" : "Mute"}
      </button>
      <button
        type="button"
        onClick={endCall}
        className="rounded-lg bg-rose-600 px-3 py-2 text-sm font-semibold text-white"
      >
        End Call
      </button>
    </div>
  );
}
