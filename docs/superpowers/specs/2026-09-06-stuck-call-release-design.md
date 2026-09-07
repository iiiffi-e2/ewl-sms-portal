# Stuck Call Release — Design Spec

**Date:** 2026-09-06  
**Status:** Approved (brainstorming)  
**Approach:** Hangup always closes `CallLog` + 10-minute stale sweeper (Approach 1)

## Summary

A hung-up call can leave a `CallLog` in `initiating`, `ringing`, or `in_progress`. The next outbound dial then 409s with “You already have an active call.” Hangup in the browser must write a terminal status immediately. A shorter stale sweeper covers crashed tabs and missed webhooks. Unclaimed inbound `ringing` rows expire after two minutes so they do not sit for days.

## Goals

- After the far end or staff hang up, that user can place a new call immediately.
- A connected call is recorded as `completed`, not `canceled`.
- Twilio status webhooks can still attach duration and the Twilio outcome when they arrive.
- Unclaimed inbound `ringing` rows do not linger as active.
- A leftover `in_progress` row older than **10 minutes** is treated as dead when someone tries to dial or the app polls inbound ringing.

## Non-Goals

- A manual “Release call” button.
- Looking up the Twilio Call SID on initiate.
- Schema or enum changes.
- Changing the 2-minute stale window for `initiating` / `ringing` setup states.
- Killing a live call that is still under 10 minutes old.

## Stakeholder decisions

| Decision | Choice |
|---|---|
| Primary fix | Browser hangup always PATCHes a terminal `CallLog` status |
| Connected hangup status | `completed` |
| Never-connected hangup status | `canceled` (unchanged) |
| `in_progress` stale window | 10 minutes (was 4 hours) |
| Unclaimed inbound `ringing` | Expire after 2 minutes |
| Twilio webhook | Still updates duration/outcome; must not reopen a terminal call |

## Current behavior this changes

- `VoiceCallProvider` PATCHes `canceled` only when the call never connected (`!wasConnected`), on `cancel` / `error`, or when `startCall` fails after initiate. A connected `disconnect` leaves the row for the status webhook.
- `PATCH /api/calls/:id` accepts only `canceled` and `failed`.
- `expireStaleActiveCalls(userId)` expires that user’s `in_progress` rows only after **4 hours**, and never expires inbound rows with `initiatedById` null.
- `POST /api/webhooks/voice/status` always writes `mappedStatus`, so a late non-terminal callback can reopen a closed call.

## Architecture

```
Staff hangup / far-end hangup
        |
        v
Twilio Device "disconnect"
        |
        +-- never connected --> PATCH { status: "canceled" }
        +-- was connected    --> PATCH { status: "completed" }
        |
        v
CallLog terminal (endedAt set)
        |
        +-- Twilio status webhook (later, optional)
            updates durationSeconds / outcome
            must not move status back to initiating/ringing/in_progress
```

Safety net when the PATCH or webhook never runs (tab crash, offline):

```
POST /api/calls/initiate  ─┐
GET  /api/calls/ringing   ─┴─► expireStaleActiveCalls(...)
                                   │
                                   ├─ this user’s initiating/ringing, no SID → canceled now
                                   ├─ this user’s initiating/ringing > 2 min → canceled
                                   ├─ this user’s in_progress > 10 min → canceled
                                   └─ any unclaimed inbound ringing > 2 min → canceled
```

## Client

In `bindCallEvents`, `disconnect` always finalizes the log:

- `wasConnected === false` → `{ status: "canceled" }` (same as today)
- `wasConnected === true` → `{ status: "completed" }`

`cancel`, `error`, and failed `startCall` stay `canceled`.

Keep using `PATCH /api/calls/:id`. If the row already has `endedAt` (webhook won the race), the existing no-op response is enough.

## API

`updateCallLogSchema` accepts `canceled | failed | completed`.

`PATCH /api/calls/:id` maps:

- `canceled` → `CallStatus.canceled`
- `failed` → `CallStatus.failed`
- `completed` → `CallStatus.completed`

Ownership, `endedAt` short-circuit, and `outcome = parsed.data.status` stay the same.

## Stale expiry

In `lib/voice/calls.ts`:

- `IN_PROGRESS_STALE_MS = 10 * 60 * 1000`
- `expireStaleActiveCalls(userId)` keeps the three per-user updates, with the new 10-minute `in_progress` window
- The same function also cancels **unclaimed inbound** rows: `direction = inbound`, `initiatedById` null, `status = ringing`, `startedAt` older than `SETUP_STALE_MS` (2 minutes), `outcome = "stale"`

Call it from:

- `POST /api/calls/initiate` (already does; keep passing the session user)
- `GET /api/calls/ringing` (new) so a ghost inbound ring is cleared before the client shows it

Do not expire an `in_progress` row younger than 10 minutes. A rare longer live call must not be swept while it is still going.

## Status webhook

When the existing `CallLog` is already terminal (`endedAt` set, or current status is terminal), apply only `durationSeconds` and `outcome` from a **terminal** Twilio callback. Ignore a non-terminal `mappedStatus` so a late `in-progress` cannot recreate the lock.

A first-arriving terminal webhook still sets `status`, `endedAt`, `durationSeconds`, and `outcome` as today.

## Testing

- `updateCallLogSchema` accepts `completed` and still rejects unknown statuses.
- `expireStaleActiveCalls`: `in_progress` older than 10 minutes is canceled; 9 minutes 59 seconds is left active.
- Unclaimed inbound `ringing` older than 2 minutes is canceled; a fresh inbound ring is not.
- Per-user `initiating` / `ringing` without a Twilio SID still cancels immediately on retry.
- Status mapping helper (or webhook update payload): terminal row + non-terminal Twilio status does not change `status` back to active.

## Out of scope follow-ups

- Admin or self-serve release control in the UI.
- Syncing live Twilio Call state on 409.
