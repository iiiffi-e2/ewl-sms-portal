# Notify Voice Messages — Design Spec

**Date:** 2026-08-10  
**Status:** Approved for implementation (Approach 1)  
**Related:** [Notify / CommStack Integration](./2026-08-03-notify-commstack-design.md)  
**SDK reference:** CommStack Node.js SDK Integration Guide §8.3 Attachments, §8.4 Message history, §8.6 Downloading attachments

## Summary

Add short in-thread voice notes for Notify/CommStack contacts in CareText. Agents can record, preview, and send M4A (AAC) voice messages on direct and channel threads. Inbound Notify voice messages sync into the correct conversation and play from a local Postgres-stored copy. SMS/Twilio messaging stays text-only.

## Goals

- Receive Notify voice messages (`type: 'voice'`) via realtime and history sync; show them in the matching CareText thread.
- Let agents record short voice notes (max 2 minutes), preview, then send to Notify direct or channel contacts.
- Persist a local audio copy so playback does not depend on CommStack availability after ingest/send.
- Shape the data model so photo/PDF attachments can reuse the same attachment path later (no photo/PDF UI in this pass).

## Non-Goals (this pass)

- Voice notes for Twilio SMS or group MMS contacts.
- Photo or PDF send/receive UI (schema hooks only).
- Object storage (S3/R2); files live in Postgres for now.
- Autoplay preference UI (`autoplayVoiceMessage`).
- Retry-from-failed-attachment control (re-record is enough for v1).
- Changing Twilio browser calling (separate from chat voice notes).

## Stakeholder decisions

| Decision | Choice |
|---|---|
| Transport scope | Notify/CommStack only (direct + channel) |
| Local storage | Postgres `Bytes` on `MessageAttachment` |
| Max record length | 2 minutes (for now) |
| Attachment types | Voice now; hooks for photo/PDF later |
| Conversation types | Both `notifyClientId` and `notifyChannelId` |
| Agent send UX | Record → stop → preview (play/discard) → explicit Send |
| Composer layout | Mic beside Send; recording/preview replaces the text field |
| Architecture | Message + Attachment table; server normalizes to M4A |

## Data model

### `Message` additions

| Field | Type | Notes |
|---|---|---|
| `messageType` | enum `text` \| `voice` (later `photo` \| `pdf`) | Default `text` |
| `durationSeconds` | `Int?` | Required when `messageType = voice` |

`body` remains required. For voice messages use a short placeholder (e.g. `"Voice message"`) so existing list/search paths that expect a string continue to work. Twilio/SMS messages stay `messageType: text` with no attachment.

### New `MessageAttachment`

One-to-one with `Message` for v1 (photo/PDF can reuse later).

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | Primary key |
| `messageId` | UUID | Unique FK → `Message` |
| `bytes` | `Bytes` | Normalized audio payload |
| `contentType` | String | e.g. `audio/mp4` |
| `filename` | String | e.g. `note.m4a` |
| `sizeBytes` | Int | Byte length |
| `commStackFile` | String? | CommStack stored filename from send/history |
| `createdAt` / `updatedAt` | DateTime | Standard timestamps |

## Runtime flows

### Inbound (Notify → CareText)

```text
Realtime socket or history sync
  -> message type is voice (and/or file present with type voice)
  -> dedupe by commStackMessageId
  -> messages.download(file) -> Buffer
  -> create Message (messageType=voice, durationSeconds, direction=inbound)
     + MessageAttachment (bytes, contentType, filename, commStackFile)
  -> thread renders audio player bubble
```

**Required change:** stop requiring non-empty `text` before ingesting CommStack messages. Voice notes often have empty `text`.

Inbound bytes are stored as downloaded from CommStack (already M4A from the Notify app). Do not re-encode inbound audio.

If `download` fails: still create the `Message` (`messageType=voice`, `durationSeconds`, `commStackFile` when known) **without** a `MessageAttachment` row. Bubble shows “Audio unavailable”. A later sync may retry download and create the attachment when bytes become available.

Applies to both direct and channel history/realtime paths (`lib/commstack-realtime.ts`, `lib/commstack-sync.ts`).

### Outbound (agent → Notify)

```text
Notify composer: mic beside Send
  -> MediaRecorder (browser format)
  -> stop -> preview (play / discard / Send)
  -> POST /api/messages/send-voice (multipart: audio + duration + conversation identity)
  -> validate Notify contact (client or channel); enforce <= 120s
  -> normalize to M4A/AAC on server (skip re-encode if already AAC-in-MP4)
  -> create Message (queued) + MessageAttachment (normalized bytes)
  -> CommStack sendDirect or sendToChannel:
       type: 'voice', duration, file: { data, filename, contentType }
  -> mark sent + store commStackMessageId / commStackFile
  -> UI optimistic voice bubble, then reconcile status
```

SMS and Twilio group composers are unchanged (no mic).

### Playback

```text
GET /api/messages/[id]/attachment (authenticated)
  -> authorize agent access to conversation
  -> stream MessageAttachment.bytes with Content-Type
```

Thread bubbles use this route only; day-to-day play does not call CommStack.

## UI

### Composer (Notify threads only)

- Mic control beside Send (layout A).
- Idle: text field + mic + Send.
- Recording: text field replaced by timer strip + Stop; hard stop at 2:00.
- Preview: play control, Discard, Send voice.
- Mic permission denied: clear inline error.

### Thread bubbles

- Voice messages render a compact audio player (play/pause, progress, duration).
- Inbound and outbound use existing bubble alignment/colors.
- If attachment bytes are missing after a download failure: show “Audio unavailable” rather than omitting the message.

## Encoding & CommStack integration

- Target format for CommStack: **M4A (MPEG-4 AAC)** — SDK examples use `.m4a` with `type: 'voice'` and `duration` in seconds.
- Browser may produce WebM/Opus (Chrome) or MP4/AAC (Safari); server normalizes before send.
- Conversion helper: ffmpeg (or equivalent). Prefer pass-through when input is already AAC-in-MP4.
- Raise CommStack client timeout for voice uploads above the default 15s text timeout.
- Use existing per-contact CommStack client / portal user id patterns from `lib/commstack.ts`.

## Errors & limits

| Case | Behavior |
|---|---|
| Over 2:00 | UI hard-stops recording; server rejects |
| Over CommStack 50 MB | Reject (unreachable for 2-minute notes in practice) |
| Mic denied | Inline permission message |
| Conversion / CommStack failure | Message `failed` + `errorMessage`; agent re-records |
| Inbound download failure | Persist voice `Message` without `MessageAttachment`; bubble shows “Audio unavailable”; next sync retries download until attachment exists |

## API surface (v1)

| Route | Role |
|---|---|
| `POST /api/messages/send-voice` | Authenticated; Notify-only voice send |
| `GET /api/messages/[id]/attachment` | Authenticated; stream stored audio |
| Existing send/sync routes | Unchanged for text; sync/realtime extended for voice ingest |

Extend conversation/message JSON responses with `messageType`, `durationSeconds`, and an attachment availability flag (not raw bytes in list payloads).

## Testing

- Unit: sync/realtime accept voice with empty text; send-voice rejects non-Notify and over-duration.
- Unit/integration: attachment route requires auth and conversation access; M4A normalization with a fixture buffer.
- Manual: record/preview/send on a Notify DM and a Notify channel; inbound voice from the Notify app appears and plays in the correct thread.

## Components / files (expected touchpoints)

| Area | Likely files |
|---|---|
| Schema | `prisma/schema.prisma` + migration |
| CommStack wrapper | `lib/commstack.ts` (send with file; download; longer timeout) |
| Ingest | `lib/commstack-realtime.ts`, `lib/commstack-sync.ts` |
| Send API | `app/api/messages/send-voice/route.ts` (new) |
| Playback API | `app/api/messages/[id]/attachment/route.ts` (new) |
| Encoding | new helper under `lib/` (e.g. `lib/audio-normalize.ts`) |
| UI | `MessageComposer.tsx`, `MessageBubble.tsx`, `MessageThread.tsx`, dashboard/embed send wiring |
| Types/validators | message DTOs / Zod schemas used by conversation APIs |

## Open implementation notes

- Exact ffmpeg packaging for the deployment host is an implementation detail; the contract is “server produces M4A/AAC before CommStack send.”
- Placeholder `body` text for voice should be stable for search (“Voice message”) unless product asks to hide voice from content search later.
- Photo/PDF: keep `messageType` and `MessageAttachment` generic enough; do not build UI or CommStack send paths for them in this pass.
