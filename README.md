# CareText v1.0

CareText is a lightweight Twilio-powered SMS inbox for nurse call center operations. It provides:

- Two-pane conversation dashboard (sidebar + thread view)
- Outbound SMS via Twilio
- Inbound SMS webhook processing
- Group MMS messaging via Twilio Conversations (with consent intro gate and STOP handling)
- Conversation history persistence
- Contact and template management
- Internal notes and call logging
- Role-based access for `admin` and `nurse`

## Tech Stack

- Next.js App Router + TypeScript
- Tailwind CSS
- Prisma ORM
- PostgreSQL
- Twilio Node SDK
- NextAuth (credentials)

## Prerequisites

- Node.js 20+
- npm
- PostgreSQL 14+
- Twilio account with an SMS-enabled number

## Installation

```bash
npm install
```

## Environment Variables

Copy `.env.example` to `.env` and fill in values:

```bash
cp .env.example .env
```

Required keys:

- `DATABASE_URL`
- `NEXTAUTH_SECRET`
- `NEXTAUTH_URL`
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_PHONE_NUMBER`

Required for group messaging (Twilio Conversations):

- `TWILIO_CONVERSATIONS_SERVICE_SID` — the Conversations Service used to host group threads
- `TWILIO_MESSAGING_SERVICE_SID` — the Messaging Service that routes group SMS/MMS
- `TWILIO_GROUP_PROJECTED_ADDRESS` — a second Twilio number that represents portal users inside the group MMS thread

Required for Notify / CommStack messaging:

- `COMM_STACK_ENV` — `dev` or `production`

Per-community `COMM_STACK_APP_ID`, `COMM_STACK_APP_NAME`, `COMM_STACK_BASE_URL`, and `COMM_STACK_PORTAL_USER_ID` are entered on each Notify contact (Contacts page or conversation contact details), not as environment variables.

## Database Setup

Run migrations:

```bash
npx prisma migrate dev
```

Generate Prisma client:

```bash
npx prisma generate
```

Seed demo data:

```bash
npx prisma db seed
```

## Run the App

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Twilio Webhook Configuration

Configure your Twilio phone number webhooks:

- **Incoming message webhook**:  
  `https://<your-domain>/api/webhooks/sms`
- **Status callback webhook**:  
  `https://<your-domain>/api/webhooks/sms-status`

For local development, use a tunnel service (e.g., ngrok) and point Twilio to the generated HTTPS URL.

## Twilio Group Messaging (Conversations) Setup

Group threads use the [Twilio Conversations API](https://www.twilio.com/docs/conversations) so that recipients see a single native **group MMS** thread (not separate 1:1 texts). 1:1 messaging continues to use Programmable SMS and is unchanged.

1. In Twilio Console, create (or note) a **Conversations Service** and set `TWILIO_CONVERSATIONS_SERVICE_SID`.
2. Create a **Messaging Service**, add your sending number(s) to its sender pool, and set `TWILIO_MESSAGING_SERVICE_SID`. This service routes the group's SMS/MMS.
3. Provision a **second Twilio number** to act as the group "projected address" (the identity portal users appear as inside the group thread) and set `TWILIO_GROUP_PROJECTED_ADDRESS`.
4. Configure the **Conversations post-event webhook** (Conversations Service → Webhooks) to:
   - `https://<your-domain>/api/webhooks/conversations`
   - Enable the `onMessageAdded` post-event. Payloads are `application/x-www-form-urlencoded` and are signature-validated.
5. Group MMS supports up to **10 participants** total (so up to ~9 external contacts plus the projected address).

### Phase 0 verification spike (run before relying on groups)

Confirm your Twilio account actually delivers native group MMS before going live. Set `TWILIO_MESSAGING_SERVICE_SID`, `TWILIO_GROUP_PROJECTED_ADDRESS`, and two real test phones (`GROUP_TEST_PHONE_1`, `GROUP_TEST_PHONE_2`) in your environment, then run:

```bash
npx tsx scripts/verify-group-mms.ts
```

Check both test phones: the message must arrive as one **native group thread** containing both numbers. If it arrives as separate 1:1 texts or not at all, stop and contact Twilio support before depending on the feature.

### Consent in groups

- Contacts with consent status `none` are sent the standard opt-in intro via 1:1 SMS and join the group as `pending_intro`; the Twilio group activates once at least two participants are `active`.
- Contacts who are already `opted_in` join as `active` immediately.
- `opted_out` contacts cannot be added (the create API returns `409`).
- A participant who replies **STOP** in the group is removed from the Twilio conversation, globally opted out, and a system note is posted to the thread.

## Available Routes

### App Pages

- `/login`
- `/dashboard`
- `/templates` (admin only)
- `/contacts`
- `/conversations/[id]`

### API

- `POST /api/messages/send`
- `POST /api/webhooks/sms`
- `POST /api/webhooks/sms-status`
- `POST /api/webhooks/conversations` (Twilio Conversations group events)
- `GET /api/conversations`
- `GET /api/conversations/[id]`
- `PATCH /api/conversations/[id]`
- `POST /api/conversations/group` (create a group conversation)
- `POST /api/conversations/[id]/messages` (send a message to a group)
- `GET /api/contacts`
- `POST /api/contacts`
- `PATCH /api/contacts/[id]`
- `GET /api/templates`
- `POST /api/templates`
- `PATCH /api/templates/[id]`
- `DELETE /api/templates/[id]`
- `GET /api/conversations/[id]/notes`
- `POST /api/conversations/[id]/notes`
- `POST /api/calls/log`

## Seed Data Included

- 2 demo users (admin + nurse)
- 3 canned templates:
  - Check-in
  - Need Assistance?
  - Follow-up
- 2 contacts
- 2 conversations
- sample messages and one internal note

## Twilio Voice Setup

1. In Twilio Console, create an API Key (Account → API Keys).
2. Create a TwiML App with Voice Request URL:
   - `{NEXTAUTH_URL}/api/webhooks/voice/twiml`
3. Add to `.env`:
   - `TWILIO_API_KEY_SID`
   - `TWILIO_API_KEY_SECRET`
   - `TWILIO_TWIML_APP_SID`
4. For local development, expose your app via ngrok and set `NEXTAUTH_URL` to the ngrok URL.
5. Ensure your Twilio phone number has Voice capability enabled.

## Group Messaging Manual QA Checklist

- [ ] Phase 0 spike passed on real phones (native group thread, not separate 1:1 texts).
- [ ] Create a group with 3 opted-in contacts → native group MMS thread on recipients' phones.
- [ ] Create a group with 1 `none` + 2 `opted_in` contacts → intro SMS sent to the `none` contact; group activates once enough participants are active.
- [ ] Adding an opted-out contact in the picker → `409` with an inline error.
- [ ] Send and receive in a group thread → correct author labels; system notes render centered.
- [ ] A participant replies STOP → removed from the group, system note posted, contact globally opted out.
- [ ] 1:1 send / receive / consent intro still works unchanged.
- [ ] Embed inbox group flow works (New Group button, composer gating, participant panel).

## Notes

- Database records are the source of truth for all conversation history.
- Twilio Voice browser calling is enabled via the Call button in conversation threads.
- Requires Twilio API Key, TwiML App, and Voice SDK setup (see Twilio Voice Setup below).
- Call activity is logged to CallLog; recording and inbound voice are planned for future releases.
- Polling is used for near-realtime refresh in dashboard views.
