# Notify Outbound Alerts — Design Spec

**Date:** 2026-08-08  
**Status:** Approved for implementation (Approach 1), pending Notify API confirmations  
**Related:** `docs/superpowers/specs/2026-08-03-notify-commstack-design.md` (inbound alerts assumption superseded for product UX)

## Summary

Nurses send Notify alerts **from CareText to Notify handsets**, not the reverse. In a Notify thread, when a staff outbound message mentions a room, a **Send alert** control appears under the bubble. A modal lets staff confirm/edit the room and optionally add a note; CareText then POSTs the Postman v2.0 Alert payload to Notify’s `/palatiumCare/{facilityCode}` endpoint. Success is a toast only — no alert system messages in chat. The existing inbound Alerts panel and inbound alert bubbles are removed from the product.

## Goals

- Let staff raise a Notify alert from a room-mention message in a Notify conversation.
- Prefill room from message text; keep room editable; optional note in the modal.
- Call Notify’s documented Alert endpoint using the contact’s CommStack base URL and a dedicated facility code.
- Persist outbound alert attempts locally for audit.
- Remove inbound-alert product UX (panel + system bubbles).

## Non-Goals

- Clear / ack flow (`PATCH` Clear) — later.
- Inbound Notify → CareText alert webhooks as a product feature.
- Auto-sending alerts without confirmation.
- SMS / Twilio threads.
- Inventing Notify auth, `id`, note mapping, or required optional fields without confirmation.

## Stakeholder decisions

| Decision | Choice |
|---|---|
| Approach | Message action + modal + outbound client |
| Direction | CareText → Notify (`POST …/palatiumCare/{facilityCode}`) |
| Contract | Postman collection `Notify Incoming Alert - Eyewatch` |
| Button placement | Under matching outbound bubbles |
| Button visibility | Notify threads; outbound messages; room-pattern match |
| Room prefill | Parse first match; always editable |
| Note | Collected in modal; payload mapping TBD with Notify |
| Facility code | New contact field `notifyFacilityCode` |
| Alert host | Contact `commStackBaseUrl` |
| Auth | TBD with Notify (Bearer / `COMM_STACK_SDK_TOKEN` is a working hypothesis only) |
| Payload `id` | TBD with Notify |
| Extra Postman fields (`building`, `resident`, `device`) | TBD with Notify which are required |
| Success UX | Modal toast only; no thread system note |
| Clear | Out of scope |
| Inbound Alerts UI | Remove (panel + inbound alert system-message display) |

## Runtime flow

```text
Outbound Notify message with room mention
  -> UI shows "Send alert" under bubble
  -> Modal: room (prefilled, editable) + optional note
  -> POST /api/alerts/send { conversationId, messageId, room, note? }
  -> Load contact; require notify identity + notifyFacilityCode + commStackBaseUrl
  -> Build Postman v2.0 Alert payload (open fields filled after Notify confirms)
  -> POST https://{commStackBaseUrl}/palatiumCare/{notifyFacilityCode}?eventDateTime=...
  -> Persist local outbound Alert audit row
  -> Return success; modal closes with toast
```

## UI

### Send alert control

- Notify conversations only (client or channel identity).
- Outbound staff messages only.
- Shown only when message body matches a room pattern.
- Placement: small control directly under the message bubble.

### Room patterns

Case-insensitive; first match wins; captured token becomes modal prefill:

- `Room <token>`
- `Rm <token>`
- `Apt <token>`
- `Apartment <token>`

`<token>` is the room/apt identifier (typically digits, may include letters if present).

### Modal

- Title: **Send alert**
- Truncated source message context
- **Room** (required) — light white input
- **Note** (optional) — light white textarea
- Cancel / Send alert
- On success: toast and close (no system message in thread)
- On error: inline modal error (do not close as success)

### Contact setup

- Add `notifyFacilityCode` on Notify contact create/edit.
- Sending an alert requires `notifyFacilityCode` and `commStackBaseUrl` on the contact.

## API

### `POST /api/alerts/send`

Session required.

Request:

```json
{
  "conversationId": "uuid",
  "messageId": "uuid",
  "room": "214",
  "note": "optional string"
}
```

Behavior:

1. Auth via session.
2. Load conversation + contact; reject if not a Notify contact.
3. Reject if `room` empty after trim.
4. Reject if contact missing `notifyFacilityCode` or `commStackBaseUrl` with a clear configuration error.
5. Build Alert payload (`type: "Alert"`, `version: "2.0"`, `vendor: "Notify"`, `eventDateTime` now, `location.name` = room; remaining fields per Notify confirmations).
6. HTTP POST to  
   `https://{commStackBaseUrl}/palatiumCare/{notifyFacilityCode}?eventDateTime={eventDateTime}`  
   Auth header TBD (hypothesis: `Authorization: Bearer {COMM_STACK_SDK_TOKEN}`).
7. Persist audit row; return success or surface Notify/network failure.

## Data model

### `Contact`

- Add nullable `notifyFacilityCode String?` (required in practice for Notify contacts that send alerts; validated at send time and preferably on create/edit for Notify channel).

### `Alert` (repurpose for outbound audit)

Keep an `Alert` (or equivalent outbound audit) record including at least:

- Contact / conversation links
- `sourceMessageId` (optional FK or string) to the chat message that spawned the send
- Room / note as stored on send
- Status suitable for outbound (`sent` / `failed` — may extend or replace inbound-oriented statuses)
- Request/response payload JSON for support
- External/`id` value once Notify confirms what we must send
- Timestamps

Exact Prisma enum/field migration is an implementation detail; product requirement is durable outbound audit, not inbound matching.

## Cleanup of inbound product behavior

- Remove Alerts panel from dashboard UI.
- Stop rendering inbound “Alert received/cleared” system bubbles as dedicated alert cards.
- Inbound webhook routes may be deleted or left inert; they are not part of this product flow.
- Update `2026-08-03` design mental model: alert direction for CareText product is outbound.

## Error handling

| Case | UX |
|---|---|
| SMS conversation / non-Notify | API 400; button not shown |
| Empty room | Validation in modal + API |
| Missing `notifyFacilityCode` / `commStackBaseUrl` | Modal error: contact not configured for alerts |
| Notify non-2xx | Modal error with status/summary; audit `failed` |
| Network / timeout | Modal error; retryable; audit `failed` |

## Open items for Notify (block full payload wiring)

1. Exact auth for `/palatiumCare/...` (Bearer with CommStack SDK token?).
2. What CareText must send as payload `id`.
3. Where optional note maps in the Notify payload (no note field in Postman sample).
4. Whether `location.building`, `resident`, and `device` are required or may be omitted.

Implementation may land UI + `/api/alerts/send` shell + room detection + contact field while these remain documented placeholders, but must not invent production payload values.

## Testing

### Unit

- Room extraction: matches, no match, first-match wins.
- Payload builder fixtures once Notify confirms fields.
- API validation: SMS reject, missing facility code, empty room.

### Route / integration

- Mock Notify HTTP success → persist `sent`.
- Mock Notify HTTP failure → error response, persist `failed`.

### Manual

- Configured Notify contact; message with `Room 214` → button → prefill → send → toast.
- Message without room → no button.
- Missing facility code → clear config error.

## References

- Postman: `Notify Incoming Alert - Eyewatch`  
  `POST {{server-url}}/palatiumCare/{{facilitycode}}?eventDateTime={{eventDateTime}}`
- CommStack SDK: messaging only; no alert APIs.
