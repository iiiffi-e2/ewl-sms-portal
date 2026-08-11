# Notify Voice Messages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let CareText agents record/preview/send Notify voice notes (M4A) and show inbound Notify voice messages in the correct thread with local playback.

**Architecture:** Extend `Message` with `messageType` + `durationSeconds`, store audio bytes in `MessageAttachment`, normalize outbound audio to M4A on the server, send/receive via CommStack SDK voice attachments (`type: 'voice'`, `duration`, `file`, `download`). Notify-only UI: mic beside Send with preview; authenticated attachment streaming for playback.

**Tech Stack:** Next.js 16 (App Router), Prisma 6 + PostgreSQL, React 19, Vitest, Zod, `@notify/commstack-sdk` 1.2, `ffmpeg-static` for AAC/M4A normalization.

**Spec:** `docs/superpowers/specs/2026-08-10-notify-voice-messages-design.md`

## Global Constraints

- Notify/CommStack contacts only (`notifyClientId` or `notifyChannelId`) — never Twilio SMS/group MMS voice.
- Max agent recording length: **120 seconds**.
- Outbound format for CommStack: **M4A (AAC)** with `type: 'voice'` and `duration` in seconds.
- Local copy in Postgres `MessageAttachment.bytes`; day-to-day playback must not call CommStack.
- Inbound: store downloaded bytes as-is (no re-encode); on download failure keep voice `Message` without attachment.
- Do not require non-empty `text` to ingest CommStack messages (voice often has empty text).
- Photo/PDF: schema hooks only — no send/receive UI.
- Auth: `requireSession()` on send-voice and attachment routes.
- Tests: prefer pure helpers in `lib/*.ts` with colocated `*.test.ts`; run `npm test`.
- Sender display name stays `"EyeWatch LIVE"` (existing Notify convention).
- Voice message `body` placeholder is exactly `"Voice message"`.

## File structure

| File | Responsibility |
|---|---|
| `prisma/schema.prisma` | `MessageType` enum; `Message.messageType` / `durationSeconds`; `MessageAttachment` model |
| `prisma/migrations/<ts>_notify_voice_messages/` | Migration SQL |
| `lib/voice-messages.ts` | Pure helpers: max duration, placeholder body, ingest eligibility, API shape |
| `lib/voice-messages.test.ts` | Unit tests for those helpers |
| `lib/audio-normalize.ts` | Detect AAC-in-MP4; spawn ffmpeg-static to produce `.m4a` |
| `lib/audio-normalize.test.ts` | Unit tests for detection + duration validation wrapper |
| `lib/commstack.ts` | Map `file`/`duration`; `downloadCommStackAttachment`; send voice helpers; longer timeout for uploads |
| `lib/commstack-voice-ingest.ts` | Shared inbound voice persist (message + optional attachment download) |
| `lib/commstack-sync.ts` | Ingest text **or** voice; retry missing attachments |
| `lib/commstack-realtime.ts` | Ingest text **or** voice on socket events |
| `app/api/messages/send-voice/route.ts` | Multipart Notify voice send |
| `app/api/messages/[id]/attachment/route.ts` | Authenticated audio stream |
| `app/api/conversations/[id]/route.ts` | Include attachment metadata (no bytes) |
| `app/api/conversations/[id]/messages/route.ts` | Same serialization for pagination |
| `hooks/useConversationDetail.ts` | Client message fields for voice |
| `components/caretext/MessageBubble.tsx` | Audio player / unavailable state |
| `components/caretext/MessageComposer.tsx` | Mic + record/preview/send (Notify) |
| `components/caretext/ConversationComposerArea.tsx` | Pass `enableVoice` for Notify |
| `components/caretext/DashboardClient.tsx` | `onSendVoice` wiring + optimistic bubble |
| `components/caretext/EmbedInboxClient.tsx` | Same if it mirrors dashboard send |
| `package.json` | Add `ffmpeg-static` dependency |

---

### Task 1: Schema — message type + attachment

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_notify_voice_messages/migration.sql` (via `prisma migrate dev`)

**Interfaces:**
- Consumes: nothing.
- Produces: Prisma enums/models:
  - `enum MessageType { text voice }` (add `photo` / `pdf` only if you want forward-compatible enum values now — prefer adding `photo` and `pdf` unused members so hooks exist without a second migration)
  - `Message.messageType MessageType @default(text)`
  - `Message.durationSeconds Int?`
  - `Message.attachment MessageAttachment?`
  - `model MessageAttachment` with 1:1 `messageId`, `bytes Bytes`, `contentType`, `filename`, `sizeBytes`, `commStackFile String?`, timestamps

- [ ] **Step 1: Update `prisma/schema.prisma`**

Add enum near other message enums:

```prisma
enum MessageType {
  text
  voice
  photo
  pdf
}
```

On `model Message`, after `body`, add:

```prisma
  messageType           MessageType      @default(text)
  durationSeconds       Int?
```

And relation:

```prisma
  attachment            MessageAttachment?
```

Add model:

```prisma
model MessageAttachment {
  id            String   @id @default(uuid())
  messageId     String   @unique
  bytes         Bytes
  contentType   String
  filename      String
  sizeBytes     Int
  commStackFile String?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  message       Message  @relation(fields: [messageId], references: [id], onDelete: Cascade)

  @@index([messageId])
}
```

- [ ] **Step 2: Migrate**

Run:

```bash
npx prisma migrate dev --name notify_voice_messages
```

Expected: migration applied; client regenerated.

- [ ] **Step 3: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat: add MessageType and MessageAttachment for Notify voice"
```

---

### Task 2: Voice message helpers (TDD)

**Files:**
- Create: `lib/voice-messages.ts`
- Create: `lib/voice-messages.test.ts`

**Interfaces:**
- Consumes: nothing (pure).
- Produces:
  - `VOICE_MESSAGE_BODY = "Voice message"`
  - `VOICE_MAX_DURATION_SECONDS = 120`
  - `VOICE_CONTENT_TYPE = "audio/mp4"`
  - `VOICE_FILENAME = "note.m4a"`
  - `isIngestibleCommStackMessage(item: { type?: string | null; text?: string | null; file?: string | null }): boolean`
  - `isVoiceCommStackMessage(item: { type?: string | null; file?: string | null }): boolean`
  - `assertValidVoiceDuration(seconds: number): void` throws `Error` with message `"Voice messages must be between 1 and 120 seconds."` if not integer in `1..120`
  - `toClientMessageAttachment(attachment: { id: string; contentType: string; filename: string; sizeBytes: number } | null | undefined): { hasAttachment: boolean; contentType?: string; filename?: string; sizeBytes?: number }`

- [ ] **Step 1: Write failing tests**

Create `lib/voice-messages.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  VOICE_MAX_DURATION_SECONDS,
  VOICE_MESSAGE_BODY,
  assertValidVoiceDuration,
  isIngestibleCommStackMessage,
  isVoiceCommStackMessage,
  toClientMessageAttachment,
} from "@/lib/voice-messages";

describe("voice-messages helpers", () => {
  it("uses stable voice body placeholder and 120s max", () => {
    expect(VOICE_MESSAGE_BODY).toBe("Voice message");
    expect(VOICE_MAX_DURATION_SECONDS).toBe(120);
  });

  it("ingests text with body and voice with file even when text empty", () => {
    expect(isIngestibleCommStackMessage({ type: "text", text: "hi", file: "" })).toBe(true);
    expect(isIngestibleCommStackMessage({ type: "voice", text: "", file: "a.m4a" })).toBe(true);
    expect(isIngestibleCommStackMessage({ type: "text", text: "  ", file: "" })).toBe(false);
    expect(isIngestibleCommStackMessage({ type: "voice", text: "", file: "" })).toBe(false);
  });

  it("detects voice type", () => {
    expect(isVoiceCommStackMessage({ type: "voice", file: "a.m4a" })).toBe(true);
    expect(isVoiceCommStackMessage({ type: "text", file: "" })).toBe(false);
  });

  it("validates duration", () => {
    expect(() => assertValidVoiceDuration(1)).not.toThrow();
    expect(() => assertValidVoiceDuration(120)).not.toThrow();
    expect(() => assertValidVoiceDuration(0)).toThrow(/1 and 120/);
    expect(() => assertValidVoiceDuration(121)).toThrow(/1 and 120/);
    expect(() => assertValidVoiceDuration(1.5)).toThrow(/1 and 120/);
  });

  it("maps attachment metadata without bytes", () => {
    expect(toClientMessageAttachment(null)).toEqual({ hasAttachment: false });
    expect(
      toClientMessageAttachment({
        id: "1",
        contentType: "audio/mp4",
        filename: "note.m4a",
        sizeBytes: 12,
      }),
    ).toEqual({
      hasAttachment: true,
      contentType: "audio/mp4",
      filename: "note.m4a",
      sizeBytes: 12,
    });
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
npm test -- lib/voice-messages.test.ts
```

Expected: FAIL (module missing).

- [ ] **Step 3: Implement `lib/voice-messages.ts`**

```ts
export const VOICE_MESSAGE_BODY = "Voice message";
export const VOICE_MAX_DURATION_SECONDS = 120;
export const VOICE_CONTENT_TYPE = "audio/mp4";
export const VOICE_FILENAME = "note.m4a";

export function isVoiceCommStackMessage(item: {
  type?: string | null;
  file?: string | null;
}): boolean {
  return item.type === "voice" && Boolean(item.file?.trim());
}

export function isIngestibleCommStackMessage(item: {
  type?: string | null;
  text?: string | null;
  file?: string | null;
}): boolean {
  if (isVoiceCommStackMessage(item)) return true;
  return Boolean(item.text?.trim());
}

export function assertValidVoiceDuration(seconds: number): void {
  if (!Number.isInteger(seconds) || seconds < 1 || seconds > VOICE_MAX_DURATION_SECONDS) {
    throw new Error(
      `Voice messages must be between 1 and ${VOICE_MAX_DURATION_SECONDS} seconds.`,
    );
  }
}

export function toClientMessageAttachment(
  attachment:
    | {
        id: string;
        contentType: string;
        filename: string;
        sizeBytes: number;
      }
    | null
    | undefined,
): {
  hasAttachment: boolean;
  contentType?: string;
  filename?: string;
  sizeBytes?: number;
} {
  if (!attachment) return { hasAttachment: false };
  return {
    hasAttachment: true,
    contentType: attachment.contentType,
    filename: attachment.filename,
    sizeBytes: attachment.sizeBytes,
  };
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
npm test -- lib/voice-messages.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add lib/voice-messages.ts lib/voice-messages.test.ts
git commit -m "feat: add Notify voice message helpers"
```

---

### Task 3: Audio normalize helper (TDD)

**Files:**
- Create: `lib/audio-normalize.ts`
- Create: `lib/audio-normalize.test.ts`
- Modify: `package.json` (add `ffmpeg-static`)

**Interfaces:**
- Consumes: Node `child_process`, `ffmpeg-static` binary path, `fs/promises`, `os`, `path`.
- Produces:
  - `looksLikeMp4Container(bytes: Buffer): boolean` — true when bytes contain `ftyp` brand marker at offset 4
  - `normalizeToM4a(input: { data: Buffer; contentType?: string | null; filename?: string | null }): Promise<{ data: Buffer; contentType: string; filename: string }>` — passthrough when already MP4 container; otherwise ffmpeg to AAC M4A; returns `VOICE_CONTENT_TYPE` / `VOICE_FILENAME`

- [ ] **Step 1: Install dependency**

```bash
npm install ffmpeg-static
```

- [ ] **Step 2: Write failing tests for detection**

```ts
import { describe, expect, it } from "vitest";
import { looksLikeMp4Container } from "@/lib/audio-normalize";

describe("looksLikeMp4Container", () => {
  it("detects ftyp at offset 4", () => {
    const buf = Buffer.alloc(12);
    buf.write("ftyp", 4, "ascii");
    expect(looksLikeMp4Container(buf)).toBe(true);
  });

  it("rejects non-mp4", () => {
    expect(looksLikeMp4Container(Buffer.from("ID3"))).toBe(false);
    expect(looksLikeMp4Container(Buffer.alloc(3))).toBe(false);
  });
});
```

- [ ] **Step 3: Implement detection + normalize**

Implement `lib/audio-normalize.ts`:

- `looksLikeMp4Container`: `bytes.length >= 8 && bytes.toString("ascii", 4, 8) === "ftyp"`
- `normalizeToM4a`:
  - if `looksLikeMp4Container(data)` → return `{ data, contentType: VOICE_CONTENT_TYPE, filename: VOICE_FILENAME }`
  - else write temp input file, run:

```bash
ffmpeg -y -i <input> -c:a aac -b:a 64k -vn <output.m4a>
```

  using `ffmpeg-static` path via `spawn`/`execFile`, read output buffer, delete temps, return normalized result
  - on ffmpeg failure throw `Error("Failed to convert audio to M4A.")`

Keep the ffmpeg invocation in a small internal function so unit tests can cover detection without requiring a real encode in CI. Optionally add an integration-style test only if a tiny fixture WebM is checked in; not required for this task.

- [ ] **Step 4: Run tests**

```bash
npm test -- lib/audio-normalize.test.ts
```

Expected: PASS for detection tests.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json lib/audio-normalize.ts lib/audio-normalize.test.ts
git commit -m "feat: normalize browser recordings to M4A for Notify"
```

---

### Task 4: CommStack wrappers — history fields, download, voice send

**Files:**
- Modify: `lib/commstack.ts`

**Interfaces:**
- Consumes: SDK `messages.sendDirect` / `sendToChannel` / `download`; `normalizeToM4a` not required here (route normalizes first).
- Produces updates:
  - Extend internal `CommStackMessage` with `file: string` and `duration: number`
  - Map those fields in `fetchCommStackDirectHistory` / `fetchCommStackChannelHistory`
  - `downloadCommStackAttachment(config, file: string): Promise<Buffer>`
  - `sendCommStackDirectVoice(config, input: { receiverUserId: string; data: Buffer; filename: string; contentType: string; duration: number; senderName?: string | null }): Promise<{ messageId: string }>`
  - `sendCommStackChannelVoice(config, input: { channelId: string; data: Buffer; filename: string; contentType: string; duration: number; senderName?: string | null }): Promise<{ messageId: string }>`
  - Voice sends use a longer timeout: construct/reuse client with `timeout: Math.max(Number(process.env.COMM_STACK_TIMEOUT_MS ?? 15000), 60000)` for upload calls (add `getScopedCommStackClient(config, { timeoutMs?: number })` overload or a dedicated helper)

SDK call shape for voice:

```ts
await comms.messages.sendDirect({
  receiver: input.receiverUserId.trim(),
  sender: config.portalUserId,
  senderName: input.senderName ?? "EyeWatch LIVE",
  type: "voice",
  duration: input.duration,
  file: {
    data: input.data,
    filename: input.filename,
    contentType: input.contentType,
  },
});
```

Same for `sendToChannel` with `channelId`.

`downloadCommStackAttachment`:

```ts
const comms = await getScopedCommStackClient(config);
return comms.messages.download(file);
```

- [ ] **Step 1: Extend `CommStackMessage` and history mappers** to include `file: String(item.file ?? "")` and `duration: Number(item.duration ?? 0)`.

- [ ] **Step 2: Add download + voice send functions** as specified; keep existing text send functions unchanged.

- [ ] **Step 3: Smoke-check TypeScript**

```bash
npx tsc --noEmit
```

Expected: no errors from these changes (project may already have unrelated strictness — fix only errors you introduce).

- [ ] **Step 4: Commit**

```bash
git add lib/commstack.ts
git commit -m "feat: CommStack voice send and attachment download wrappers"
```

---

### Task 5: Shared inbound voice ingest + sync/realtime

**Files:**
- Create: `lib/commstack-voice-ingest.ts`
- Modify: `lib/commstack-sync.ts`
- Modify: `lib/commstack-realtime.ts`

**Interfaces:**
- Consumes: `downloadCommStackAttachment`, `isIngestibleCommStackMessage`, `isVoiceCommStackMessage`, `VOICE_MESSAGE_BODY`, Prisma, `MessageType`.
- Produces:
  - `persistInboundCommStackMessage(args: { conversationId: string; config: ContactCommStackConfig; item: { messageId: string; type: string; text: string; file: string; duration: number; sender: string; createdAt?: string | Date | null } }): Promise<"created" | "exists" | "skipped">`
    - If not ingestible → `"skipped"`
    - If `commStackMessageId` exists:
      - if voice and attachment missing and `file` present → try download + create attachment → `"exists"`
      - else `"exists"`
    - Else create inbound message:
      - voice: `messageType: voice`, `durationSeconds: item.duration || null`, `body: item.text?.trim() || VOICE_MESSAGE_BODY`, then try download; on success create `MessageAttachment` with `commStackFile: item.file`, `contentType: VOICE_CONTENT_TYPE`, `filename` from file or `VOICE_FILENAME`
      - text: existing behavior (`messageType: text`, `body: item.text`)
    - Return `"created"`

**Sync changes (`lib/commstack-sync.ts`):**
- Replace `if (!item.messageId || !item.text?.trim()) continue;` with ingestible check using mapped `file`/`duration`/`type`.
- For outbound echoes: match orphans by `commStackMessageId: null` and for voice prefer matching recent outbound `messageType: voice` without requiring body text equality alone (body will be `"Voice message"`); keep text body match for text.
- Call `persistInboundCommStackMessage` for inbound rows (or inline equivalent that also handles attachment retry for existing ids).

**Realtime changes (`lib/commstack-realtime.ts`):**
- In `ingestRealtimeDirectMessage` / `ingestRealtimeChannelMessage`, gate on `messageId` + `sender` (+ `channelId` for channel), and ingestibility via `{ type: message.type, text: message.text, file: message.file }` — **remove** the hard `!text` requirement.
- Pass `type`, `file`, `duration` into inbound create path.
- `attachOutboundEcho`: for voice outbound, also try match where `messageType === voice` and `body === VOICE_MESSAGE_BODY` and `commStackMessageId` null (in addition to text match for text messages).
- `ingestInboundForContact` must create voice fields + download attachment via shared helper (avoid duplicating download logic).

- [ ] **Step 1: Implement `lib/commstack-voice-ingest.ts`** with `persistInboundCommStackMessage` as specified.

- [ ] **Step 2: Wire sync + realtime** to use ingestible checks and the shared helper.

- [ ] **Step 3: Add pure unit coverage** for any extracted decision helpers if not already in Task 2; no Prisma mocks required.

- [ ] **Step 4: Commit**

```bash
git add lib/commstack-voice-ingest.ts lib/commstack-sync.ts lib/commstack-realtime.ts
git commit -m "feat: ingest Notify voice messages in sync and realtime"
```

---

### Task 6: `POST /api/messages/send-voice`

**Files:**
- Create: `app/api/messages/send-voice/route.ts`

**Interfaces:**
- Consumes: `requireSession`, Prisma, contact identity helpers, CommStack voice send wrappers, `normalizeToM4a`, `assertValidVoiceDuration`, `VOICE_*` constants, `ensureCommStackRealtimeForConfig` / `startCommStackRealtime`.
- Produces: JSON `{ message, conversationId }` on success (message includes `messageType`, `durationSeconds`, attachment metadata via same shape as conversation API — not raw bytes).

**Request:** `multipart/form-data` fields:
- `conversationId` (required uuid)
- `duration` (required integer seconds)
- `audio` (required file blob)

**Flow:**
1. `requireSession()`
2. Parse form; read `audio` as `Buffer`; parse `duration` with `Number` + `assertValidVoiceDuration`
3. Load conversation + contact; 404 if missing; 400 if not Notify (`!notifyClientId && !notifyChannelId`)
4. `normalizeToM4a({ data, contentType: file.type, filename: file.name })`
5. Create queued `Message` with `messageType: voice`, `durationSeconds`, `body: VOICE_MESSAGE_BODY`, `userId`, outbound
6. Create `MessageAttachment` with normalized bytes
7. Send via `sendCommStackChannelVoice` or `sendCommStackDirectVoice`
8. Update `commStackMessageId`, `status: sent`; set attachment `commStackFile` if SDK/history later provides it (ack may not — leave null until sync)
9. On failure: `status: failed` + `errorMessage`; return 502/503 like text Notify send

Keep timeouts/errors consistent with `app/api/messages/send/route.ts` Notify branch.

- [ ] **Step 1: Implement the route** following the flow above.

- [ ] **Step 2: Manual sanity** (optional in agent run): ensure the route file typechecks and imports resolve.

- [ ] **Step 3: Commit**

```bash
git add app/api/messages/send-voice/route.ts
git commit -m "feat: add Notify voice send API"
```

---

### Task 7: Attachment playback API + conversation serialization

**Files:**
- Create: `app/api/messages/[id]/attachment/route.ts`
- Modify: `app/api/conversations/[id]/route.ts`
- Modify: `app/api/conversations/[id]/messages/route.ts`
- Modify: `hooks/useConversationDetail.ts`

**Interfaces:**
- `GET /api/messages/[id]/attachment`
  - `requireSession()`
  - Load message by id with `attachment` + `conversationId`
  - 404 if no message or no attachment
  - Return `new NextResponse(Buffer.from(attachment.bytes), { headers: { "Content-Type": attachment.contentType, "Content-Length": String(attachment.sizeBytes), "Cache-Control": "private, max-age=3600" } })`
- Conversation message queries: `include: { attachment: { select: { id: true, contentType: true, filename: true, sizeBytes: true } } }` then map each message through a small serializer:

```ts
{
  ...message,
  attachment: undefined, // strip nested
  hasAttachment: Boolean(message.attachment),
  contentType: message.attachment?.contentType,
  // keep messageType, durationSeconds from prisma scalars
}
```

Prefer a shared `serializeMessageForClient(message)` in `lib/voice-messages.ts` (extend Task 2 exports) used by both routes.

- [ ] **Step 1: Add `serializeMessageForClient` to `lib/voice-messages.ts` + tests** for stripping bytes-bearing relations and setting `hasAttachment`.

- [ ] **Step 2: Implement attachment GET route.**

- [ ] **Step 3: Update conversation detail + messages list routes** to include attachment metadata and serialize.

- [ ] **Step 4: Extend `ConversationMessage` in `hooks/useConversationDetail.ts`:**

```ts
type ConversationMessage = {
  id: string;
  body: string;
  direction: "inbound" | "outbound";
  status: string;
  createdAt: string;
  authorPhone?: string | null;
  isSystemNote?: boolean;
  messageType?: "text" | "voice" | "photo" | "pdf";
  durationSeconds?: number | null;
  hasAttachment?: boolean;
};
```

- [ ] **Step 5: Commit**

```bash
git add lib/voice-messages.ts lib/voice-messages.test.ts app/api/messages/[id]/attachment/route.ts app/api/conversations/[id]/route.ts app/api/conversations/[id]/messages/route.ts hooks/useConversationDetail.ts
git commit -m "feat: stream voice attachments and expose voice fields to clients"
```

---

### Task 8: Message bubble audio player

**Files:**
- Modify: `components/caretext/MessageBubble.tsx`
- Modify: `components/caretext/MessageThread.tsx` (pass new props)

**Interfaces:**
- Extend `MessageBubbleProps` with optional:
  - `messageType?: "text" | "voice" | "photo" | "pdf"`
  - `durationSeconds?: number | null`
  - `hasAttachment?: boolean`
  - `messageId?: string`
- When `messageType === "voice"`:
  - if `hasAttachment` and `messageId`: render `<audio controls preload="metadata" src={`/api/messages/${messageId}/attachment`} />` plus duration label
  - else: render italic “Audio unavailable”
  - do not render the `"Voice message"` body as primary text (optional small caption ok — prefer player only)
- Text/system notes unchanged.

- [ ] **Step 1: Update `MessageBubble`** with voice rendering as specified (match existing indigo/white bubble chrome).

- [ ] **Step 2: Pass props from `MessageThread`** from each message object.

- [ ] **Step 3: Commit**

```bash
git add components/caretext/MessageBubble.tsx components/caretext/MessageThread.tsx
git commit -m "feat: render Notify voice notes in message bubbles"
```

---

### Task 9: Composer mic + dashboard/embed send wiring

**Files:**
- Modify: `components/caretext/MessageComposer.tsx`
- Modify: `components/caretext/ConversationComposerArea.tsx`
- Modify: `components/caretext/DashboardClient.tsx`
- Modify: `components/caretext/EmbedInboxClient.tsx` (only if it has its own send path for Notify)

**Interfaces:**
- `MessageComposer` new optional props:
  - `enableVoice?: boolean`
  - `onSendVoice?: (payload: { conversationId: string; blob: Blob; durationSeconds: number }) => Promise<void>`
- UX (layout A from spec):
  - Idle (Notify): textarea + mic button beside Send
  - Mic click → `getUserMedia({ audio: true })` → `MediaRecorder` → replace textarea with recording strip (elapsed timer, Stop); auto-stop at 120s
  - Stop → preview: play via object URL, Discard, Send voice
  - Send voice calls `onSendVoice`; Discard clears preview
  - Permission errors → inline error string
  - SMS (`enableVoice` false): current UI unchanged (no mic)
- `ConversationComposerArea`: pass `enableVoice={transport === "notify"}` and `onSendVoice`
- `DashboardClient`:
  - Implement `handleSendVoice`:
    - `FormData` with `conversationId`, `duration`, `audio` file
    - `POST /api/messages/send-voice`
    - Optimistic bubble: `messageType: "voice"`, `durationSeconds`, `hasAttachment: true`, `status: "sending"`, then reconcile from response
  - Wire into `ConversationComposerArea`

Recording tip: prefer `audio/mp4` or `audio/webm` mimeTypes supported by `MediaRecorder.isTypeSupported`; server normalizes.

- [ ] **Step 1: Implement composer voice UI states.**

- [ ] **Step 2: Wire ConversationComposerArea + DashboardClient (+ Embed if needed).**

- [ ] **Step 3: Manual checklist**
  - Notify DM: record ≤2:00, preview, send, appears outbound
  - Notify channel: same
  - Inbound voice from Notify app appears and plays
  - SMS thread: no mic

- [ ] **Step 4: Run full unit suite**

```bash
npm test
```

Expected: all existing + new tests pass.

- [ ] **Step 5: Commit**

```bash
git add components/caretext/MessageComposer.tsx components/caretext/ConversationComposerArea.tsx components/caretext/DashboardClient.tsx components/caretext/EmbedInboxClient.tsx
git commit -m "feat: let agents record and send Notify voice notes"
```

---

## Spec coverage checklist

| Spec requirement | Task |
|---|---|
| Notify-only transport | 6, 9 |
| Postgres `MessageAttachment` | 1 |
| `messageType` / `durationSeconds` | 1 |
| Photo/PDF schema hooks | 1 (`photo`/`pdf` enum values) |
| Ingest voice with empty text | 2, 5 |
| Download + local store inbound | 4, 5 |
| Inbound download failure → no attachment | 5 |
| Retry attachment on later sync | 5 |
| Outbound normalize to M4A | 3, 6 |
| CommStack `type: voice` + `duration` + file | 4, 6 |
| Max 120s | 2, 6, 9 |
| Preview before send (layout A) | 9 |
| Direct + channel | 4, 5, 6, 9 |
| Authenticated playback route | 7 |
| Bubble player / unavailable | 8 |
| Longer upload timeout | 4 |
| Non-goals (SMS media, photo UI, S3, autoplay UI) | omitted intentionally |

## Plan self-review notes

- No TBD placeholders remain; ffmpeg packaging is concrete (`ffmpeg-static`).
- Client list payloads never include `Bytes` (Task 7 serializer).
- Outbound echo matching updated for voice placeholder body (Task 5).
