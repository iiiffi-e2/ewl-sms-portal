"use client";

import clsx from "clsx";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { formatCallDuration } from "@/lib/call-log-display";

type VoiceMessagePlayerProps = {
  src: string;
  durationSeconds?: number | null;
  /** Match outbound indigo bubbles vs inbound white/colored bubbles. */
  tone?: "outbound" | "inbound";
  className?: string;
};

function formatClock(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  return formatCallDuration(safe) ?? "0:00";
}

export function VoiceMessagePlayer({
  src,
  durationSeconds,
  tone = "inbound",
  className,
}: VoiceMessagePlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(
    durationSeconds && durationSeconds > 0 ? durationSeconds : 0,
  );

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTimeUpdate = () => setCurrent(audio.currentTime);
    const onLoaded = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        setDuration(audio.duration);
      }
    };
    const onEnded = () => {
      setPlaying(false);
      setCurrent(0);
      audio.currentTime = 0;
    };
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);

    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("loadedmetadata", onLoaded);
    audio.addEventListener("durationchange", onLoaded);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);

    return () => {
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("loadedmetadata", onLoaded);
      audio.removeEventListener("durationchange", onLoaded);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
    };
  }, [src]);

  useEffect(() => {
    if (durationSeconds && durationSeconds > 0) {
      setDuration(durationSeconds);
    }
  }, [durationSeconds]);

  const toggle = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      try {
        await audio.play();
      } catch {
        // Autoplay / load errors surface as a still-paused control.
      }
    } else {
      audio.pause();
    }
  };

  const seek = (event: ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current;
    const next = Number(event.target.value);
    if (!audio || !Number.isFinite(next)) return;
    audio.currentTime = next;
    setCurrent(next);
  };

  const total = duration > 0 ? duration : Math.max(current, 1);
  const progress = Math.min(100, (current / total) * 100);
  const outbound = tone === "outbound";

  return (
    <div className={clsx("flex min-w-[200px] items-center gap-3", className)}>
      <audio ref={audioRef} src={src} preload="metadata" className="hidden" />
      <button
        type="button"
        onClick={() => {
          void toggle();
        }}
        aria-label={playing ? "Pause voice message" : "Play voice message"}
        className={clsx(
          "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition",
          outbound
            ? "bg-white/20 text-white hover:bg-white/30"
            : "bg-indigo-600 text-white hover:bg-indigo-500",
        )}
      >
        {playing ? (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="h-4 w-4"
            aria-hidden="true"
          >
            <path d="M5.75 3A1.75 1.75 0 0 0 4 4.75v10.5c0 .966.784 1.75 1.75 1.75h1.5A1.75 1.75 0 0 0 9 15.25V4.75A1.75 1.75 0 0 0 7.25 3h-1.5ZM12.75 3A1.75 1.75 0 0 0 11 4.75v10.5c0 .966.784 1.75 1.75 1.75h1.5A1.75 1.75 0 0 0 16 15.25V4.75A1.75 1.75 0 0 0 14.25 3h-1.5Z" />
          </svg>
        ) : (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="h-4 w-4 translate-x-px"
            aria-hidden="true"
          >
            <path d="M6.3 2.84A1.5 1.5 0 0 0 4 4.11v11.78a1.5 1.5 0 0 0 2.3 1.27l9.344-5.891a1.5 1.5 0 0 0 0-2.538L6.3 2.841Z" />
          </svg>
        )}
      </button>

      <div className="min-w-0 flex-1 space-y-1">
        <div className="relative h-1.5 overflow-hidden rounded-full">
          <div
            className={clsx(
              "absolute inset-0",
              outbound ? "bg-white/25" : "bg-slate-200",
            )}
          />
          <div
            className={clsx(
              "absolute inset-y-0 left-0 rounded-full",
              outbound ? "bg-white" : "bg-indigo-600",
            )}
            style={{ width: `${progress}%` }}
          />
          <input
            type="range"
            min={0}
            max={total}
            step={0.05}
            value={Math.min(current, total)}
            onChange={seek}
            aria-label="Seek voice message"
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
        </div>
        <div
          className={clsx(
            "flex justify-between font-mono text-[11px] tabular-nums",
            outbound ? "text-indigo-100" : "text-muted",
          )}
        >
          <span>{formatClock(current)}</span>
          <span>{formatClock(duration || durationSeconds || 0)}</span>
        </div>
      </div>
    </div>
  );
}
