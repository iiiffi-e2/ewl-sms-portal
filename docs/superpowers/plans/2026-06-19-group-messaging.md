# Group Messaging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add native group MMS via Twilio Conversations while keeping 1:1 Programmable SMS unchanged — ad hoc groups, intro gate, STOP removal.

**Architecture:** Parallel stack. Groups use Twilio Conversations REST API + `/api/webhooks/conversations`. Intros for pending participants still use 1:1 `messages.create`. Pure decision logic in `lib/group-conversations.ts` (Vitest). `ConversationParticipant` tracks per-contact status; `maybeActivateTwilioGroup` creates/adds Twilio participants when ≥2 are `active`.

**Tech Stack:** Next.js 16 App Router, Prisma 6 + PostgreSQL, Twilio SDK 5.x, NextAuth v4, React 19, Tailwind 4, Vitest, Zod.

**Spec:** `docs/superpowers/specs/2026-06-19-group-messaging-design.md`

---

## File Structure

**Create:**
- `scripts/verify-group-mms.ts` — Phase 0 gate: prove Group MMS works on the Twilio account.
- `lib/group-conversations.ts` — pure helpers + Twilio/DB activation (`maybeActivateTwilioGroup`, `sendGroupConsentIntro`, `removeGroupParticipantOnStop`).
- `lib/group-conversations.test.ts` — Vitest unit tests for pure helpers.
- `lib/conversations-webhook.ts` — parse Conversations post-event JSON + signature validation.
- `lib/conversations-webhook.test.ts` — Vitest for event parsing helpers.
- `app/api/conversations/group/route.ts` — create group conversation.
- `app/api/conversations/[id]/messages/route.ts` — outbound group send.
- `app/api/webhooks/conversations/route.ts` — inbound + STOP.
- `components/caretext/NewGroupConversationModal.tsx` — contact multi-select + create.
- `components/caretext/GroupParticipantsPanel.tsx` — participant list + status chips.
- `components/caretext/GroupComposerArea.tsx` — composer gating for groups (waiting on intros / not ready).

**Modify:**
- `prisma/schema.prisma` — enums, nullable `contactId`, `ConversationParticipant`, message fields.
- `lib/twilio.ts` — Conversations env getters.
- `lib/validators.ts` — `createGroupConversationSchema`, `sendGroupMessageSchema`.
- `app/api/conversations/route.ts` — include groups in list + search by title/participant.
- `app/api/conversations/[id]/route.ts` — include `participants` on detail.
- `app/api/webhooks/sms-status/route.ts` — resolve `contactId` for group intro delivery events.
- `components/caretext/DashboardClient.tsx` — New Group button, group types, group send path.
- `components/caretext/ConversationListItem.tsx` — group icon + participant count.
- `components/caretext/ConversationHeader.tsx` — group title + participants panel.
- `components/caretext/MessageThread.tsx` — show `authorPhone` label on inbound group messages.
- `components/caretext/EmbedInboxClient.tsx` — New Group button (same modal).
- `.env.example` — new Twilio vars.
- `README.md` — Twilio Conversations setup section.

**Testing note:** Follow existing pattern: unit-test pure `lib/*` modules; route/UI verified via `npm run test`, `npm run lint`, `npm run build`, and manual phone QA.

---

## Task 0: Twilio Console setup + verification spike (GATE)

**Files:**
- Create: `scripts/verify-group-mms.ts`
- Modify: `.env.example`

- [ ] **Step 1: Add env vars to `.env.example`**

Append after `TWILIO_PHONE_NUMBER`:

```
TWILIO_CONVERSATIONS_SERVICE_SID="ISxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
TWILIO_MESSAGING_SERVICE_SID="MGxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
TWILIO_GROUP_PROJECTED_ADDRESS="+15559876543"
```

Copy values into local `.env` after Twilio Console setup.

- [ ] **Step 2: Twilio Console (manual)**

1. **Conversations → Services** → Create service → copy SID to `TWILIO_CONVERSATIONS_SERVICE_SID`.
2. **Messaging → Services** → Create service → add existing `TWILIO_PHONE_NUMBER` to sender pool → copy SID to `TWILIO_MESSAGING_SERVICE_SID`.
3. Link Messaging Service to Conversations Service (Conversations service settings → Messaging Service).
4. Purchase/assign a **second** SMS/MMS number → `TWILIO_GROUP_PROJECTED_ADDRESS`.
5. Enable **Group Texting** on the Conversations Service (if toggle exists).
6. Set post-event webhook URL to `https://<domain>/api/webhooks/conversations` (use ngrok for local later).

- [ ] **Step 3: Create spike script**

Create `scripts/verify-group-mms.ts`:

```typescript
import twilio from "twilio";

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const serviceSid = process.env.TWILIO_CONVERSATIONS_SERVICE_SID;
const projectedAddress = process.env.TWILIO_GROUP_PROJECTED_ADDRESS;
const testPhone1 = process.env.GROUP_TEST_PHONE_1;
const testPhone2 = process.env.GROUP_TEST_PHONE_2;

if (!accountSid || !authToken || !serviceSid || !projectedAddress || !testPhone1 || !testPhone2) {
  console.error(
    "Missing env: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_CONVERSATIONS_SERVICE_SID, TWILIO_GROUP_PROJECTED_ADDRESS, GROUP_TEST_PHONE_1, GROUP_TEST_PHONE_2",
  );
  process.exit(1);
}

const client = twilio(accountSid, authToken);

async function main() {
  console.log("Creating group conversation with 2 SMS participants + projected address...");

  const conversation = await client.conversations.v1.conversationWithParticipants.create({
    friendlyName: "CareText Group MMS Spike",
    chatServiceSid: serviceSid,
    participant: [
      { "messagingBinding.address": testPhone1 },
      { "messagingBinding.address": testPhone2 },
      {
        "messagingBinding.projectedAddress": projectedAddress,
        identity: "caretext-portal",
      },
    ],
  });

  console.log("Conversation SID:", conversation.sid);

  const message = await client.conversations.v1
    .conversations(conversation.sid)
    .messages.create({
      author: projectedAddress,
      body: "CareText group MMS verification — if you see this in a group thread with both numbers, the spike passed.",
    });

  console.log("Message SID:", message.sid);
  console.log("\nCheck both test phones for a NATIVE group MMS thread (not separate 1:1 texts).");
  console.log("If messages do not arrive or appear as 1:1, STOP and contact Twilio support before continuing.");
}

main().catch((error) => {
  console.error("Spike failed:", error);
  process.exit(1);
});
```

- [ ] **Step 4: Run spike**

Run: `npx tsx scripts/verify-group-mms.ts`

Expected: Script prints Conversation SID and Message SID without error. **Both test phones show one shared group MMS thread.**

If spike fails → do not proceed to Task 1.

- [ ] **Step 5: Commit**

```bash
git add scripts/verify-group-mms.ts .env.example
git commit -m "chore: add group MMS verification spike script"
```

---

## Task 1: Prisma schema + migration

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add enums after `ConsentEventType`**

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

- [ ] **Step 2: Extend `ConsentEventType`**

Add `group_intro_sent` to the existing enum:

```prisma
enum ConsentEventType {
  intro_sent
  intro_delivered
  intro_failed
  opted_out
  resubscribed
  group_intro_sent
}
```

- [ ] **Step 3: Update `Conversation` model**

Replace the `Conversation` model with:

```prisma
model Conversation {
  id                      String             @id @default(uuid())
  type                    ConversationType   @default(direct)
  contactId               String?
  title                   String?
  twilioConversationSid   String?            @unique
  twilioProjectedAddress  String?
  status                  ConversationStatus @default(new)
  assignedToId            String?
  archivedAt              DateTime?
  lastMessageAt           DateTime           @default(now())
  createdAt               DateTime           @default(now())
  updatedAt               DateTime           @updatedAt
  contact                 Contact?           @relation(fields: [contactId], references: [id], onDelete: Restrict)
  assignedTo              User?              @relation("ConversationAssignee", fields: [assignedToId], references: [id], onDelete: SetNull)
  messages                Message[]
  callLogs                CallLog[]
  notes                   InternalNote[]
  participants            ConversationParticipant[]

  @@index([contactId])
  @@index([assignedToId])
  @@index([archivedAt])
  @@index([lastMessageAt])
  @@index([status])
  @@index([type])
}
```

- [ ] **Step 4: Add `conversationParticipants` to `Contact`**

In `Contact` model, add after `conversations`:

```prisma
  conversationParticipants ConversationParticipant[]
```

- [ ] **Step 5: Add `ConversationParticipant` model**

```prisma
model ConversationParticipant {
  id                   String            @id @default(uuid())
  conversationId       String
  contactId            String
  twilioParticipantSid String?
  status               ParticipantStatus @default(pending_intro)
  removedAt            DateTime?
  createdAt            DateTime          @default(now())
  updatedAt            DateTime          @updatedAt
  conversation         Conversation      @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  contact              Contact           @relation(fields: [contactId], references: [id], onDelete: Restrict)

  @@unique([conversationId, contactId])
  @@index([conversationId])
  @@index([contactId])
}
```

- [ ] **Step 6: Extend `Message` model**

Add after `isConsentIntro`:

```prisma
  authorPhone            String?
  twilioConversationSid  String?
  isSystemNote           Boolean          @default(false)
```

- [ ] **Step 7: Run migration**

Run: `npx prisma migrate dev --name add_group_messaging`

Expected: Migration applies; client regenerates.

- [ ] **Step 8: Commit**

```bash
git add prisma/
git commit -m "feat: add schema for group conversations and participants"
```

---

## Task 2: Twilio config helpers

**Files:**
- Modify: `lib/twilio.ts`

- [ ] **Step 1: Add getters**

Append to `lib/twilio.ts`:

```typescript
export function getTwilioConversationsServiceSid() {
  const sid = process.env.TWILIO_CONVERSATIONS_SERVICE_SID;
  if (!sid) {
    throw new Error("TWILIO_CONVERSATIONS_SERVICE_SID is not configured.");
  }
  return sid;
}

export function getTwilioMessagingServiceSid() {
  const sid = process.env.TWILIO_MESSAGING_SERVICE_SID;
  if (!sid) {
    throw new Error("TWILIO_MESSAGING_SERVICE_SID is not configured.");
  }
  return sid;
}

export function getTwilioGroupProjectedAddress() {
  const address = process.env.TWILIO_GROUP_PROJECTED_ADDRESS;
  if (!address) {
    throw new Error("TWILIO_GROUP_PROJECTED_ADDRESS is not configured.");
  }
  return address;
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/twilio.ts
git commit -m "feat: add Twilio Conversations env getters"
```

---

## Task 3: Pure group-conversations helpers + tests

**Files:**
- Create: `lib/group-conversations.ts`
- Create: `lib/group-conversations.test.ts`

- [ ] **Step 1: Write failing tests**

Create `lib/group-conversations.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import {
  buildDefaultGroupTitle,
  countActiveParticipants,
  canActivateTwilioGroup,
  isGroupReadyForMessages,
} from "@/lib/group-conversations";

describe("countActiveParticipants", () => {
  it("counts only active participants", () => {
    expect(
      countActiveParticipants([
        { status: "active" },
        { status: "pending_intro" },
        { status: "active" },
        { status: "removed" },
      ]),
    ).toBe(2);
  });
});

describe("canActivateTwilioGroup", () => {
  it("requires at least two active participants", () => {
    expect(canActivateTwilioGroup(0)).toBe(false);
    expect(canActivateTwilioGroup(1)).toBe(false);
    expect(canActivateTwilioGroup(2)).toBe(true);
  });
});

describe("isGroupReadyForMessages", () => {
  it("requires twilioConversationSid", () => {
    expect(isGroupReadyForMessages(null)).toBe(false);
    expect(isGroupReadyForMessages("CHxxx")).toBe(true);
  });
});

describe("buildDefaultGroupTitle", () => {
  it("joins contact names and falls back to phone", () => {
    expect(
      buildDefaultGroupTitle([
        { name: "Jane Smith", phone: "+15551111111" },
        { name: null, phone: "+15552222222" },
      ]),
    ).toBe("Jane Smith, +15552222222");
  });

  it("truncates long lists", () => {
    const title = buildDefaultGroupTitle([
      { name: "A", phone: "+1" },
      { name: "B", phone: "+2" },
      { name: "C", phone: "+3" },
      { name: "D", phone: "+4" },
    ]);
    expect(title).toContain("A");
    expect(title).toContain("+ 1 more");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- lib/group-conversations.test.ts`

Expected: FAIL — module not found.

- [ ] **Step 3: Implement pure helpers**

Create `lib/group-conversations.ts` with:

```typescript
type ParticipantLike = { status: "pending_intro" | "active" | "removed" };
type ContactLike = { name: string | null; phone: string };

export function countActiveParticipants(participants: ParticipantLike[]): number {
  return participants.filter((p) => p.status === "active").length;
}

export function canActivateTwilioGroup(activeCount: number): boolean {
  return activeCount >= 2;
}

export function isGroupReadyForMessages(twilioConversationSid: string | null | undefined): boolean {
  return Boolean(twilioConversationSid);
}

export function buildDefaultGroupTitle(contacts: ContactLike[]): string {
  const labels = contacts.map((c) => c.name?.trim() || c.phone);
  if (labels.length <= 3) {
    return labels.join(", ");
  }
  return `${labels.slice(0, 3).join(", ")} + ${labels.length - 3} more`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- lib/group-conversations.test.ts`

Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/group-conversations.ts lib/group-conversations.test.ts
git commit -m "feat: add pure helpers for group conversation logic"
```

---

## Task 4: Twilio activation + group consent intro (DB layer)

**Files:**
- Modify: `lib/group-conversations.ts`
- Modify: `lib/validators.ts`

- [ ] **Step 1: Add Zod schema**

In `lib/validators.ts`, append:

```typescript
export const createGroupConversationSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  contactIds: z
    .array(z.string().uuid())
    .min(2, "Select at least 2 contacts.")
    .max(9, "Groups support at most 9 external contacts."),
});

export const sendGroupMessageSchema = z.object({
  body: z.string().trim().min(1, "Message cannot be empty.").max(1600, "Message is too long."),
});
```

- [ ] **Step 2: Add Twilio activation functions to `lib/group-conversations.ts`**

Append imports and async functions (keep pure helpers at top):

```typescript
import {
  ConsentEventType,
  ConsentStatus,
  ConversationStatus,
  MessageDirection,
  MessageStatus,
  ParticipantStatus,
  Prisma,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { OPT_IN_INTRO_TEXT } from "@/lib/consent";
import {
  getTwilioClient,
  getTwilioConversationsServiceSid,
  getTwilioFromNumber,
  getTwilioGroupProjectedAddress,
} from "@/lib/twilio";

export async function maybeActivateTwilioGroup(conversationId: string): Promise<void> {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: {
      participants: {
        where: { status: ParticipantStatus.active },
        include: { contact: true },
      },
    },
  });

  if (!conversation || conversation.type !== "group") {
    return;
  }

  const active = conversation.participants;
  if (!canActivateTwilioGroup(active.length)) {
    return;
  }

  const projectedAddress = conversation.twilioProjectedAddress ?? getTwilioGroupProjectedAddress();
  const client = getTwilioClient();
  const serviceSid = getTwilioConversationsServiceSid();

  if (!conversation.twilioConversationSid) {
    const twilioConversation = await client.conversations.v1.conversationWithParticipants.create({
      friendlyName: conversation.title ?? "CareText Group",
      chatServiceSid: serviceSid,
      participant: [
        ...active.map((p) => ({ "messagingBinding.address": p.contact.phone })),
        {
          "messagingBinding.projectedAddress": projectedAddress,
          identity: "caretext-portal",
        },
      ],
    });

    await prisma.conversation.update({
      where: { id: conversationId },
      data: {
        twilioConversationSid: twilioConversation.sid,
        twilioProjectedAddress: projectedAddress,
      },
    });

    const twilioParticipants = await client.conversations.v1
      .conversations(twilioConversation.sid)
      .participants.list();

    for (const participant of conversation.participants) {
      const match = twilioParticipants.find(
        (tp) => tp.messagingBinding?.address === participant.contact.phone,
      );
      if (match) {
        await prisma.conversationParticipant.update({
          where: { id: participant.id },
          data: { twilioParticipantSid: match.sid },
        });
      }
    }
    return;
  }

  const existing = await prisma.conversationParticipant.findMany({
    where: {
      conversationId,
      status: ParticipantStatus.active,
      twilioParticipantSid: null,
    },
    include: { contact: true },
  });

  for (const participant of existing) {
    const created = await client.conversations.v1
      .conversations(conversation.twilioConversationSid)
      .participants.create({ "messagingBinding.address": participant.contact.phone });

    await prisma.conversationParticipant.update({
      where: { id: participant.id },
      data: { twilioParticipantSid: created.sid },
    });
  }
}

export async function sendGroupConsentIntro(params: {
  conversationId: string;
  contactId: string;
  userId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const contact = await prisma.contact.findUnique({ where: { id: params.contactId } });
  if (!contact) {
    return { ok: false, error: "Contact not found." };
  }
  if (contact.consentStatus === ConsentStatus.opted_out) {
    return { ok: false, error: "Contact opted out." };
  }
  if (contact.consentStatus === ConsentStatus.opted_in) {
    await prisma.conversationParticipant.updateMany({
      where: {
        conversationId: params.conversationId,
        contactId: params.contactId,
        status: ParticipantStatus.pending_intro,
      },
      data: { status: ParticipantStatus.active },
    });
    await maybeActivateTwilioGroup(params.conversationId);
    return { ok: true };
  }

  const queuedMessage = await prisma.message.create({
    data: {
      conversationId: params.conversationId,
      userId: params.userId,
      body: OPT_IN_INTRO_TEXT,
      direction: MessageDirection.outbound,
      status: MessageStatus.queued,
      isConsentIntro: true,
    },
  });

  try {
    const result = await getTwilioClient().messages.create({
      from: getTwilioFromNumber(),
      to: contact.phone,
      body: OPT_IN_INTRO_TEXT,
      statusCallback: `${process.env.NEXTAUTH_URL}/api/webhooks/sms-status`,
    });

    await prisma.$transaction([
      prisma.message.update({
        where: { id: queuedMessage.id },
        data: { twilioSid: result.sid, status: MessageStatus.sent },
      }),
      prisma.contact.update({
        where: { id: contact.id },
        data: { consentStatus: ConsentStatus.opted_in, consentUpdatedAt: new Date() },
      }),
      prisma.conversationParticipant.updateMany({
        where: {
          conversationId: params.conversationId,
          contactId: params.contactId,
        },
        data: { status: ParticipantStatus.active },
      }),
      prisma.consentEvent.create({
        data: {
          contactId: contact.id,
          messageId: queuedMessage.id,
          userId: params.userId,
          type: ConsentEventType.group_intro_sent,
          twilioSid: result.sid,
        },
      }),
      prisma.conversation.update({
        where: { id: params.conversationId },
        data: { lastMessageAt: new Date(), status: ConversationStatus.awaiting_reply },
      }),
    ]);

    await maybeActivateTwilioGroup(params.conversationId);
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to send intro.";
    await prisma.$transaction([
      prisma.message.update({
        where: { id: queuedMessage.id },
        data: { status: MessageStatus.failed, errorMessage: message },
      }),
      prisma.consentEvent.create({
        data: {
          contactId: contact.id,
          messageId: queuedMessage.id,
          userId: params.userId,
          type: ConsentEventType.intro_failed,
          detail: message,
        },
      }),
    ]);
    return { ok: false, error: message };
  }
}
```

- [ ] **Step 3: Run lint + test**

Run: `npm run lint && npm run test`

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add lib/group-conversations.ts lib/validators.ts
git commit -m "feat: add Twilio group activation and consent intro helpers"
```

---

## Task 5: Create group API

**Files:**
- Create: `app/api/conversations/group/route.ts`

- [ ] **Step 1: Implement route**

```typescript
import { ConsentStatus, ConversationStatus, ConversationType, ParticipantStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api-auth";
import { buildDefaultGroupTitle, maybeActivateTwilioGroup, sendGroupConsentIntro } from "@/lib/group-conversations";
import { createGroupConversationSchema } from "@/lib/validators";

export async function POST(request: Request) {
  const authResult = await requireSession();
  if ("error" in authResult) {
    return authResult.error;
  }

  const payload = await request.json();
  const parsed = createGroupConversationSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const uniqueContactIds = [...new Set(parsed.data.contactIds)];
  const contacts = await prisma.contact.findMany({
    where: { id: { in: uniqueContactIds } },
  });

  if (contacts.length !== uniqueContactIds.length) {
    return NextResponse.json({ error: "One or more contacts were not found." }, { status: 400 });
  }

  const optedOut = contacts.filter((c) => c.consentStatus === ConsentStatus.opted_out);
  if (optedOut.length > 0) {
    return NextResponse.json(
      {
        error: "One or more contacts have opted out and cannot be added to a group.",
        code: "consent_opted_out",
        contacts: optedOut.map((c) => ({ id: c.id, name: c.name, phone: c.phone })),
      },
      { status: 409 },
    );
  }

  const title = parsed.data.title?.trim() || buildDefaultGroupTitle(contacts);

  const conversation = await prisma.conversation.create({
    data: {
      type: ConversationType.group,
      title,
      assignedToId: authResult.session.user.id,
      status: ConversationStatus.new,
      participants: {
        create: contacts.map((contact) => ({
          contactId: contact.id,
          status:
            contact.consentStatus === ConsentStatus.opted_in
              ? ParticipantStatus.active
              : ParticipantStatus.pending_intro,
        })),
      },
    },
    include: {
      participants: { include: { contact: true } },
      assignedTo: { select: { id: true, name: true } },
      messages: { orderBy: { createdAt: "asc" } },
    },
  });

  for (const participant of conversation.participants) {
    if (participant.status === ParticipantStatus.pending_intro) {
      await sendGroupConsentIntro({
        conversationId: conversation.id,
        contactId: participant.contactId,
        userId: authResult.session.user.id,
      });
    }
  }

  await maybeActivateTwilioGroup(conversation.id);

  const full = await prisma.conversation.findUnique({
    where: { id: conversation.id },
    include: {
      participants: { include: { contact: true } },
      assignedTo: { select: { id: true, name: true } },
      messages: { orderBy: { createdAt: "asc" } },
    },
  });

  return NextResponse.json({ conversation: full }, { status: 201 });
}
```

- [ ] **Step 2: Run build**

Run: `npm run build`

Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add app/api/conversations/group/route.ts
git commit -m "feat: add POST /api/conversations/group"
```

---

## Task 6: Group outbound messages API

**Files:**
- Create: `app/api/conversations/[id]/messages/route.ts`

- [ ] **Step 1: Implement route**

```typescript
import { ConversationStatus, ConversationType, MessageDirection, MessageStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api-auth";
import { isGroupReadyForMessages } from "@/lib/group-conversations";
import { getTwilioClient, getTwilioGroupProjectedAddress } from "@/lib/twilio";
import { sendGroupMessageSchema } from "@/lib/validators";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireSession();
  if ("error" in authResult) {
    return authResult.error;
  }

  const { id } = await params;
  const payload = await request.json();
  const parsed = sendGroupMessageSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const conversation = await prisma.conversation.findUnique({ where: { id } });
  if (!conversation || conversation.archivedAt || conversation.type !== ConversationType.group) {
    return NextResponse.json({ error: "Group conversation not found." }, { status: 404 });
  }

  if (!isGroupReadyForMessages(conversation.twilioConversationSid)) {
    return NextResponse.json(
      {
        error: "Group is not ready — waiting for participant opt-in.",
        code: "group_not_ready",
      },
      { status: 409 },
    );
  }

  const projectedAddress = conversation.twilioProjectedAddress ?? getTwilioGroupProjectedAddress();
  const { body } = parsed.data;

  const queuedMessage = await prisma.message.create({
    data: {
      conversationId: conversation.id,
      userId: authResult.session.user.id,
      body,
      direction: MessageDirection.outbound,
      status: MessageStatus.queued,
      twilioConversationSid: conversation.twilioConversationSid,
    },
  });

  try {
    const result = await getTwilioClient().conversations.v1
      .conversations(conversation.twilioConversationSid!)
      .messages.create({ author: projectedAddress, body });

    const savedMessage = await prisma.message.update({
      where: { id: queuedMessage.id },
      data: { twilioSid: result.sid, status: MessageStatus.sent },
    });

    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { lastMessageAt: new Date(), status: ConversationStatus.awaiting_reply },
    });

    return NextResponse.json({ message: savedMessage, conversationId: conversation.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to send group message.";
    await prisma.message.update({
      where: { id: queuedMessage.id },
      data: { status: MessageStatus.failed, errorMessage: message },
    });
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/conversations/[id]/messages/route.ts
git commit -m "feat: add group outbound messages API"
```

---

## Task 7: Conversations webhook (inbound + STOP)

**Files:**
- Create: `lib/conversations-webhook.ts`
- Create: `lib/conversations-webhook.test.ts`
- Create: `app/api/webhooks/conversations/route.ts`
- Modify: `lib/group-conversations.ts` — add `removeGroupParticipantOnStop`

- [ ] **Step 1: Add webhook parse helpers + tests**

Create `lib/conversations-webhook.ts`:

```typescript
export type ConversationsMessageAddedEvent = {
  EventType: "onMessageAdded";
  ConversationSid: string;
  MessageSid: string;
  Author: string;
  Body: string;
  ParticipantSid?: string;
};

export function parseConversationsEvent(raw: string): ConversationsMessageAddedEvent | null {
  try {
    const parsed = JSON.parse(raw) as Partial<ConversationsMessageAddedEvent>;
    if (parsed.EventType !== "onMessageAdded") {
      return null;
    }
    if (!parsed.ConversationSid || !parsed.MessageSid || !parsed.Author || parsed.Body === undefined) {
      return null;
    }
    return parsed as ConversationsMessageAddedEvent;
  } catch {
    return null;
  }
}

export function isProjectedAddressAuthor(author: string, projectedAddress: string): boolean {
  return author === projectedAddress;
}
```

Create `lib/conversations-webhook.test.ts` with tests for `parseConversationsEvent` and `isProjectedAddressAuthor`.

Run: `npm run test -- lib/conversations-webhook.test.ts`

- [ ] **Step 2: Add STOP removal to `lib/group-conversations.ts`**

```typescript
import { matchStopKeyword } from "@/lib/consent";

export async function removeGroupParticipantOnStop(params: {
  conversationId: string;
  contactId: string;
  twilioParticipantSid: string | null;
  twilioConversationSid: string;
  contactName: string | null;
}): Promise<void> {
  const client = getTwilioClient();

  if (params.twilioParticipantSid) {
    try {
      await client.conversations.v1
        .conversations(params.twilioConversationSid)
        .participants(params.twilioParticipantSid)
        .remove();
    } catch {
      // Participant may already be removed on Twilio side.
    }
  }

  const displayName = params.contactName ?? "Contact";

  await prisma.$transaction([
    prisma.conversationParticipant.updateMany({
      where: { conversationId: params.conversationId, contactId: params.contactId },
      data: { status: ParticipantStatus.removed, removedAt: new Date() },
    }),
    prisma.contact.update({
      where: { id: params.contactId },
      data: { consentStatus: ConsentStatus.opted_out, consentUpdatedAt: new Date() },
    }),
    prisma.consentEvent.create({
      data: {
        contactId: params.contactId,
        type: ConsentEventType.opted_out,
        detail: `STOP in group ${params.conversationId}`,
      },
    }),
    prisma.message.create({
      data: {
        conversationId: params.conversationId,
        body: `${displayName} left the group (STOP).`,
        direction: MessageDirection.inbound,
        status: MessageStatus.received,
        isSystemNote: true,
        twilioConversationSid: params.twilioConversationSid,
      },
    }),
  ]);
}

export function shouldTreatAsGroupStop(body: string): boolean {
  return matchStopKeyword(body) !== null;
}
```

- [ ] **Step 3: Create webhook route**

Create `app/api/webhooks/conversations/route.ts`:

```typescript
import { ConversationStatus, ConversationType, MessageDirection, MessageStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getTwilioGroupProjectedAddress,
} from "@/lib/twilio";
import {
  getWebhookRequestUrl,
  validateTwilioWebhookRequest,
} from "@/lib/voice/webhook";
import {
  isProjectedAddressAuthor,
  parseConversationsEvent,
} from "@/lib/conversations-webhook";
import { removeGroupParticipantOnStop, shouldTreatAsGroupStop } from "@/lib/group-conversations";

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-twilio-signature");
  const url = getWebhookRequestUrl(request);

  const valid = validateTwilioWebhookRequest({
    signature,
    url,
    params: { body: rawBody },
  });

  if (!valid) {
    return NextResponse.json({ error: "Invalid signature." }, { status: 403 });
  }

  const event = parseConversationsEvent(rawBody);
  if (!event) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const projectedAddress = getTwilioGroupProjectedAddress();
  if (isProjectedAddressAuthor(event.Author, projectedAddress)) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const conversation = await prisma.conversation.findFirst({
    where: { twilioConversationSid: event.ConversationSid, type: ConversationType.group },
    include: {
      participants: {
        include: { contact: true },
      },
    },
  });

  if (!conversation) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const existing = await prisma.message.findFirst({
    where: { twilioSid: event.MessageSid },
    select: { id: true },
  });
  if (existing) {
    return NextResponse.json({ ok: true, deduplicated: true });
  }

  const participant = conversation.participants.find(
    (p) =>
      p.twilioParticipantSid === event.ParticipantSid ||
      p.contact.phone === event.Author,
  );

  if (!participant) {
    console.warn("Inbound group message from unknown participant:", event.Author);
    return NextResponse.json({ ok: true, ignored: true });
  }

  if (shouldTreatAsGroupStop(event.Body)) {
    await removeGroupParticipantOnStop({
      conversationId: conversation.id,
      contactId: participant.contactId,
      twilioParticipantSid: participant.twilioParticipantSid,
      twilioConversationSid: conversation.twilioConversationSid!,
      contactName: participant.contact.name,
    });
    return NextResponse.json({ ok: true, stopHandled: true });
  }

  await prisma.$transaction([
    prisma.message.create({
      data: {
        conversationId: conversation.id,
        body: event.Body,
        direction: MessageDirection.inbound,
        status: MessageStatus.received,
        twilioSid: event.MessageSid,
        twilioConversationSid: event.ConversationSid,
        authorPhone: event.Author,
      },
    }),
    prisma.conversation.update({
      where: { id: conversation.id },
      data: { lastMessageAt: new Date(), status: ConversationStatus.replied },
    }),
  ]);

  return NextResponse.json({ ok: true });
}
```

> **Note:** Twilio JSON webhook signature validation may require passing the raw body string. If signature validation fails in testing, check [Twilio webhook security docs](https://www.twilio.com/docs/usage/webhooks/webhooks-security) for JSON body validation and adjust `validateTwilioWebhookRequest` call accordingly.

- [ ] **Step 4: Run tests + build**

Run: `npm run test && npm run build`

- [ ] **Step 5: Commit**

```bash
git add lib/conversations-webhook.ts lib/conversations-webhook.test.ts lib/group-conversations.ts app/api/webhooks/conversations/route.ts
git commit -m "feat: add Conversations webhook with inbound and STOP handling"
```

---

## Task 8: Fix sms-status for group intros + list/detail APIs

**Files:**
- Modify: `app/api/webhooks/sms-status/route.ts`
- Modify: `app/api/conversations/route.ts`
- Modify: `app/api/conversations/[id]/route.ts`

- [ ] **Step 1: Fix contactId resolution in sms-status**

In `app/api/webhooks/sms-status/route.ts`, replace the intro delivery block's `contactId: message.conversation.contactId` lookup with:

```typescript
  const consentContact = await prisma.consentEvent.findFirst({
    where: {
      messageId: message.id,
      type: { in: [ConsentEventType.intro_sent, ConsentEventType.group_intro_sent] },
    },
    select: { contactId: true },
  });

  const contactId = consentContact?.contactId ?? message.conversation.contactId;
```

Use `contactId` (guard null) when creating delivery events. Skip if `contactId` is null.

- [ ] **Step 2: Update conversation list GET**

In `app/api/conversations/route.ts`:

1. Extend `include` with `participants: { include: { contact: true } }`.
2. Extend search `OR` with:
   ```typescript
   { title: { contains: query, mode: "insensitive" } },
   { participants: { some: { contact: { name: { contains: query, mode: "insensitive" } } } } },
   { participants: { some: { contact: { phone: { contains: query } } } } },
   ```

- [ ] **Step 3: Update conversation detail GET**

In `app/api/conversations/[id]/route.ts`, add to `include`:

```typescript
participants: {
  include: { contact: true },
  orderBy: { createdAt: "asc" },
},
```

- [ ] **Step 4: Commit**

```bash
git add app/api/webhooks/sms-status/route.ts app/api/conversations/route.ts app/api/conversations/[id]/route.ts
git commit -m "fix: group intro delivery events and include participants in conversation APIs"
```

---

## Task 9: Group UI components

**Files:**
- Create: `components/caretext/NewGroupConversationModal.tsx`
- Create: `components/caretext/GroupParticipantsPanel.tsx`
- Create: `components/caretext/GroupComposerArea.tsx`

- [ ] **Step 1: Create `NewGroupConversationModal.tsx`**

Modal with:
- Optional title input.
- Searchable contact list from `GET /api/contacts` (checkboxes, 2–9 selected).
- Submit → `POST /api/conversations/group` → `onCreated(conversationId)`.
- Show 409 opted-out errors inline.

- [ ] **Step 2: Create `GroupParticipantsPanel.tsx`**

Props: `participants: Array<{ contact: { name, phone }, status }>`.

Render chips: **Active** (green), **Pending opt-in** (amber), **Removed** (gray).

- [ ] **Step 3: Create `GroupComposerArea.tsx`**

Props: `conversationId`, `twilioConversationSid`, `participants`, `templates`, `onSend`, `onRefresh`.

Logic:
- If `!twilioConversationSid` → disabled box listing pending participant names.
- Else → reuse `MessageComposer` but `onSend` calls group messages API.

- [ ] **Step 4: Commit**

```bash
git add components/caretext/NewGroupConversationModal.tsx components/caretext/GroupParticipantsPanel.tsx components/caretext/GroupComposerArea.tsx
git commit -m "feat: add group conversation UI components"
```

---

## Task 10: Wire dashboard + thread display

**Files:**
- Modify: `components/caretext/DashboardClient.tsx`
- Modify: `components/caretext/ConversationListItem.tsx`
- Modify: `components/caretext/ConversationHeader.tsx`
- Modify: `components/caretext/MessageThread.tsx`
- Modify: `components/caretext/MessageBubble.tsx` (if needed for author label)

- [ ] **Step 1: Extend types in `DashboardClient.tsx`**

Add to conversation types:
- `type: "direct" | "group"`
- `title?: string | null`
- `twilioConversationSid?: string | null`
- `participants?: Array<{ status: string; contact: { id, name, phone, consentStatus } }>`

- [ ] **Step 2: Add New Group button + modal state**

Next to existing New Conversation control, add button opening `NewGroupConversationModal`. On create → `setConversationId`, `loadConversations()`, `loadConversationDetail()`.

- [ ] **Step 3: Branch composer**

When `activeConversation.type === "group"`, render `GroupComposerArea` instead of `ConversationComposerArea`. Group send:

```typescript
await fetch(`/api/conversations/${id}/messages`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ body }),
});
```

- [ ] **Step 4: Update list item**

Pass `isGroup`, `title`, `participantCount` to `ConversationListItem`. Show users icon + count for groups; use `title` as primary label.

- [ ] **Step 5: Update header for groups**

When group: show `title`, `GroupParticipantsPanel`, hide single-phone Call button (or disable with tooltip — group voice out of scope).

- [ ] **Step 6: Show inbound author on group messages**

Extend `MessageThread` message type with optional `authorPhone` and `isSystemNote`. System notes: centered muted text. Inbound group messages: show small label above bubble with contact name from `authorPhone`.

- [ ] **Step 7: Run lint + build**

Run: `npm run lint && npm run build`

- [ ] **Step 8: Commit**

```bash
git add components/caretext/DashboardClient.tsx components/caretext/ConversationListItem.tsx components/caretext/ConversationHeader.tsx components/caretext/MessageThread.tsx
git commit -m "feat: wire group messaging into dashboard UI"
```

---

## Task 11: Embed inbox parity

**Files:**
- Modify: `components/caretext/EmbedInboxClient.tsx`

- [ ] **Step 1: Add New Group button + same modal/handlers as dashboard**

Mirror Task 10 changes in the slimmer embed client (no contact sidebar).

- [ ] **Step 2: Commit**

```bash
git add components/caretext/EmbedInboxClient.tsx
git commit -m "feat: add group messaging to embed inbox"
```

---

## Task 12: Documentation + manual QA

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add Twilio Conversations section to README**

Document:
- New env vars.
- Conversations Service + Messaging Service + projected address setup.
- Webhook URL for `/api/webhooks/conversations`.
- Phase 0 spike command.
- Group MMS participant limit (10).

- [ ] **Step 2: Manual QA checklist**

- [ ] Spike passed on real phones.
- [ ] Create group with 3 opted-in contacts → native group MMS.
- [ ] Create group with 1 `none` + 2 `opted_in` → intro sent, group activates when ready.
- [ ] Opted-out contact in picker → 409.
- [ ] Send/receive in group thread with correct author labels.
- [ ] STOP removes participant + system note + global opt-out.
- [ ] 1:1 send/receive/consent still works.
- [ ] Embed inbox group flow works.

- [ ] **Step 3: Final commit**

```bash
git add README.md
git commit -m "docs: add group messaging setup and QA checklist"
```

---

## Spec Coverage Self-Review

| Spec requirement | Task |
|---|---|
| Parallel 1:1 + group stack | Tasks 5–7 (group only); 1:1 untouched |
| Verification spike gate | Task 0 |
| Schema changes | Task 1 |
| Intro gate via 1:1 SMS | Task 4 `sendGroupConsentIntro` |
| POST /api/conversations/group | Task 5 |
| POST /api/conversations/[id]/messages | Task 6 |
| Conversations webhook + STOP | Task 7 |
| System note on STOP | Task 7 `isSystemNote` message |
| List/detail include participants | Task 8 |
| New Group UI + composer gating | Tasks 9–10 |
| Embed inbox | Task 11 |
| Env + README | Task 0, Task 12 |
| sms-status fix for group intros | Task 8 |

No placeholder steps. Type names consistent across tasks.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-19-group-messaging.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — I execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
