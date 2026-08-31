# Outbound Dialer & Shared Call Log — Design Spec

**Date:** 2026-08-31  
**Status:** Approved (brainstorming)  
**Approach:** Extend the current Twilio browser voice stack (Approach 1)

## Summary

Staff can place a browser call to any phone number from a **New Call** dialer modal, without opening a conversation first. A **Calls** page lists every inbound and outbound `CallLog` for the facility. If the number belongs to an active contact with an open direct thread, the call is attached to that thread **and** appears on Calls. If not, the call is logged on Calls only — no contact or conversation is created.

## Goals

- Dial an arbitrary number from any protected page via a header **New Call** modal (number field + keypad).
- Keep the existing thread Call button and per-conversation call history.
- Log unknown outbound and unknown inbound calls without creating a contact or SMS thread.
- Show a shared facility call history on `/calls` (who placed or answered, number, direction, outcome).
- After an unknown call ends, allow **Save contact** from the Calls page (not during the live call).
- Redial a number from a Calls row.

## Non-Goals (this pass)

- Embed inbox dialer or Calls UI.
- Save contact from the live Call bar.
- Backfilling `conversationId` on older logs after Save contact.
- Call recording, click-to-call to a personal phone, voicemail.
- Mine/All filters, search, or infinite scroll (newest-first page is enough).
- Changing how SMS inbound still creates contacts/threads.

## Stakeholder decisions

| Decision | Choice |
|---|---|
| Entry | New Call modal from the header **and** a Calls page (option C) |
| Known vs unknown outbound | Known + open thread → conversation **and** Calls; otherwise Calls only (option A) |
| Unknown inbound | Answerable; Calls only; no auto contact or thread (option B) |
| Save contact | Calls page after the call has ended (option C) |
| Whose history | Shared facility log — everyone’s calls (option A) |
| Architecture | Extend current voice stack (Approach 1) |

## Current behavior this changes

- `POST /api/calls/initiate` requires `conversationId` and a matching conversation phone.
- `VoiceCallProvider.startCall` and incoming accept require `conversationId`.
- `POST /api/webhooks/voice/incoming` calls `ensureOpenPhoneConversation`, which upserts a contact (and restores a soft-delete) and opens a thread for every PSTN caller.
- Call history UI exists only on a conversation (`CallLogsPanel` / thread items).
- `CallLog.conversationId` is already optional; unused for “no thread” calls.

## Architecture

Same Twilio Device path as today. A call no longer must belong to a conversation.

```
Staff                    Next.js                         Twilio              Far end
 |                          |                               |                    |
 |-- New Call / Redial ---->|                               |                    |
 |-- POST /api/calls/initiate { phone }                     |                    |
 |                          |-- lookup active contact       |                    |
 |                          |-- optional open direct thread |                    |
 |                          |-- CallLog (conversationId?)   |                    |
 |<-- callLogId, contactName?                               |                    |
 |-- device.connect(...) ---------------------------------->|                    |
 |                          |<-- voice/twiml / status ------|                    |
 |-- Call bar (mute/end)    |-- update CallLog ------------>|---- PSTN --------->|
```

Inbound unknown callers skip `ensureOpenPhoneConversation`. Staff still ring via existing client identities; Accept does not navigate to a conversation.

### Attachment rule

A call **attaches** to a conversation only when all of these are true:

1. An **active** contact exists for the normalized phone (`deletedAt` is null).
2. That contact has an **open direct** conversation (`archivedAt` null, `status` not `closed`, `contactId` set).
3. Soft-deleted contacts are treated as unknown. Inbound voice must **not** restore them or open a thread.

If any check fails, create a `CallLog` with `conversationId` null. Do **not** create a contact or conversation.

After **Save contact**, later calls to that number can attach once an open direct thread exists. This pass does not create that thread and does not rewrite old logs.

## Data model

No Prisma schema change. Use existing `CallLog`:

- `conversationId` nullable — unknown / no-open-thread calls leave it null.
- `phone` always stored normalized.
- `initiatedById` — outbound: the staff who dialed; inbound: set when someone answers (unchanged).
- `direction`, `mode`, `status`, duration, outcome — unchanged lifecycle.

## API

### `POST /api/calls/initiate`

Auth: `requireSession`.

Body:

- Thread Call (unchanged): `{ conversationId, phone }` — still 404 if that conversation is missing or the phone does not match.
- Dialer / redial: `{ phone }` — `conversationId` omitted.

Behavior for `{ phone }` only:

1. Normalize and validate the number (`initiateCallSchema`: `conversationId` optional).
2. Expire stale active calls; 409 if this user already has an active call.
3. Resolve attachment with the rule above.
4. Create `CallLog` (`outbound`, `browser`, `initiating`, `initiatedById` = session user).
5. Return `201` `{ callLogId, conversationId: string | null, contactName: string | null }`.

Never create a contact or conversation on this route.

### `GET /api/calls` (new)

Auth: `requireSession`. Shared facility list.

- Newest `startedAt` first.
- Single page: `limit=50` (max `100` if a query param is passed). No cursor or “Load more” in this pass.
- Include inbound and outbound, with and without `conversationId`.
- Each row: `id`, `phone`, `direction`, `status`, `outcome`, `durationSeconds`, `startedAt`, `endedAt`, `conversationId`, `initiatedBy` `{ id, name } | null`, `contact` `{ id, name } | null` when an **active** contact matches `phone`.
- Contact is resolved by current phone lookup, not only via `conversationId`, so a number saved after the call can show a name on later page loads. Still no backfill of `conversationId`.

### `GET /api/contacts`

Keep existing list. For the dialer’s live name preview, when the entered value is a valid phone, the client requests `GET /api/contacts?smsOnly=1&phone=<normalized>` (exact match on active contacts). Add the `phone` query if it does not exist; do not rely on fuzzy `q`.

### `POST /api/contacts`

Unchanged. Calls **Save contact** posts `{ name, phone }` using the log’s number. Duplicate / soft-delete restore follows existing contact-create rules. 4xx errors surface on the Calls row, not as a new API.

### Inbound voice webhook

`POST /api/webhooks/voice/incoming`:

- Known + open direct thread: keep today’s attach-to-thread behavior (`conversationId` set, `lastMessageAt` updated). Do **not** call `ensureOpenPhoneConversation` (that helper creates/restores contacts).
- Otherwise: create `CallLog` with `phone` only; ring staff; **do not** create or restore a contact; **do not** create or escalate a conversation.
- No staff online: mark the log `no_answer` / `no-staff` and hang up. Escalate the conversation **only** when `conversationId` is set (existing missed-inbound path).

`buildInboundClientDialTwiml`: `conversationId` optional. Omit the TwiML parameter when null.

`GET /api/calls/ringing` and incoming-invite parsing: `conversationId` optional. Resolve an incoming invite with `callLogId` + `phone`; do not drop the invite when `conversationId` is missing.

`POST /api/webhooks/voice/incoming-result`: keep missed-inbound escalation gated on `conversationId` (already true).

Outbound TwiML and status webhooks stay as they are; they key off `callLogId`.

## UI

### Header (`TopNav`)

- **New Call** button for all signed-in staff on protected pages. Opens the dialer modal.
- **Calls** nav link to `/calls` (with Dashboard, Contacts, …).

Embed layout is unchanged (no New Call, no Calls).

### Dialer modal

- Number field (type or paste) and 12-key pad (`1–9`, `*`, `0`, `#`), backspace, **Call**.
- **Call** enabled only when `isValidPhoneNumber` passes and no call is already active.
- When the number is valid, exact contact lookup; if found, show the contact name (staff know it will attach if a thread is open).
- On Call: `startCall({ phone, conversationId?, contactName? })` using initiate’s response. Close the modal. Existing Call bar (mute / end / timer) takes over.
- Unknown numbers: Call bar title is the formatted phone.
- Errors: invalid number (client), 409 active call, voice-token / Twilio failure — same messaging as thread Call.

A small client context (next to `VoiceCallProvider` in `VoiceShell`) exposes `openDialer()` so `TopNav` can open the modal from any protected page.

### Calls page (`/calls`)

- Shared list: direction, formatted number, contact name if known, staff who placed or answered (or “Missed” when inbound and `initiatedBy` is null), time, duration, status/outcome.
- Known contact with `conversationId`: name links to `/dashboard?conversationId=…`.
- Known contact without `conversationId`: name links to `/contacts`.
- Unknown, and the call is **not** active: **Save contact** (name + number). Not shown on the live Call bar.
- **Redial** on a row: same initiate path as the modal (`{ phone }`). Disabled while a call is active.
- Empty state: “No calls yet.”

### Unchanged

- Thread Call button (`ConversationHeader` / embed header).
- Per-conversation `CallLogsPanel` and call items in the message thread (only logs that have that `conversationId`).
- Global incoming bar and Call bar chrome; they must render without a conversation.

### Incoming / post-accept navigation

`VoiceShell` / `IncomingCallBar` `onAccepted`: navigate to the dashboard conversation **only** when `conversationId` is present. Unknown inbound stays on the current page with the Call bar visible.

## Client voice types

`ActiveCallInfo` / `startCall` / incoming resolve:

- `conversationId` optional (`string | null`).
- Incoming accept still claims the log via `POST /api/calls/[id]/answer`.
- `startCall` may be called with only `phone`; it posts `{ phone }` and then `device.connect` as today.

## Error handling

| Case | Behavior |
|---|---|
| Invalid phone | Client disables Call; API 400 if it still arrives |
| User already on a call | 409; modal / redial / thread Call show the existing message |
| Voice token or Twilio connect failure | Call bar error; log canceled/failed as today |
| Save contact duplicate | Existing contacts error on the Calls row |
| Inbound, no staff online | Hang up; log `no-staff`; escalate thread only if attached |
| Incoming invite missing `callLogId` or `phone` | Ignore (do not show a bar) |

## Testing

- Initiate `{ phone }`: active contact + open direct thread → `conversationId` set; otherwise null. No contact/conversation insert.
- Initiate still 404s for a bad thread `conversationId` / phone mismatch; still 409s on a second active call.
- Inbound webhook: known + open thread still attaches; unknown does not create a contact or conversation.
- Soft-deleted contact inbound/outbound: treated as unknown (no restore, no attach).
- Incoming invite parse / ringing fallback: works with null `conversationId`.
- `GET /api/calls` returns inbound and outbound, including conversation-less rows, with staff and optional contact name.
- Save contact: `POST /api/contacts` success; duplicate number fails as Contacts does today.
- Dialer helpers: normalize/format as-you-type; exact name match only when the number is valid.

Manual: New Call from header, known and unknown outbound, redial, unknown inbound answer without leaving the page, Save contact after hangup, thread Call still attaches.

## File touch list (expected)

- `lib/validators.ts` — optional `conversationId` on initiate; contacts `phone` query if added.
- `app/api/calls/initiate/route.ts` — phone-only path + attachment helper.
- `app/api/calls/route.ts` — new list.
- `app/api/webhooks/voice/incoming/route.ts` — stop auto-creating contacts/threads.
- `lib/voice/twiml.ts` (+ tests) — optional `conversationId`.
- `lib/voice/incoming-invite.ts` (+ tests) — optional `conversationId`.
- `components/caretext/VoiceCallProvider.tsx` — optional conversation on start/accept.
- `components/caretext/VoiceShell.tsx` / `IncomingCallBar.tsx` — navigate only when a thread exists.
- `components/caretext/TopNav.tsx` — New Call + Calls.
- New: dialer modal, dialer open context, `/calls` page + list client.
- Tests next to the modules above.

## Open questions

None. Attachment, inbound unknown, Save contact timing, and shared log were decided in brainstorming.
