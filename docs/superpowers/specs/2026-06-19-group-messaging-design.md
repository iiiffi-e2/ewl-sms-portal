# Group Messaging — Design Spec

**Date:** 2026-06-19  
**Status:** Approved (brainstorming)  
**Approach:** Parallel Conversations stack for groups only (Approach 1) + intro gate + verification spike

## Summary

Add native group MMS messaging to CareText using **Twilio Conversations**, while keeping existing 1:1 Programmable SMS unchanged. Nurses create ad hoc group threads by selecting 2–9 contacts from the directory. Non-opted-in contacts receive the existing opt-in intro via 1:1 SMS before joining the Twilio group thread. When a participant replies STOP, they are removed from the group and marked globally opted out. A verification spike must confirm Group MMS works on the Twilio account before full implementation.

## Goals

- Enable true group MMS on recipients' phones (shared native group thread, not fan-out 1:1).
- Support ad hoc groups of 4–10 people (nurse + family + facility staff).
- Keep 1:1 messaging on the existing Programmable SMS path with zero regression.
- Reuse the existing opt-in intro text and consent audit trail.
- Remove group participants on STOP; align local consent state with carrier opt-out behavior.

## Non-Goals (v1)

- Migrating 1:1 threads to Twilio Conversations.
- Twilio Studio flows for group orchestration.
- Adding participants to an existing group from the UI mid-conversation.
- Per-nurse projected addresses (one shared projected address for all portal sends).
- Group-specific intro text variants.
- WhatsApp or Conversations chat SDK participants.
- Auto-resume group membership after START (manual re-add by nurse).
- Dedicated consent/audit reporting UI for groups.
- Upgrading an existing 1:1 thread into a group.

## Stakeholder decisions

| Decision | Choice |
|---|---|
| Recipient experience | True group MMS on phones |
| Twilio product | Conversations REST API (not Studio) |
| Typical group size | 4–10 participants |
| Group creation | Ad hoc — nurse picks 2–9 contacts from directory |
| vs. 1:1 | Keep both — separate "New Group Conversation" flow |
| Consent for non-opted-in | Send same `OPT_IN_INTRO_TEXT` via 1:1 before joining group |
| STOP in group | Remove from Twilio Conversation + set `Contact.consentStatus = opted_out` |
| Projected address | One shared `TWILIO_GROUP_PROJECTED_ADDRESS` for all nurses |
| Implementation approach | Parallel stack — Conversations for groups, Programmable SMS for 1:1 |

## Background

### Current behavior

- 1:1 only: each `Conversation` links to one `Contact` via required `contactId`.
- Outbound: `twilioClient.messages.create({ from, to, body })` in `app/api/messages/send/route.ts`.
- Inbound: `POST /api/webhooks/sms` with per-contact consent (opt-in intro, STOP/START).
- Consent gated at send; intro sent via `POST /api/conversations/[id]/consent-intro`.

### Twilio constraints

- Group MMS requires **Twilio Conversations** with Group Texting enabled.
- Up to **10 participants** per group MMS conversation (including projected address).
- US/Canada long codes; projected address required for portal/API senders.
- [Group Texting GA (Oct 2024)](https://www.twilio.com/en-us/changelog/group-texting-is-now-generally-available-in-conversations) — must be verified on the account via spike before build.
- STOP at the carrier level typically opts out from the Twilio number globally; local state treats STOP as global `opted_out`.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        CareText Portal                          │
├────────────────────────────┬────────────────────────────────────┤
│  1:1 (unchanged)           │  Group (new)                       │
│  POST /api/messages/send   │  POST /api/conversations/group     │
│  Programmable SMS API      │  POST /api/conversations/[id]/msgs │
│  Webhook: /api/webhooks/sms│  Twilio Conversations API          │
│                            │  Webhook: /api/webhooks/conversations│
└────────────────────────────┴────────────────────────────────────┘
```

Intro messages for pending group participants always use the 1:1 Programmable SMS path (existing intro logic), even though group messages use Conversations.

## Data model (Prisma)

### New enums

```prisma
enum ConversationType {
  direct
  group
}

enum ParticipantStatus {
  pending_intro
  active
  removed
}
```

### `ConsentEventType` addition

- `group_intro_sent` — intro sent as part of group onboarding.

### `Conversation` changes

| Field | Type | Notes |
|---|---|---|
| `type` | `ConversationType` | default `direct`; existing rows unchanged |
| `contactId` | String? | Required for `direct`; optional for `group` |
| `title` | String? | Group label in sidebar |
| `twilioConversationSid` | String? @unique | Set when Twilio group is live |
| `twilioProjectedAddress` | String? | Twilio number representing portal in group MMS |

Migration: backfill all existing conversations as `type = direct`; `contactId` remains populated.

### New `ConversationParticipant`

| Field | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `conversationId` | → Conversation | onDelete Cascade |
| `contactId` | → Contact | onDelete Restrict |
| `twilioParticipantSid` | String? | Set when added to Twilio |
| `status` | `ParticipantStatus` | |
| `removedAt` | DateTime? | STOP or manual removal |
| `createdAt` / `updatedAt` | timestamps | |

Constraints: `@@unique([conversationId, contactId])`, indexes on `conversationId` and `contactId`.

Relations: `Conversation.participants`, `Contact.conversationParticipants`.

### `Message` additions

| Field | Type | Notes |
|---|---|---|
| `authorPhone` | String? | Inbound group sender phone |
| `twilioConversationSid` | String? | For Conversations-routed messages |

## Twilio Console setup

New environment variables:

```
TWILIO_CONVERSATIONS_SERVICE_SID=
TWILIO_MESSAGING_SERVICE_SID=
TWILIO_GROUP_PROJECTED_ADDRESS=
```

Setup steps:

1. Create a **Conversations Service**.
2. Create/link a **Messaging Service** with the existing SMS number in the sender pool.
3. Assign a **second Twilio number** as the group projected address (portal/nurse identity in group MMS).
4. Configure Conversations post-event webhook → `POST /api/webhooks/conversations`.
5. Enable **Group Texting** on the Conversations Service (confirm after spike).

Existing `TWILIO_PHONE_NUMBER`, `TWILIO_ACCOUNT_SID`, and `TWILIO_AUTH_TOKEN` remain for 1:1 traffic.

## Verification spike (Phase 0 gate)

Script: `scripts/verify-group-mms.ts`

1. Create a Conversation with 2 verified test numbers + projected address via Conversation-with-Participants API.
2. Send a test message with `author` = projected address.
3. Confirm both phones show a **native group MMS thread**.
4. **Stop implementation if this fails** — contact Twilio support.

## Group creation flow

### UI

- **New Group Conversation** action on dashboard (alongside New Conversation).
- Modal/slide-over: optional title, multi-select contact picker (2–9 contacts).
- Embed inbox: include same flow in v1 if feasible; otherwise dashboard-only with embed as fast follow.

### API: `POST /api/conversations/group`

Request:

```json
{
  "title": "Smith family + Oakwood",
  "contactIds": ["uuid-1", "uuid-2", "uuid-3"]
}
```

Server steps:

1. `requireSession()`.
2. Validate 2–9 unique contact IDs with valid phones.
3. Create `Conversation` (`type: group`, `title`, `assignedToId`, `status: new`, `twilioConversationSid: null`).
4. Create `ConversationParticipant` per contact:
   - `opted_in` → `status: active`
   - `none` → `status: pending_intro`
   - `opted_out` → reject entire request with 409 listing opted-out contacts
5. For each `pending_intro` participant, send `OPT_IN_INTRO_TEXT` via 1:1 Programmable SMS (shared `sendConsentIntro` logic):
   - On Twilio accept → `Contact.consentStatus = opted_in`, participant → `active`, `ConsentEvent { type: group_intro_sent }`
6. When ≥2 participants are `active`, create Twilio Conversation via Conversation-with-Participants API; store SIDs.
7. Return conversation detail + participant statuses.

**Partial activation:** If some contacts are still pending intro, create Twilio group with ready participants only; add others when intro completes.

### Intro completion hook

When intro succeeds (accept-on-send, matching existing model) via `sms-status` webhook or shared consent helper:

1. Flip participant `pending_intro` → `active`.
2. If `twilioConversationSid` exists → add participant via Conversations Participants API.
3. If no `twilioConversationSid` but now ≥2 active → create Twilio Conversation.

Logic lives in `lib/group-conversations.ts`, called from consent flow — not duplicated in webhooks.

## Outbound group messages

### API: `POST /api/conversations/[id]/messages`

For `type: group`:

1. Verify session; conversation not archived.
2. Require `twilioConversationSid` (else 409: group not ready).
3. Send via Conversations API with `author: twilioProjectedAddress`.
4. Persist `Message` (`direction: outbound`, `userId`, `twilioConversationSid`).
5. Update `lastMessageAt` and conversation status.

1:1 continues to use `POST /api/messages/send` unchanged.

## Inbound & webhooks

### `POST /api/webhooks/conversations`

Validate Twilio signature. Handle `onMessageAdded`:

1. Parse `ConversationSid`, `MessageSid`, `Author`, `Body`, `ParticipantSid`.
2. Ignore if `Author` = projected address (outbound echo).
3. Load local conversation by `twilioConversationSid`.
4. Resolve participant → `Contact`.
5. If body matches STOP keyword → STOP handler (below); do not persist as normal message.
6. Dedupe on `MessageSid`.
7. Create inbound `Message` with `authorPhone`; update conversation status.

Optional: handle `onParticipantUpdated` for Twilio-side changes.

### STOP in group

1. Remove participant from Twilio Conversation.
2. Set `ConversationParticipant.status = removed`, `removedAt = now()`.
3. Set `Contact.consentStatus = opted_out`, `consentUpdatedAt = now()`.
4. Log `ConsentEvent { type: opted_out, detail: "STOP in group …" }`.
5. Show system note in portal thread: "Jane Doe left the group (STOP)" — not sent to phones.

Re-add after STOP: contact must START (existing 1:1 SMS handler) to become `opted_in`; nurse manually adds to a new group. No auto re-add in v1.

### Edge cases

| Scenario | Behavior |
|---|---|
| Group drops to 1 active after STOP | Keep local conversation; show "group messaging paused"; nurse can archive or add contacts |
| STOP to intro 1:1 before group live | Global opt-out; participant → `removed`; pause group if <2 active |
| Contact in multiple groups | Allowed; STOP removes from that conversation + global opt-out |
| Inbound from unknown participant | Log warning, ignore |
| Duplicate webhook | Dedupe on `MessageSid` |
| Archive group | Set `archivedAt`; optionally close Twilio Conversation in future |

## UI

### Sidebar

- Group threads show `title` + participant count badge.
- Distinct icon from 1:1 threads.

### Thread header

- Title + expandable participant list with status chips: Active, Pending opt-in, Removed.

### Composer

- Enabled when group is active (`twilioConversationSid` exists).
- Disabled with explanation while waiting on intros.

### Components (new)

| File | Purpose |
|---|---|
| `components/caretext/NewGroupConversationModal.tsx` | Contact picker + create flow |
| `components/caretext/GroupParticipantsPanel.tsx` | Header participant list |

## Server modules (new)

| File | Purpose |
|---|---|
| `lib/group-conversations.ts` | Twilio Conversations helpers, add/remove participants, activate group |
| `lib/conversations-webhook.ts` | Parse & validate Conversations post-events |
| `app/api/conversations/group/route.ts` | Create group |
| `app/api/conversations/[id]/messages/route.ts` | Group outbound send |
| `app/api/webhooks/conversations/route.ts` | Inbound + STOP |
| `scripts/verify-group-mms.ts` | Phase 0 spike |

## What stays unchanged

- `POST /api/messages/send` (1:1)
- `POST /api/webhooks/sms` (1:1 inbound)
- `POST /api/conversations/[id]/consent-intro` (1:1 intro)
- Templates, voice calls, internal notes (attach to group conversations same as 1:1)
- Contact-level `consentStatus` semantics for 1:1

## Testing plan

### Phase 0 — Spike (gate)

- Native group MMS confirmed on 2+ test phones.

### Phase 1 — API & webhooks

- Group create with all opted-in → Twilio Conversation created.
- Mixed consent → intros sent, partial then full activation.
- Opted-out in selection → 409.
- Outbound/inbound group messages with correct attribution.
- STOP → removal + opt-out + system note.
- Webhook signature and deduplication.

### Phase 2 — UI

- New Group Conversation flow, sidebar distinction, composer gating.
- Embed inbox parity if in scope.

### Phase 3 — Regression

- 1:1 send/receive/consent/voice unchanged.

Unit tests: STOP in group context, participant status transitions, consent gate in `lib/group-conversations.ts`.

## Rollout

1. Twilio Console setup (Conversations Service, Messaging Service, projected address, webhooks).
2. Run spike script on staging.
3. Schema migration.
4. Backend (group create, webhook, group send, consent hooks).
5. UI (New Group Conversation + group thread display).
6. Staging QA with real phones.
7. Production deploy.

## Success criteria

- Nurse creates ad hoc group from 2–9 contacts.
- Non-opted-in contacts receive intro before joining native group thread.
- Active participants see messages in a single group MMS thread on their phones.
- STOP removes participant from group and blocks re-add until START.
- 1:1 messaging works with zero regression.
