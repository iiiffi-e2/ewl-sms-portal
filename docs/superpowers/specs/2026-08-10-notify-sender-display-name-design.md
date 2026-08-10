# Notify Sender Display Name — Design Spec

**Date:** 2026-08-10  
**Status:** Approved  
**Approach:** Always brand Notify outbound as EyeWatch LIVE (Approach 1)

## Summary

Notify handsets currently show the CareText staff user’s display name (e.g. “CareText Admin”) as the message sender. Outbound Notify messages must always display **EyeWatch LIVE®** instead, regardless of which nurse or admin sent the message.

## Stakeholder decisions

| Decision | Choice |
|---|---|
| Display name on Notify | Always `EyeWatch LIVE®` |
| Per-staff sender names | No — brand only |
| CareText audit trail | Unchanged — message still stores `userId` of the sending staff user |
| Seed / Users table rename | Out of scope |

## Root cause

In `app/api/messages/send/route.ts`, the Notify send path sets:

```ts
const senderName = authResult.session.user.name ?? "EyeWatch LIVE®";
```

That value is passed to CommStack as `senderName`. Seeded (and real) staff accounts often have names like “CareText Admin”, which Notify then surfaces.

`lib/commstack.ts` already defaults `senderName` to `EyeWatch LIVE®` when omitted; the send route overrides that default with the session name.

## Change

- In the Notify branch of `POST /api/messages/send`, stop using `authResult.session.user.name` for `senderName`.
- Always send `EyeWatch LIVE®` (either pass that string explicitly, or omit `senderName` so the CommStack helpers’ existing default applies).
- Apply to both direct (`notifyClientId`) and channel (`notifyChannelId`) sends.

## Non-goals

- Renaming users in `prisma/seed.ts` or the Users admin UI
- Changing CareText inbox / export “Sent By” columns (those may still show staff names)
- SMS (Twilio) sender identity — out of scope; Twilio uses the from-number, not this field
- Env-configurable brand string

## Already aligned

- `ensurePortalCommStackUser` registers the portal user as `EyeWatch LIVE®`
- CommStack realtime connects with `userName: "EyeWatch LIVE®"`
- Direct/channel send helpers default `senderName` to `EyeWatch LIVE®`

## Verification

- Send a Notify message while logged in as a user named “CareText Admin” (or any other staff name).
- Confirm the Notify handset / thread shows **EyeWatch LIVE®**, not the staff name.
- Confirm CareText still attributes the outbound message to the correct staff `userId`.
