# CareText

CareText is a lightweight Twilio-powered SMS inbox for nurse call center operations. It provides:

- Two-pane conversation dashboard (sidebar + thread view)
- Outbound SMS via Twilio
- Inbound SMS webhook processing
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
- `GET /api/conversations`
- `GET /api/conversations/[id]`
- `PATCH /api/conversations/[id]`
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

## Notes

- Database records are the source of truth for all conversation history.
- Twilio Voice browser calling is enabled via the Call button in conversation threads.
- Requires Twilio API Key, TwiML App, and Voice SDK setup (see Twilio Voice Setup below).
- Call activity is logged to CallLog; recording and inbound voice are planned for future releases.
- Polling is used for near-realtime refresh in dashboard views.
