"use client";

import { useEffect, useState } from "react";
import { useDialer } from "@/components/caretext/DialerProvider";
import { useVoiceCall } from "@/components/caretext/VoiceCallProvider";
import {
  appendDialerDigit,
  backspaceDialerInput,
  canPlaceDialerCall,
  formatDialerDisplay,
} from "@/lib/dialer";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"] as const;

export function DialerModal() {
  const { isOpen, closeDialer } = useDialer();
  const { startCall, isCallActive, errorMessage } = useVoiceCall();
  const [raw, setRaw] = useState("");
  const [contactName, setContactName] = useState<string | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setRaw("");
      setContactName(null);
      setLookupError(null);
      setIsStarting(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeDialer();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [closeDialer, isOpen]);

  useEffect(() => {
    if (!isOpen || !canPlaceDialerCall(raw)) {
      setContactName(null);
      return;
    }

    const controller = new AbortController();
    void fetch(`/api/contacts?smsOnly=1&phone=${encodeURIComponent(raw)}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          return;
        }
        const data = (await response.json()) as {
          contacts?: Array<{ name: string | null }>;
        };
        setContactName(data.contacts?.[0]?.name ?? null);
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setContactName(null);
        }
      });

    return () => controller.abort();
  }, [isOpen, raw]);

  useEffect(() => {
    if (isOpen && isCallActive) {
      closeDialer();
    }
  }, [closeDialer, isCallActive, isOpen]);

  if (!isOpen) {
    return null;
  }

  const canCall = canPlaceDialerCall(raw) && !isCallActive && !isStarting;

  async function onCall() {
    if (!canPlaceDialerCall(raw) || isCallActive || isStarting) {
      return;
    }
    setIsStarting(true);
    setLookupError(null);
    await startCall({ phone: raw, contactName });
    setIsStarting(false);
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialer-title"
        className="w-full max-w-sm rounded-xl border border-border bg-white p-4 shadow-lg"
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 id="dialer-title" className="text-lg font-semibold">
              New Call
            </h2>
            {contactName ? <p className="text-sm text-muted">{contactName}</p> : null}
          </div>
          <button
            type="button"
            className="rounded-lg border border-border px-2 py-1 text-sm"
            onClick={closeDialer}
          >
            Close
          </button>
        </div>
        <label className="sr-only" htmlFor="dialer-number">
          Phone number
        </label>
        <input
          id="dialer-number"
          value={formatDialerDisplay(raw)}
          onChange={(event) => {
            const next = event.target.value.replace(/[^\d+*#]/g, "");
            setRaw(next.startsWith("+") ? `+${next.slice(1).replace(/\+/g, "")}` : next.replace(/\+/g, ""));
          }}
          inputMode="tel"
          autoComplete="tel"
          className="mb-3 w-full rounded-lg border border-border px-3 py-2 text-lg tracking-wide"
        />
        <div className="mb-3 grid grid-cols-3 gap-2">
          {KEYS.map((key) => (
            <button
              key={key}
              type="button"
              className="rounded-lg border border-border bg-slate-50 py-3 text-lg font-semibold"
              onClick={() => setRaw((current) => appendDialerDigit(current, key))}
            >
              {key}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            className="flex-1 rounded-lg border border-border px-3 py-2 text-sm"
            onClick={() => setRaw((current) => backspaceDialerInput(current))}
          >
            Backspace
          </button>
          <button
            type="button"
            disabled={!canCall}
            className="flex-1 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => void onCall()}
          >
            Call
          </button>
        </div>
        {isCallActive ? <p className="mt-2 text-sm text-amber-700">You already have an active call.</p> : null}
        {lookupError || errorMessage ? (
          <p className="mt-2 text-sm text-rose-700">{lookupError || errorMessage}</p>
        ) : null}
      </div>
    </div>
  );
}
