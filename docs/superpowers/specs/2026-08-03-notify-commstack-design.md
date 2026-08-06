# Notify / CommStack Integration — Design Spec

**Date:** 2026-08-03  
**Status:** Approved for implementation (Approach 1)  
**Related plan:** Notify CommStack Integration

## Summary

Add Notify CommStack as a second messaging transport alongside Twilio SMS. Contacts are either SMS (phone) or Notify (`notifyClientId`) — never both. The shared CareText inbox continues to own conversations and messages; send/receive branches by contact identity. Incoming Notify Alert/Clear events land in a dedicated Alerts panel and, when matched, also as system messages in the contact’s conversation.

## Goals

- Let staff create Notify contacts with a client ID and chat 1:1 via CommStack in the existing inbox.
- Keep Twilio SMS + consent + group MMS unchanged for phone contacts.
- Accept Notify Alert/Clear webhooks (Postman v2.0 shape), match to contacts, show in Alerts panel + inbox.
- Skip SMS consent for Notify contacts.
- Use one shared CareText CommStack sender user for all portal outbound messages.

## Non-Goals (v1)

- Full `MessagingTransport` provider abstraction (Approach 2 — see below).
- Notify contacts in group conversations.
- Voice calling Notify contacts.
- Migrating historical Twilio threads into CommStack.
- Replacing the CareText wrapper API in `lib/commstack.ts` (it already wraps `@notify/commstack-sdk` from `notify-commstack-sdk-1.0.0.tgz`).

## Stakeholder decisions

| Decision | Choice |
|---|---|
| Architecture | Approach 1 — shared inbox + transport branch |
| Identity | phone XOR notifyClientId |
| Consent | Skip for Notify contacts |
| Staff sender | One shared CommStack portal user |
| Groups | Twilio SMS only |
| Alerts UI | Alerts panel + inbox system message when matched |
| Alert matching | notifyClientId first (payload `id`), else unmatched queue |
| Alert direction | Inbound webhooks on CareText (Postman payload) |
| Inbound DMs | On-open / sync via `directHistory` until Notify provides push |

## Data model

- `Contact.phone` nullable; `Contact.notifyClientId` unique nullable; DB check enforces XOR.
- `Message.commStackMessageId` for idempotent inbound sync.
- `Alert` model: external id + event time uniqueness, status `open` | `cleared` | `unmatched`, optional contact/conversation links, location/resident/device fields, raw payload JSON.

## Runtime flow

```text
Contact create (Notify)
  -> ensure CommStack user (best-effort)
  -> store contact locally

Send (Notify conversation)
  -> skip consent
  -> CommStack messages.direct
  -> persist Message (+ commStackMessageId when returned)

Open Notify conversation
  -> POST .../commstack-sync
  -> directHistory + dedupe by commStackMessageId

Alert webhook
  -> upsert Alert
  -> match notifyClientId
  -> system Message in conversation when matched
```

## Configuration (SDK 1.2+)

| Env | Purpose |
|---|---|
| `COMM_STACK_BASE_URL` | Hostname only (e.g. `qsscommbe3.notifync.com`) |
| `COMM_STACK_ENV` | `dev` or `production` |
| `COMM_STACK_APP_ID` | Application / tenant id (preferred) |
| `COMM_STACK_APP_NAME` | Optional: register app by name if app id unknown |
| `COMM_STACK_PORTAL_USER_ID` | Shared portal sender UUID |
| `NOTIFY_ALERT_WEBHOOK_SECRET` | Webhook auth (required in production) |

No SDK token is required for v1.2 (token is bundled / env-selected by the SDK). Notify client IDs must be UUIDs. Inbound DMs arrive on the server realtime connection started from `instrumentation.ts`; `directHistory` remains for backfill.

Webhook routes:

- `POST|PATCH /api/webhooks/notify/alerts`
- `POST|PATCH /api/webhooks/notify/alerts/[facilityCode]`

## Open items for Notify

1. Which alert payload field is the durable client ID (v1 uses `id`).
2. Clear/ack callback URL if CareText must call Notify back.
3. Production host (staging is `qsscommbe3.notifync.com` + `COMM_STACK_ENV=dev`).
4. Confirm registered CareText `COMM_STACK_APP_ID` for staging/prod.

## Future: Approach 2 — messaging provider abstraction

Do **not** implement in v1. Once Notify identity and inbound push are confirmed, refactor as follows:

1. Introduce `MessagingTransport` with `send`, `syncInbound`, and identity helpers.
2. Implement `TwilioSmsTransport` and `CommStackTransport`.
3. Register transports by contact transport (`sms` | `notify`).
4. Move branching out of `app/api/messages/send` and webhook handlers into the registry.
5. Keep the shared `Conversation` / `Message` store; only the edge I/O moves behind the interface.

This keeps Approach 1’s product behavior while making additional transports cheaper to add.
