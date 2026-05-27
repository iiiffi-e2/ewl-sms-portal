# Twilio Browser Voice — Design Spec

**Date:** 2026-05-26  
**Status:** Approved (brainstorming)  
**Approach:** Layered voice module + React context (Approach 2)

## Summary

Replace the current `tel:` link Call button in the SMS thread header with in-browser calling via the Twilio Voice SDK. Nurses talk through their browser microphone/speakers. Calls are logged to the existing `CallLog` model with full Twilio lifecycle tracking. The architecture is designed to support click-to-call (nurse's phone), inbound voice, and call recording in future iterations without rework.

## Goals

- Enable outbound browser-based calling from an active SMS conversation thread
- Log call activity (who, when, duration, outcome) tied to the conversation
- Provide standard in-call controls: mute, end call, connection status, elapsed timer
- Design extensibility for future click-to-call, inbound voice, and recording

## Non-Goals (v1)

- Click-to-call to nurse's personal/work phone
- Inbound voice calls ringing in the browser
- Call recording and playback
- Call history UI panel in the thread
- User profile UI for phone number (schema field added, UI deferred)

## Background

### Current behavior

The Call button in `components/caretext/ConversationHeader.tsx` is a native `tel:` link. On click it fire-and-forgets `POST /api/calls/log` and opens the OS dialer. Twilio is integrated for SMS only (`lib/twilio.ts`, send/webhook routes). The `CallLog` Prisma model exists with `twilioSid`, `endedAt`, and `outcome` fields that are never populated. No UI reads call logs.

### Stakeholder decisions

| Decision | Choice |
|---|---|
| Call mode (v1) | Browser softphone via Twilio Voice SDK |
| Future modes | Click-to-call to nurse's phone; inbound to browser |
| History (v1) | Activity log only; recording-ready architecture |
| In-call UI | Standard call bar (mute, end, status, timer) |
| Call direction (v1) | Outbound only from thread; inbound-ready design |

## Architecture

### High-level flow

```
Nurse Browser                    Next.js API                     Twilio                    Contact
     |                                |                              |                          |
     |-- GET /api/voice/token ------->|                              |                          |
     |<-- Access Token (identity=user.id)                           |                          |
     |-- Initialize Twilio Device     |                              |                          |
     |-- POST /api/calls/initiate --->|                              |                          |
     |                                |-- Create CallLog (initiating)|                          |
     |-- device.connect({To, callLogId}) ------------------------->|                          |
     |                                |<-- POST /webhooks/voice/twiml|                          |
     |                                |-- TwiML: Dial contact ------>|                          |
     |                                |                              |--- outbound call ------->|
     |                                |<-- POST /webhooks/voice/status                          |
     |                                |-- Update CallLog             |                          |
     |-- CallBar: mute / end / timer  |                              |                          |
```

### New backend routes

| Route | Auth | Purpose |
|---|---|---|
| `GET /api/voice/token` | Session required | Generate short-lived Twilio Access Token with Voice grant |
| `POST /api/calls/initiate` | Session required | Create `CallLog`, return `callLogId` for Device.connect params |
| `PATCH /api/calls/[id]` | Session required | Client-side cleanup when connect fails before Twilio answers |
| `POST /api/webhooks/voice/twiml` | Twilio signature | Return TwiML to dial the contact number |
| `POST /api/webhooks/voice/status` | Twilio signature | Update `CallLog` on call state changes |

### Deprecated route

- `POST /api/calls/log` — replaced by `/api/calls/initiate`. Remove usage from `ConversationHeader`; keep route temporarily or remove if unused.

### New library modules

```
lib/voice/
  token.ts       — Access Token generation (API Key + VoiceGrant + TwiML App SID)
  twiml.ts       — TwiML response builders (outbound Dial; inbound stub for future)
  webhook.ts     — X-Twilio-Signature validation helper
```

Extends existing `lib/twilio.ts` pattern (singleton client, env var helpers).

### New frontend modules

```
components/caretext/
  VoiceCallProvider.tsx  — Device lifecycle, token refresh, call state machine
  CallBar.tsx            — Active call UI (status, timer, mute, end)
```

Modify:
- `ConversationHeader.tsx` — Call button triggers provider instead of `tel:` link
- `DashboardClient.tsx` — Wrap with `VoiceCallProvider`, render `CallBar`

### Twilio console setup (one-time, manual)

1. Create an API Key + Secret (separate from Auth Token — best practice for Access Tokens)
2. Create a TwiML App with Voice Request URL → `{NEXTAUTH_URL}/api/webhooks/voice/twiml`
3. Configure status callback URL on the TwiML `<Dial>` verb → `{NEXTAUTH_URL}/api/webhooks/voice/status`
4. Add new env vars (see Environment section)

### Extensibility hooks (designed in, not built in v1)

| Hook | Purpose |
|---|---|
| `User.phoneNumber` (optional field) | Nurse's phone for future click-to-call |
| `CallLog.mode` enum (`browser` / `phone`) | Distinguish call initiation strategy |
| `CallLog.direction` enum (`outbound` / `inbound`) | Support future inbound calls |
| `CallLog.recordingSid` / `recordingUrl` | Populated by recording webhook later |
| `POST /api/webhooks/voice/incoming` (stub) | Future inbound TwiML handler |
| `CallInitiationMode` abstraction in provider | Switch between browser and phone strategies |

## Data Model

### Prisma schema changes

New enums:

```prisma
enum CallDirection {
  outbound
  inbound
}

enum CallMode {
  browser
  phone
}

enum CallStatus {
  initiating
  ringing
  in_progress
  completed
  failed
  no_answer
  busy
  canceled
}
```

`User` model addition:

```prisma
phoneNumber  String?   // optional, for future click-to-call
```

`CallLog` model additions:

```prisma
direction       CallDirection  @default(outbound)
mode            CallMode       @default(browser)
status          CallStatus     @default(initiating)
durationSeconds Int?
recordingSid    String?
recordingUrl    String?
```

Existing fields retained: `id`, `conversationId`, `phone`, `initiatedById`, `twilioSid`, `startedAt`, `endedAt`, `outcome`.

### CallLog lifecycle

| Stage | Writer | Fields updated |
|---|---|---|
| Nurse clicks Call | `POST /api/calls/initiate` | `conversationId`, `phone`, `initiatedById`, `direction=outbound`, `mode=browser`, `status=initiating`, `startedAt` |
| Twilio connects | Status webhook | `twilioSid`, `status` → `ringing` / `in_progress` |
| Call ends | Status webhook | `status` → terminal value, `endedAt`, `durationSeconds`, `outcome` (raw Twilio CallStatus) |

### API data changes

- `POST /api/calls/initiate` body: `{ conversationId: string, phone: string }` → returns `{ callLogId: string }`
- `GET /api/conversations/[id]` — add `callLogs` include ordered by `startedAt desc` (data available for future UI; no v1 panel)

## Frontend Design

### VoiceCallProvider

Responsibilities:
- Fetch Access Token on mount via `GET /api/voice/token`
- Refresh token ~5 minutes before expiry
- Initialize and manage Twilio `Device` singleton
- Call state machine: `idle | connecting | ringing | connected | disconnecting | error`
- Exposed API:
  - `startCall(conversationId: string, phone: string): Promise<void>`
  - `endCall(): void`
  - `toggleMute(): void`
  - `isMuted: boolean`
  - `elapsedSeconds: number`
  - `connectionStatus: string`
  - `activeCall: { conversationId, phone, contactName? } | null`
  - `isCallActive: boolean`

`startCall` flow:
1. Call `POST /api/calls/initiate` → get `callLogId`
2. Call `device.connect({ params: { To: phone, callLogId, conversationId } })`
3. Update local state on Device events (`connect`, `disconnect`, `error`, `ringing`)

### ConversationHeader changes

- Replace `<a href="tel:...">` with `<button>` calling `startCall`
- Disabled when `isCallActive` is true (one call at a time globally)
- Loading state while `connecting`

### CallBar component

Renders below `ConversationHeader` when a call is active. Fixed within the thread panel area.

Contents:
- Contact name / phone being called
- Status badge: Connecting → Ringing → Connected
- Elapsed timer (starts on `connected` event)
- Mute toggle button
- End Call button (prominent, red)

Behavior:
- Persists when nurse switches sidebar conversations (call is global to the session)
- Auto-dismisses on disconnect with brief status message for terminal states (no answer, failed)

### Package dependency

- `@twilio/voice-sdk` — official Twilio browser Voice SDK

## Error Handling

| Scenario | User-facing behavior | Backend behavior |
|---|---|---|
| Mic permission denied | Toast: "Microphone access required to place calls" | No CallLog created (initiate not reached) or mark failed |
| Token fetch fails | Toast; Call button disabled until retry | Log server error |
| Device initialization error | Toast with message; reset to idle | — |
| Contact doesn't answer | CallBar shows "No answer", auto-dismiss | Status webhook: `status=no_answer` |
| Call busy | CallBar shows "Line busy", auto-dismiss | Status webhook: `status=busy` |
| Twilio network error | Toast; reset to idle | Status webhook: `status=failed` if applicable |
| Nurse clicks End Call | Immediate disconnect UI | `device.disconnectAll()`; webhook finalizes |
| Tab close / navigate away | Twilio ends call | Webhook finalizes CallLog |
| Call already active | All Call buttons disabled | — |
| `device.connect()` fails before Twilio answers | Toast; reset to idle | Client calls `PATCH /api/calls/[id]` or initiate endpoint handles cleanup — set `status=canceled`, `endedAt=now()` |

## Security

- **Token endpoint:** `requireSession()` — only authenticated nurses/admins receive tokens. Identity = `session.user.id` (used as Twilio Client identity).
- **Initiate endpoint:** `requireSession()` — sets `initiatedById` from session.
- **TwiML webhook:** Validate `X-Twilio-Signature` via shared `validateTwilioWebhook()` in `lib/voice/webhook.ts`. Reject unsigned/invalid requests with 403.
- **TwiML authorization:** Validate that `callLogId` param references a `CallLog` in `initiating` status initiated by the Client identity making the request. Validate `To` matches the CallLog phone (normalized E.164).
- **Status webhook:** Validate Twilio signature. Idempotent updates (same status can arrive multiple times).
- **Middleware:** Voice webhooks excluded from NextAuth middleware (public, signature-validated). `/api/voice/token` and `/api/calls/initiate` remain protected.

## Environment Variables

Existing (unchanged):
```
TWILIO_ACCOUNT_SID
TWILIO_AUTH_TOKEN
TWILIO_PHONE_NUMBER
NEXTAUTH_URL
```

New:
```
TWILIO_API_KEY_SID       # API Key for Access Token generation
TWILIO_API_KEY_SECRET    # API Key Secret
TWILIO_TWIML_APP_SID     # TwiML App for Voice SDK outbound calls
```

Update `.env.example` and README Notes section.

## Testing

### Unit tests
- `lib/voice/token.ts` — token contains correct identity, grant, expiry
- `lib/voice/twiml.ts` — outbound Dial TwiML XML structure, callerId, statusCallback URL
- `lib/voice/webhook.ts` — signature validation accepts valid, rejects invalid

### Integration tests
- `POST /api/calls/initiate` — creates CallLog with correct fields, requires auth
- `POST /api/webhooks/voice/status` — updates CallLog on completed event

### Manual testing checklist
- [ ] Nurse logs in, opens thread, clicks Call — contact phone rings
- [ ] CallBar appears with Connecting → Ringing → Connected states
- [ ] Elapsed timer counts during connected call
- [ ] Mute toggle works (contact can't hear nurse)
- [ ] End Call disconnects both legs
- [ ] CallLog row has `twilioSid`, `endedAt`, `durationSeconds`, terminal `status`
- [ ] Second Call button disabled while call active
- [ ] Mic permission denial shows appropriate toast
- [ ] No answer scenario updates CallLog correctly

## File Change Summary

| File | Action |
|---|---|
| `prisma/schema.prisma` | Modify — enums, User.phoneNumber, CallLog fields |
| `prisma/migrations/...` | Create — migration for schema changes |
| `lib/voice/token.ts` | Create |
| `lib/voice/twiml.ts` | Create |
| `lib/voice/webhook.ts` | Create |
| `app/api/voice/token/route.ts` | Create |
| `app/api/calls/initiate/route.ts` | Create |
| `app/api/webhooks/voice/twiml/route.ts` | Create |
| `app/api/webhooks/voice/status/route.ts` | Create |
| `app/api/calls/log/route.ts` | Deprecate or remove |
| `app/api/conversations/[id]/route.ts` | Modify — include callLogs |
| `components/caretext/VoiceCallProvider.tsx` | Create |
| `components/caretext/CallBar.tsx` | Create |
| `components/caretext/ConversationHeader.tsx` | Modify — button instead of tel: link |
| `components/caretext/DashboardClient.tsx` | Modify — provider wrapper, CallBar render |
| `middleware.ts` | Modify — exclude voice webhooks from auth |
| `.env.example` | Modify — new env vars |
| `README.md` | Modify — update voice note, setup instructions |
| `package.json` | Modify — add `@twilio/voice-sdk` |

## Future Work (explicitly deferred)

1. **Click-to-call (mode `phone`):** Add `PhoneCallStrategy` using `twilio.calls.create()` to call nurse's `User.phoneNumber` first, then bridge to contact. UI toggle or per-user preference.
2. **Inbound voice:** TwiML App or phone number Voice URL for incoming → `<Dial><Client>identity</Client></Dial>`. Provider handles incoming Device event. Set `direction=inbound`.
3. **Call recording:** Enable recording on `<Dial>` verb, add `POST /api/webhooks/voice/recording` to populate `recordingSid`/`recordingUrl`. Playback UI in thread.
4. **Call history panel:** Render `callLogs` from conversation API in a collapsible section below messages.
5. **User phone profile:** Settings page to set `User.phoneNumber` for click-to-call.
