"use client";

import { memo, useEffect, useRef, useState } from "react";
import { TemplateSelector } from "@/components/caretext/TemplateSelector";
import {
  VOICE_RECORD_MAX_SECONDS,
  formatRecordingElapsed,
  pickRecorderMimeType,
  toVoiceDurationSeconds,
} from "@/lib/voice-recorder";

type Template = {
  id: string;
  title: string;
  body: string;
};

type MessageComposerProps = {
  templates: Template[];
  conversationId?: string;
  defaultPhone?: string;
  onPhoneChange?: (phone: string) => void;
  onSend: (payload: { body: string; phone: string; conversationId?: string }) => Promise<void>;
  enableVoice?: boolean;
  onSendVoice?: (payload: {
    conversationId: string;
    blob: Blob;
    durationSeconds: number;
  }) => Promise<void>;
};

type VoicePhase = "idle" | "recording" | "preview";

export const MessageComposer = memo(function MessageComposer({
  templates,
  conversationId,
  defaultPhone,
  onPhoneChange,
  onSend,
  enableVoice = false,
  onSendVoice,
}: MessageComposerProps) {
  const [body, setBody] = useState("");
  const [phone, setPhone] = useState(defaultPhone ?? "");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [voicePhase, setVoicePhase] = useState<VoicePhase>("idle");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);
  const [previewDuration, setPreviewDuration] = useState(0);
  const [isSendingVoice, setIsSendingVoice] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoStopRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  const recordGenerationRef = useRef(0);
  const conversationIdRef = useRef(conversationId);
  const enableVoiceRef = useRef(enableVoice);

  useEffect(() => {
    conversationIdRef.current = conversationId;
    enableVoiceRef.current = enableVoice;
  }, [conversationId, enableVoice]);

  useEffect(() => {
    if (defaultPhone !== undefined) {
      setPhone(defaultPhone);
    }
  }, [defaultPhone]);

  const clearTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (autoStopRef.current) {
      clearTimeout(autoStopRef.current);
      autoStopRef.current = null;
    }
  };

  const stopMediaTracks = () => {
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
  };

  const revokePreviewUrl = () => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    setPreviewUrl(null);
  };

  const resetVoiceState = () => {
    clearTimer();
    const recorder = mediaRecorderRef.current;
    if (recorder) {
      recorder.ondataavailable = null;
      recorder.onstop = null;
      if (recorder.state !== "inactive") {
        try {
          recorder.stop();
        } catch {
          // ignore cleanup stop errors
        }
      }
    }
    stopMediaTracks();
    mediaRecorderRef.current = null;
    chunksRef.current = [];
    startedAtRef.current = 0;
    setElapsedSeconds(0);
    setPreviewBlob(null);
    setPreviewDuration(0);
    revokePreviewUrl();
    setVoicePhase("idle");
    setError(null);
    setIsSendingVoice(false);
  };

  useEffect(() => {
    recordGenerationRef.current += 1;
    resetVoiceState();
  }, [conversationId, enableVoice]);

  useEffect(() => {
    return () => {
      clearTimer();
      stopMediaTracks();
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        try {
          mediaRecorderRef.current.stop();
        } catch {
          // ignore cleanup stop errors
        }
      }
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
      }
    };
  }, []);

  const finishRecording = () => {
    clearTimer();
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    } else {
      stopMediaTracks();
      setVoicePhase("idle");
    }
  };

  const startRecording = async () => {
    if (!enableVoice || !conversationId || !onSendVoice) return;
    setError(null);

    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setError("Voice recording is not supported in this browser.");
      return;
    }

    const generation = ++recordGenerationRef.current;
    const startedConversationId = conversationId;
    const startedEnableVoice = enableVoice;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      if (
        generation !== recordGenerationRef.current ||
        conversationIdRef.current !== startedConversationId ||
        enableVoiceRef.current !== startedEnableVoice ||
        !enableVoiceRef.current
      ) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      mediaStreamRef.current = stream;
      chunksRef.current = [];

      const mimeType = pickRecorderMimeType((type) => MediaRecorder.isTypeSupported(type));
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      mediaRecorderRef.current = recorder;
      startedAtRef.current = Date.now();
      setElapsedSeconds(0);
      setVoicePhase("recording");

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        stopMediaTracks();
        const blobType = recorder.mimeType || mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type: blobType });
        chunksRef.current = [];
        mediaRecorderRef.current = null;

        if (blob.size === 0) {
          setError("Recording was empty. Please try again.");
          resetVoiceState();
          return;
        }

        const durationSeconds = toVoiceDurationSeconds(
          (Date.now() - startedAtRef.current) / 1000,
        );
        const url = URL.createObjectURL(blob);
        previewUrlRef.current = url;
        setPreviewUrl(url);
        setPreviewBlob(blob);
        setPreviewDuration(durationSeconds);
        setElapsedSeconds(durationSeconds);
        setVoicePhase("preview");
      };

      recorder.start();

      timerRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startedAtRef.current) / 1000);
        setElapsedSeconds(Math.min(elapsed, VOICE_RECORD_MAX_SECONDS));
      }, 250);

      autoStopRef.current = setTimeout(() => {
        finishRecording();
      }, VOICE_RECORD_MAX_SECONDS * 1000);
    } catch {
      stopMediaTracks();
      clearTimer();
      setVoicePhase("idle");
      setError("Microphone permission denied or unavailable.");
    }
  };

  const discardPreview = () => {
    setError(null);
    resetVoiceState();
  };

  const sendVoice = async () => {
    if (!conversationId || !onSendVoice || !previewBlob) return;
    setIsSendingVoice(true);
    setError(null);
    try {
      await onSendVoice({
        conversationId,
        blob: previewBlob,
        durationSeconds: previewDuration,
      });
      resetVoiceState();
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "Failed to send voice note.");
    } finally {
      setIsSendingVoice(false);
    }
  };

  return (
    <div className="space-y-2 rounded-xl border border-border bg-white p-4">
      {!conversationId && (
        <input
          value={phone}
          onChange={(event) => {
            setPhone(event.target.value);
            onPhoneChange?.(event.target.value);
          }}
          placeholder="Recipient phone number"
          className="w-full rounded-lg border border-border px-3 py-2.5 text-sm"
        />
      )}
      <TemplateSelector templates={templates} onChoose={(templateBody) => setBody(templateBody)} />
      {voicePhase === "idle" ? (
        <textarea
          className="h-24 w-full resize-y rounded-lg border border-border px-3 py-2.5 text-sm"
          placeholder="Type your message..."
          value={body}
          onChange={(event) => setBody(event.target.value)}
        />
      ) : voicePhase === "recording" ? (
        <div className="flex h-24 items-center justify-between rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5">
          <div className="space-y-0.5">
            <p className="text-sm font-semibold text-rose-700">Recording…</p>
            <p className="font-mono text-sm text-rose-600">
              {formatRecordingElapsed(elapsedSeconds)} / {formatRecordingElapsed(VOICE_RECORD_MAX_SECONDS)}
            </p>
          </div>
          <span className="inline-flex h-2.5 w-2.5 animate-pulse rounded-full bg-rose-500" aria-hidden />
        </div>
      ) : (
        <div className="space-y-2 rounded-lg border border-border bg-slate-50 px-3 py-2.5">
          <p className="text-sm font-semibold text-slate-700">
            Preview · {formatRecordingElapsed(previewDuration)}
          </p>
          {previewUrl ? (
            <audio controls preload="metadata" src={previewUrl} className="w-full max-w-full" />
          ) : null}
        </div>
      )}
      {error && <p className="text-xs text-rose-600">{error}</p>}
      <div className="flex flex-wrap justify-end gap-2">
        {voicePhase === "idle" ? (
          <>
            {enableVoice ? (
              <button
                type="button"
                aria-label="Record voice note"
                className="rounded-lg border border-border bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 disabled:opacity-60"
                disabled={isSending || !conversationId || !onSendVoice}
                onClick={() => {
                  void startRecording();
                }}
              >
                Mic
              </button>
            ) : null}
            <button
              className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60 sm:w-auto"
              disabled={isSending}
              onClick={async () => {
                setIsSending(true);
                setError(null);
                try {
                  await onSend({ body, phone, conversationId });
                  setBody("");
                } catch (sendError) {
                  setError(sendError instanceof Error ? sendError.message : "Failed to send.");
                } finally {
                  setIsSending(false);
                }
              }}
            >
              {isSending ? "Sending..." : "Send message"}
            </button>
          </>
        ) : null}
        {voicePhase === "recording" ? (
          <button
            type="button"
            className="rounded-lg bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white"
            onClick={finishRecording}
          >
            Stop
          </button>
        ) : null}
        {voicePhase === "preview" ? (
          <>
            <button
              type="button"
              className="rounded-lg border border-border bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 disabled:opacity-60"
              disabled={isSendingVoice}
              onClick={discardPreview}
            >
              Discard
            </button>
            <button
              type="button"
              className="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
              disabled={isSendingVoice}
              onClick={() => {
                void sendVoice();
              }}
            >
              {isSendingVoice ? "Sending..." : "Send voice"}
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
});
