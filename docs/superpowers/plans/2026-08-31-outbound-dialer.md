# Outbound Dialer & Shared Call Log Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let staff dial any number from a header modal and review all inbound/outbound calls on `/calls`, attaching a log to a conversation only when an active contact already has an open direct thread.

**Architecture:** Extend the existing Twilio browser voice stack. A shared `resolveCallAttachment` helper decides whether `CallLog.conversationId` is set. Initiate accepts `{ phone }` only; inbound stops calling `ensureOpenPhoneConversation`. A dialer modal and Calls page sit on the current `VoiceCallProvider` / Call bar.

**Tech Stack:** Next.js 16 App Router, Prisma 6, Twilio Voice SDK, Zod, Vitest, React 19

**Spec:** `docs/superpowers/specs/2026-08-31-outbound-dialer-design.md`

## Global Constraints

- No Prisma schema change (`CallLog.conversationId` is already optional).
- Attach a call only when an **active** contact (`deletedAt` null) has an **open direct** thread (`archivedAt` null, `status` not `closed`, `contactId` set).
- Soft-deleted contacts are unknown: do not restore, do not attach, do not create a thread.
- Never create a contact or conversation from initiate or inbound voice.
- Do not backfill `conversationId` after Save contact.
- Do not change embed inbox (`app/(embed)/**`, `EmbedInboxClient`).
- Save contact only on `/calls` after the call is not active.
- Shared facility log (all staff), newest `startedAt` first, default 50 rows, max 100.
- Thread Call (`{ conversationId, phone }`) and per-conversation `CallLogsPanel` stay.

---

## File Map

| File | Responsibility |
|---|---|
| `lib/voice/call-attachment.ts` | Lookup active contact + open direct thread |
| `lib/voice/call-attachment.test.ts` | Attachment rules (mocked Prisma) |
| `lib/voice/incoming-invite.ts` | `completeIncomingInvite` — `conversationId` optional |
| `lib/voice/incoming-invite.test.ts` | Invite complete without a thread |
| `lib/voice/twiml.ts` | Omit inbound `conversationId` TwiML param when null |
| `lib/voice/twiml.test.ts` | Optional conversationId case |
| `lib/voice/call-log-list.ts` | List limit parse + decorate rows with current contact |
| `lib/voice/call-log-list.test.ts` | Limit and decorate |
| `lib/dialer.ts` | Keypad append/backspace, display format, can-call |
| `lib/dialer.test.ts` | Dialer helpers |
| `lib/validators.ts` | `initiateCallSchema.conversationId` optional |
| `lib/validators-call.test.ts` | Initiate schema cases |
| `app/api/calls/initiate/route.ts` | Phone-only path uses attachment helper |
| `app/api/calls/route.ts` | `GET` shared call list |
| `app/api/webhooks/voice/incoming/route.ts` | No `ensureOpenPhoneConversation` |
| `app/api/contacts/route.ts` | Exact `phone=` query |
| `components/caretext/VoiceCallProvider.tsx` | Optional `conversationId` on start/accept |
| `components/caretext/VoiceShell.tsx` | Wrap `DialerProvider`; navigate only when a thread exists |
| `components/caretext/DialerProvider.tsx` | Open/close dialer from header |
| `components/caretext/DialerModal.tsx` | Keypad modal |
| `components/caretext/TopNav.tsx` | New Call + Calls |
| `app/(protected)/calls/page.tsx` | Calls route |
| `components/caretext/CallsPageClient.tsx` | Shared log, redial, Save contact |

---

### Task 1: Call attachment helper

**Files:**
- Create: `lib/voice/call-attachment.ts`
- Test: `lib/voice/call-attachment.test.ts`

**Interfaces:**
- Consumes: `prisma.contact.findFirst`, `prisma.conversation.findFirst`, `ACTIVE_CONTACT_WHERE`, `ConversationStatus.closed`
- Produces: `resolveCallAttachment(normalizedPhone: string): Promise<CallAttachment>` where `CallAttachment` is `{ conversationId: string | null; contactId: string | null; contactName: string | null }`

- [ ] **Step 1: Write the failing tests**

Create `lib/voice/call-attachment.test.ts`:

```typescript
import { ConversationStatus } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const contactFindFirst = vi.fn();
const conversationFindFirst = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    contact: {
      findFirst: (...args: unknown[]) => contactFindFirst(...args),
    },
    conversation: {
      findFirst: (...args: unknown[]) => conversationFindFirst(...args),
    },
  },
}));

import { resolveCallAttachment } from "@/lib/voice/call-attachment";

describe("resolveCallAttachment", () => {
  beforeEach(() => {
    contactFindFirst.mockReset();
    conversationFindFirst.mockReset();
  });

  it("attaches to an active contact with an open direct thread", async () => {
    contactFindFirst.mockResolvedValue({ id: "contact-1", name: "Ada" });
    conversationFindFirst.mockResolvedValue({ id: "conv-1" });

    await expect(resolveCallAttachment("+15551234567")).resolves.toEqual({
      conversationId: "conv-1",
      contactId: "contact-1",
      contactName: "Ada",
    });

    expect(contactFindFirst).toHaveBeenCalledWith({
      where: { phone: "+15551234567", deletedAt: null },
      select: { id: true, name: true },
    });
    expect(conversationFindFirst).toHaveBeenCalledWith({
      where: {
        contactId: "contact-1",
        status: { not: ConversationStatus.closed },
        archivedAt: null,
      },
      orderBy: { lastMessageAt: "desc" },
      select: { id: true },
    });
  });

  it("returns a contact without a conversation when there is no open thread", async () => {
    contactFindFirst.mockResolvedValue({ id: "contact-1", name: "Ada" });
    conversationFindFirst.mockResolvedValue(null);

    await expect(resolveCallAttachment("+15551234567")).resolves.toEqual({
      conversationId: null,
      contactId: "contact-1",
      contactName: "Ada",
    });
  });

  it("returns empty attachment when no active contact exists", async () => {
    contactFindFirst.mockResolvedValue(null);

    await expect(resolveCallAttachment("+15551234567")).resolves.toEqual({
      conversationId: null,
      contactId: null,
      contactName: null,
    });
    expect(conversationFindFirst).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/voice/call-attachment.test.ts`

Expected: FAIL — `Cannot find module '@/lib/voice/call-attachment'`

- [ ] **Step 3: Write the helper**

Create `lib/voice/call-attachment.ts`:

```typescript
import { ConversationStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type CallAttachment = {
  conversationId: string | null;
  contactId: string | null;
  contactName: string | null;
};

export async function resolveCallAttachment(normalizedPhone: string): Promise<CallAttachment> {
  const contact = await prisma.contact.findFirst({
    where: { phone: normalizedPhone, deletedAt: null },
    select: { id: true, name: true },
  });

  if (!contact) {
    return { conversationId: null, contactId: null, contactName: null };
  }

  const conversation = await prisma.conversation.findFirst({
    where: {
      contactId: contact.id,
      status: { not: ConversationStatus.closed },
      archivedAt: null,
    },
    orderBy: { lastMessageAt: "desc" },
    select: { id: true },
  });

  return {
    conversationId: conversation?.id ?? null,
    contactId: contact.id,
    contactName: contact.name,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/voice/call-attachment.test.ts`

Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/voice/call-attachment.ts lib/voice/call-attachment.test.ts
git commit -m "feat: resolve call attachment without creating contacts"
```

---

### Task 2: Initiate schema and phone-only route

**Files:**
- Modify: `lib/validators.ts` (`initiateCallSchema`)
- Create: `lib/validators-call.test.ts`
- Modify: `app/api/calls/initiate/route.ts`

**Interfaces:**
- Consumes: `resolveCallAttachment`, existing `activeCallWhere` / `expireStaleActiveCalls`
- Produces: `initiateCallSchema` with optional `conversationId`. Phone-only `POST /api/calls/initiate` returns `{ callLogId, conversationId, contactName }`. Thread path still requires a matching conversation.

- [ ] **Step 1: Write the failing schema tests**

Create `lib/validators-call.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { initiateCallSchema } from "@/lib/validators";

describe("initiateCallSchema", () => {
  it("accepts phone only", () => {
    const parsed = initiateCallSchema.safeParse({ phone: "+15551234567" });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.conversationId).toBeUndefined();
    }
  });

  it("still accepts conversationId with phone", () => {
    const parsed = initiateCallSchema.safeParse({
      conversationId: "550e8400-e29b-41d4-a716-446655440000",
      phone: "+15551234567",
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects an invalid phone", () => {
    expect(initiateCallSchema.safeParse({ phone: "123" }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/validators-call.test.ts`

Expected: FAIL — phone-only parse fails because `conversationId` is required.

- [ ] **Step 3: Make `conversationId` optional**

In `lib/validators.ts`, replace `initiateCallSchema` with:

```typescript
export const initiateCallSchema = z.object({
  conversationId: z.string().uuid().optional(),
  phone: z.string().min(8).refine((value) => isValidPhoneNumber(value), "Invalid phone number."),
});
```

- [ ] **Step 4: Run schema tests**

Run: `npx vitest run lib/validators-call.test.ts`

Expected: PASS

- [ ] **Step 5: Update `POST /api/calls/initiate`**

Replace `app/api/calls/initiate/route.ts` with:

```typescript
import { CallDirection, CallMode, CallStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { normalizePhoneNumber } from "@/lib/phone";
import { resolveCallAttachment } from "@/lib/voice/call-attachment";
import { activeCallWhere, expireStaleActiveCalls } from "@/lib/voice/calls";
import { initiateCallSchema } from "@/lib/validators";

export async function POST(request: Request) {
  const authResult = await requireSession();
  if ("error" in authResult) {
    return authResult.error;
  }

  const payload = await request.json();
  const parsed = initiateCallSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const normalizedPhone = normalizePhoneNumber(parsed.data.phone);
  let conversationId: string | null = null;
  let contactName: string | null = null;

  if (parsed.data.conversationId) {
    const conversation = await prisma.conversation.findFirst({
      where: {
        id: parsed.data.conversationId,
        archivedAt: null,
        contact: { phone: normalizedPhone },
      },
      select: {
        id: true,
        contact: { select: { name: true } },
      },
    });

    if (!conversation) {
      return NextResponse.json({ error: "Conversation not found for phone." }, { status: 404 });
    }

    conversationId = conversation.id;
    contactName = conversation.contact?.name ?? null;
  } else {
    const attachment = await resolveCallAttachment(normalizedPhone);
    conversationId = attachment.conversationId;
    contactName = attachment.contactName;
  }

  await expireStaleActiveCalls(authResult.session.user.id);

  const activeCall = await prisma.callLog.findFirst({
    where: activeCallWhere(authResult.session.user.id),
    select: { id: true },
  });

  if (activeCall) {
    return NextResponse.json({ error: "You already have an active call." }, { status: 409 });
  }

  const callLog = await prisma.callLog.create({
    data: {
      conversationId,
      phone: normalizedPhone,
      initiatedById: authResult.session.user.id,
      direction: CallDirection.outbound,
      mode: CallMode.browser,
      status: CallStatus.initiating,
      startedAt: new Date(),
    },
  });

  return NextResponse.json(
    { callLogId: callLog.id, conversationId, contactName },
    { status: 201 },
  );
}
```

- [ ] **Step 6: Re-run attachment + schema tests**

Run: `npx vitest run lib/voice/call-attachment.test.ts lib/validators-call.test.ts`

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add lib/validators.ts lib/validators-call.test.ts app/api/calls/initiate/route.ts
git commit -m "feat: allow initiating browser calls with phone only"
```

---

### Task 3: Inbound voice without auto-creating contacts

**Files:**
- Modify: `app/api/webhooks/voice/incoming/route.ts`

**Interfaces:**
- Consumes: `resolveCallAttachment` from Task 1; existing TwiML / presence helpers
- Produces: Inbound `CallLog` with `conversationId` only when attachment finds an open thread. No `ensureOpenPhoneConversation`. Escalate / `lastMessageAt` only when attached.

- [ ] **Step 1: Replace the incoming webhook body**

`app/api/webhooks/voice/incoming/route.ts` today imports `ensureOpenPhoneConversation` and always upserts a contact. Replace that import and the handler middle with attachment lookup.

Keep signature validation, `From` / `CallSid` guards, and `normalizePhoneNumber` as they are. After `normalizedPhone` is known, use this flow (do not call `ensureOpenPhoneConversation`):

```typescript
import { resolveCallAttachment } from "@/lib/voice/call-attachment";

  const attachment = await resolveCallAttachment(normalizedPhone);

  if (attachment.conversationId) {
    await prisma.conversation.update({
      where: { id: attachment.conversationId },
      data: { lastMessageAt: new Date() },
    });
  }

  const callLog = await prisma.callLog.create({
    data: {
      conversationId: attachment.conversationId,
      phone: normalizedPhone,
      twilioSid: callSid,
      direction: CallDirection.inbound,
      mode: CallMode.browser,
      status: CallStatus.ringing,
      startedAt: new Date(),
    },
  });

  const identities = await listInboundRingIdentities();
  if (identities.length === 0) {
    await prisma.callLog.update({
      where: { id: callLog.id },
      data: {
        status: CallStatus.no_answer,
        endedAt: new Date(),
        outcome: "no-staff",
      },
    });
    if (attachment.conversationId) {
      await prisma.conversation.update({
        where: { id: attachment.conversationId },
        data: {
          status: ConversationStatus.escalated,
          lastMessageAt: new Date(),
        },
      });
    }
    return twimlResponse(buildHangupTwiml());
  }

  const twiml = buildInboundClientDialTwiml({
    identities,
    callLogId: callLog.id,
    conversationId: attachment.conversationId,
    contactName: attachment.contactName,
    phone: normalizedPhone,
    actionUrl: inboundResultActionUrl(url, callLog.id),
  });

  return twimlResponse(twiml);
```

Remove the unused `ensureOpenPhoneConversation` import. `ConversationStatus` stays for the attached missed-call escalate path.

Widen `buildInboundClientDialTwiml`’s `conversationId` type to `string | null | undefined` in this task so the route typechecks. Task 4 adds the test and omits the TwiML parameter when it is null.

- [ ] **Step 2: Confirm incoming-result already gates escalation**

`app/api/webhooks/voice/incoming-result/route.ts` already wraps escalate in `if (callLog.conversationId && shouldEscalateConversationForMissedInbound(...))`. Do not change it.

- [ ] **Step 3: Run existing inbound / attachment tests**

Run: `npx vitest run lib/voice/inbound.test.ts lib/voice/call-attachment.test.ts`

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add app/api/webhooks/voice/incoming/route.ts
git commit -m "fix: stop auto-creating contacts on unknown inbound calls"
```

---

### Task 4: Optional conversationId on inbound TwiML and invites

**Files:**
- Modify: `lib/voice/twiml.ts` (`buildInboundClientDialTwiml` input)
- Modify: `lib/voice/twiml.test.ts`
- Modify: `lib/voice/incoming-invite.ts`
- Modify: `lib/voice/incoming-invite.test.ts`

**Interfaces:**
- Consumes: existing TwiML builder
- Produces: `conversationId?: string | null` on `buildInboundClientDialTwiml`. `completeIncomingInvite(parsed, ringing) => CompletedIncomingInvite | null` requiring only `callLogId` + `phone`.

- [ ] **Step 1: Write the failing TwiML and invite tests**

Add to `lib/voice/twiml.test.ts` inside `describe("buildInboundClientDialTwiml")`:

```typescript
  it("omits conversationId when the inbound call has no thread", () => {
    const xml = buildInboundClientDialTwiml({
      identities: ["user-1"],
      callLogId: "log-2",
      conversationId: null,
      phone: "+15559876543",
      actionUrl: "https://app.example.com/api/webhooks/voice/incoming-result?callLogId=log-2",
    });

    expect(xml).toContain('name="callLogId"');
    expect(xml).toContain('value="log-2"');
    expect(xml).not.toContain('name="conversationId"');
    expect(xml).toContain('name="phone"');
  });
```

Add to `lib/voice/incoming-invite.test.ts`:

```typescript
import { completeIncomingInvite, parseIncomingInvite } from "@/lib/voice/incoming-invite";

describe("completeIncomingInvite", () => {
  it("accepts a ringing fallback without conversationId", () => {
    expect(
      completeIncomingInvite(
        parseIncomingInvite({
          customParameters: new Map([
            ["callLogId", "log-9"],
            ["phone", "+15551112222"],
          ]),
        }),
      ),
    ).toEqual({
      callLogId: "log-9",
      conversationId: null,
      phone: "+15551112222",
      contactName: null,
    });
  });

  it("returns null without callLogId or phone", () => {
    expect(completeIncomingInvite(parseIncomingInvite({}))).toBeNull();
  });

  it("fills missing fields from the ringing endpoint payload", () => {
    expect(
      completeIncomingInvite(parseIncomingInvite({}), {
        callLogId: "log-3",
        conversationId: null,
        phone: "+15550001111",
        contactName: null,
      }),
    ).toEqual({
      callLogId: "log-3",
      conversationId: null,
      phone: "+15550001111",
      contactName: null,
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/voice/twiml.test.ts lib/voice/incoming-invite.test.ts`

Expected: FAIL — `conversationId: null` is not assignable / `completeIncomingInvite` is not exported.

- [ ] **Step 3: Update TwiML builder**

In `lib/voice/twiml.ts`, change the input type and parameter loop:

```typescript
export function buildInboundClientDialTwiml(input: {
  identities: string[];
  callLogId: string;
  conversationId?: string | null;
  contactName?: string | null;
  phone: string;
  actionUrl: string;
}): string {
  const response = new twilio.twiml.VoiceResponse();
  const dial = response.dial({
    timeout: INBOUND_DIAL_TIMEOUT_SECONDS,
    answerOnBridge: true,
    action: input.actionUrl,
    method: "POST",
  });

  for (const identity of input.identities) {
    const client = dial.client();
    client.identity(identity);
    client.parameter({ name: "callLogId", value: input.callLogId });
    if (input.conversationId) {
      client.parameter({ name: "conversationId", value: input.conversationId });
    }
    client.parameter({ name: "contactName", value: input.contactName ?? "" });
    client.parameter({ name: "phone", value: input.phone });
  }

  return response.toString();
}
```

If Task 3 passed `""`, switch incoming webhook to pass `attachment.conversationId` (nullable) now.

- [ ] **Step 4: Add `completeIncomingInvite`**

Add to `lib/voice/incoming-invite.ts` (keep `parseIncomingInvite` unchanged):

```typescript
export type CompletedIncomingInvite = {
  callLogId: string;
  conversationId: string | null;
  phone: string;
  contactName: string | null;
};

export function completeIncomingInvite(
  parsed: IncomingInviteInfo,
  ringing?: {
    callLogId?: string;
    conversationId?: string | null;
    phone?: string;
    contactName?: string | null;
  } | null,
): CompletedIncomingInvite | null {
  const callLogId = parsed.callLogId ?? ringing?.callLogId;
  const phone = parsed.phone ?? ringing?.phone;
  if (!callLogId || !phone) {
    return null;
  }

  return {
    callLogId,
    conversationId: parsed.conversationId ?? ringing?.conversationId ?? null,
    phone,
    contactName: parsed.contactName ?? ringing?.contactName ?? null,
  };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run lib/voice/twiml.test.ts lib/voice/incoming-invite.test.ts`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add lib/voice/twiml.ts lib/voice/twiml.test.ts lib/voice/incoming-invite.ts lib/voice/incoming-invite.test.ts app/api/webhooks/voice/incoming/route.ts
git commit -m "feat: allow inbound voice invites without a conversation"
```

---

### Task 5: Voice client accepts conversation-less calls

**Files:**
- Modify: `components/caretext/VoiceCallProvider.tsx`
- Modify: `components/caretext/VoiceShell.tsx`
- Modify: `components/caretext/IncomingCallBar.tsx` (callback type only if needed)

**Interfaces:**
- Consumes: `completeIncomingInvite` from Task 4; initiate response `{ callLogId, conversationId, contactName }` from Task 2
- Produces: `startCall(input: { phone: string; conversationId?: string | null; contactName?: string | null }): Promise<void>`. `ActiveCallInfo.conversationId: string | null`. `acceptIncoming(): Promise<string | null>` unchanged. Incoming bar still calls `onAccepted` only when a thread id is present.

- [ ] **Step 1: Widen call info types and `startCall`**

In `components/caretext/VoiceCallProvider.tsx`:

1. Change `ActiveCallInfo` / `IncomingCallInfo`:

```typescript
type ActiveCallInfo = {
  callLogId: string;
  conversationId: string | null;
  phone: string;
  contactName?: string | null;
};
```

2. Replace `resolveIncomingInvite` so it does **not** require `conversationId`. Fetch ringing when `!callLogId || !phone` (not when conversation is missing). Then:

```typescript
import { completeIncomingInvite, parseIncomingInvite } from "@/lib/voice/incoming-invite";

async function resolveIncomingInvite(call: Call): Promise<IncomingCallInfo | null> {
  const parsed = parseIncomingInvite({
    customParameters: call.customParameters,
    parameters: call.parameters,
  });

  let ringing: {
    callLogId?: string;
    conversationId?: string | null;
    phone?: string;
    contactName?: string | null;
  } | null = null;

  if (!parsed.callLogId || !parsed.phone) {
    try {
      const response = await fetch("/api/calls/ringing");
      if (response.ok) {
        const data = (await response.json()) as {
          callLog?: {
            callLogId?: string;
            conversationId?: string | null;
            phone?: string;
            contactName?: string | null;
          } | null;
        };
        ringing = data.callLog ?? null;
      }
    } catch {
      ringing = null;
    }
  }

  return completeIncomingInvite(parsed, ringing);
}
```

3. `startCall` input and fetch body:

```typescript
  startCall: (input: {
    phone: string;
    conversationId?: string | null;
    contactName?: string | null;
  }) => Promise<void>;
```

```typescript
        const initiateResponse = await fetch("/api/calls/initiate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            input.conversationId
              ? { conversationId: input.conversationId, phone: input.phone }
              : { phone: input.phone },
          ),
        });
        // ...
        const initiateData = await initiateResponse.json();
        callLogId = initiateData.callLogId as string;
        const conversationId =
          (initiateData.conversationId as string | null | undefined) ?? input.conversationId ?? null;

        setActiveCall({
          callLogId,
          conversationId,
          phone: input.phone,
          contactName: (initiateData.contactName as string | null | undefined) ?? input.contactName,
        });

        const call = await deviceRef.current.connect({
          params: {
            To: input.phone,
            callLogId,
            ...(conversationId ? { conversationId } : {}),
          },
        });
```

Thread Call in `ConversationHeader` still passes `{ conversationId, phone, contactName }` — that remains valid.

4. `acceptIncoming` already returns `info.conversationId` (now `string | null`).

- [ ] **Step 2: Guard dashboard navigation**

In `components/caretext/VoiceShell.tsx`:

```typescript
      onAccepted={(conversationId) => {
        if (conversationId) {
          router.push(`/dashboard?conversationId=${conversationId}`);
        }
      }}
```

`IncomingCallBar` already does `if (conversationId) onAccepted?.(conversationId)`. If its prop is typed as `(conversationId: string) => void`, leave it; `acceptIncoming` should return `string | null`.

- [ ] **Step 3: Typecheck the touched client files**

Run: `npx tsc --noEmit --pretty false`

Expected: no errors in the voice/call files. Fix any `conversationId: string` assignments that break.

- [ ] **Step 4: Commit**

```bash
git add components/caretext/VoiceCallProvider.tsx components/caretext/VoiceShell.tsx components/caretext/IncomingCallBar.tsx
git commit -m "feat: start and accept browser calls without a conversation"
```

---

### Task 6: Dialer input helpers

**Files:**
- Create: `lib/dialer.ts`
- Test: `lib/dialer.test.ts`

**Interfaces:**
- Consumes: `isValidPhoneNumber` from `lib/phone.ts`
- Produces: `appendDialerDigit(current: string, digit: string): string`, `backspaceDialerInput(current: string): string`, `formatDialerDisplay(raw: string): string`, `canPlaceDialerCall(raw: string): boolean`

- [ ] **Step 1: Write the failing tests**

Create `lib/dialer.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import {
  appendDialerDigit,
  backspaceDialerInput,
  canPlaceDialerCall,
  formatDialerDisplay,
} from "@/lib/dialer";

describe("appendDialerDigit", () => {
  it("appends keypad digits and * #", () => {
    expect(appendDialerDigit("", "5")).toBe("5");
    expect(appendDialerDigit("5", "5")).toBe("55");
    expect(appendDialerDigit("55", "*")).toBe("55*");
    expect(appendDialerDigit("55*", "#")).toBe("55*#");
  });

  it("ignores unexpected characters", () => {
    expect(appendDialerDigit("55", "a")).toBe("55");
  });
});

describe("backspaceDialerInput", () => {
  it("removes the last character", () => {
    expect(backspaceDialerInput("555")).toBe("55");
    expect(backspaceDialerInput("")).toBe("");
  });
});

describe("canPlaceDialerCall", () => {
  it("accepts a complete US number", () => {
    expect(canPlaceDialerCall("4693230954")).toBe(true);
    expect(canPlaceDialerCall("+14693230954")).toBe(true);
  });

  it("rejects a short number", () => {
    expect(canPlaceDialerCall("469")).toBe(false);
  });
});

describe("formatDialerDisplay", () => {
  it("formats 10-digit US numbers as (XXX) XXX-XXXX", () => {
    expect(formatDialerDisplay("4693230954")).toBe("(469) 323-0954");
  });

  it("leaves incomplete input as typed digits", () => {
    expect(formatDialerDisplay("469")).toBe("469");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/dialer.test.ts`

Expected: FAIL — module not found

- [ ] **Step 3: Implement helpers**

Create `lib/dialer.ts`:

```typescript
import { isValidPhoneNumber } from "@/lib/phone";

const KEYPAD = /^[0-9*#]$/;

export function appendDialerDigit(current: string, digit: string): string {
  if (!KEYPAD.test(digit)) {
    return current;
  }
  return `${current}${digit}`;
}

export function backspaceDialerInput(current: string): string {
  return current.slice(0, -1);
}

export function canPlaceDialerCall(raw: string): boolean {
  return isValidPhoneNumber(raw);
}

export function formatDialerDisplay(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) {
    const rest = digits.slice(1);
    return `+1 (${rest.slice(0, 3)}) ${rest.slice(3, 6)}-${rest.slice(6)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return raw;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/dialer.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/dialer.ts lib/dialer.test.ts
git commit -m "feat: add dialer keypad helpers"
```

---

### Task 7: Exact contact lookup by phone

**Files:**
- Modify: `app/api/contacts/route.ts` (`GET`)

**Interfaces:**
- Consumes: `normalizePhoneNumber`, `ACTIVE_CONTACT_WHERE`
- Produces: `GET /api/contacts?smsOnly=1&phone=+15551234567` returns only the active contact with that exact phone (or `{ contacts: [] }` if the number is invalid / missing).

- [ ] **Step 1: Add exact `phone` filter to `GET`**

In `app/api/contacts/route.ts`, after reading `q` and `smsOnly`:

```typescript
  const phoneParam = searchParams.get("phone")?.trim();
  let exactPhone: string | null = null;
  if (phoneParam) {
    try {
      exactPhone = normalizePhoneNumber(phoneParam);
    } catch {
      return NextResponse.json({ contacts: [] });
    }
  }

  const contacts = await prisma.contact.findMany({
    where: {
      ...ACTIVE_CONTACT_WHERE,
      ...(smsOnly ? { phone: { not: null } } : {}),
      ...(exactPhone ? { phone: exactPhone } : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { phone: { contains: q, mode: "insensitive" } },
              { notifyClientId: { contains: q, mode: "insensitive" } },
              { notifyChannelId: { contains: q, mode: "insensitive" } },
              { facility: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: { updatedAt: "desc" },
  });
```

- [ ] **Step 2: Commit**

```bash
git add app/api/contacts/route.ts
git commit -m "feat: look up an active contact by exact phone"
```

---

### Task 8: Shared call list API

**Files:**
- Create: `lib/voice/call-log-list.ts`
- Test: `lib/voice/call-log-list.test.ts`
- Create: `app/api/calls/route.ts`

**Interfaces:**
- Consumes: Prisma `callLog.findMany`, active contacts by phone
- Produces: `parseCallLogListLimit(raw: string | null | undefined): number` (default 50, max 100). `decorateCallLogsWithContacts(logs, contactsByPhone)`. `canSaveContactFromCallLog({ hasContact, status })`. `GET /api/calls` returns `{ callLogs: CallLogListItem[] }`.

- [ ] **Step 1: Write the failing tests**

Create `lib/voice/call-log-list.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import {
  canSaveContactFromCallLog,
  decorateCallLogsWithContacts,
  parseCallLogListLimit,
} from "@/lib/voice/call-log-list";

describe("parseCallLogListLimit", () => {
  it("defaults to 50 and caps at 100", () => {
    expect(parseCallLogListLimit(null)).toBe(50);
    expect(parseCallLogListLimit("10")).toBe(10);
    expect(parseCallLogListLimit("999")).toBe(100);
    expect(parseCallLogListLimit("nope")).toBe(50);
  });
});

describe("decorateCallLogsWithContacts", () => {
  it("attaches the current contact by phone without requiring conversationId", () => {
    const items = decorateCallLogsWithContacts(
      [
        {
          id: "log-1",
          phone: "+15551234567",
          direction: "outbound",
          status: "completed",
          outcome: "completed",
          durationSeconds: 12,
          startedAt: new Date("2026-08-31T12:00:00.000Z"),
          endedAt: new Date("2026-08-31T12:00:12.000Z"),
          conversationId: null,
          initiatedBy: { id: "user-1", name: "Nurse" },
        },
      ],
      new Map([["+15551234567", { id: "contact-1", name: "Ada" }]]),
    );

    expect(items[0]?.contact).toEqual({ id: "contact-1", name: "Ada" });
    expect(items[0]?.conversationId).toBeNull();
    expect(items[0]?.startedAt).toBe("2026-08-31T12:00:00.000Z");
  });
});

describe("canSaveContactFromCallLog", () => {
  it("is true only for ended unknown numbers", () => {
    expect(canSaveContactFromCallLog({ hasContact: false, status: "completed" })).toBe(true);
    expect(canSaveContactFromCallLog({ hasContact: false, status: "no_answer" })).toBe(true);
    expect(canSaveContactFromCallLog({ hasContact: false, status: "ringing" })).toBe(false);
    expect(canSaveContactFromCallLog({ hasContact: true, status: "completed" })).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/voice/call-log-list.test.ts`

Expected: FAIL — module not found

- [ ] **Step 3: Implement list helpers**

Create `lib/voice/call-log-list.ts`:

```typescript
export const DEFAULT_CALL_LOG_LIMIT = 50;
export const MAX_CALL_LOG_LIMIT = 100;

const ACTIVE_STATUSES = new Set(["initiating", "ringing", "in_progress"]);

export type CallLogListRow = {
  id: string;
  phone: string;
  direction: string;
  status: string;
  outcome: string | null;
  durationSeconds: number | null;
  startedAt: Date;
  endedAt: Date | null;
  conversationId: string | null;
  initiatedBy: { id: string; name: string | null } | null;
};

export type CallLogListItem = {
  id: string;
  phone: string;
  direction: string;
  status: string;
  outcome: string | null;
  durationSeconds: number | null;
  startedAt: string;
  endedAt: string | null;
  conversationId: string | null;
  initiatedBy: { id: string; name: string | null } | null;
  contact: { id: string; name: string | null } | null;
};

export function parseCallLogListLimit(raw: string | null | undefined): number {
  if (raw == null || raw === "") {
    return DEFAULT_CALL_LOG_LIMIT;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return DEFAULT_CALL_LOG_LIMIT;
  }
  return Math.min(parsed, MAX_CALL_LOG_LIMIT);
}

export function decorateCallLogsWithContacts(
  logs: CallLogListRow[],
  contactsByPhone: Map<string, { id: string; name: string | null }>,
): CallLogListItem[] {
  return logs.map((log) => ({
    id: log.id,
    phone: log.phone,
    direction: log.direction,
    status: log.status,
    outcome: log.outcome,
    durationSeconds: log.durationSeconds,
    startedAt: log.startedAt.toISOString(),
    endedAt: log.endedAt ? log.endedAt.toISOString() : null,
    conversationId: log.conversationId,
    initiatedBy: log.initiatedBy,
    contact: contactsByPhone.get(log.phone) ?? null,
  }));
}

export function canSaveContactFromCallLog(input: { hasContact: boolean; status: string }): boolean {
  return !input.hasContact && !ACTIVE_STATUSES.has(input.status);
}
```

- [ ] **Step 4: Run helper tests**

Run: `npx vitest run lib/voice/call-log-list.test.ts`

Expected: PASS

- [ ] **Step 5: Add `GET /api/calls`**

Create `app/api/calls/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { ACTIVE_CONTACT_WHERE } from "@/lib/contact-soft-delete";
import { decorateCallLogsWithContacts, parseCallLogListLimit } from "@/lib/voice/call-log-list";

export async function GET(request: Request) {
  const authResult = await requireSession();
  if ("error" in authResult) {
    return authResult.error;
  }

  const { searchParams } = new URL(request.url);
  const take = parseCallLogListLimit(searchParams.get("limit"));

  const logs = await prisma.callLog.findMany({
    orderBy: { startedAt: "desc" },
    take,
    select: {
      id: true,
      phone: true,
      direction: true,
      status: true,
      outcome: true,
      durationSeconds: true,
      startedAt: true,
      endedAt: true,
      conversationId: true,
      initiatedBy: { select: { id: true, name: true } },
    },
  });

  const phones = [...new Set(logs.map((log) => log.phone))];
  const contacts = phones.length
    ? await prisma.contact.findMany({
        where: { ...ACTIVE_CONTACT_WHERE, phone: { in: phones } },
        select: { id: true, name: true, phone: true },
      })
    : [];

  const contactsByPhone = new Map(
    contacts.flatMap((contact) =>
      contact.phone ? [[contact.phone, { id: contact.id, name: contact.name }] as const] : [],
    ),
  );

  return NextResponse.json({ callLogs: decorateCallLogsWithContacts(logs, contactsByPhone) });
}
```

- [ ] **Step 6: Commit**

```bash
git add lib/voice/call-log-list.ts lib/voice/call-log-list.test.ts app/api/calls/route.ts
git commit -m "feat: add shared facility call log API"
```

---

### Task 9: New Call modal and nav

**Files:**
- Create: `components/caretext/DialerProvider.tsx`
- Create: `components/caretext/DialerModal.tsx`
- Modify: `components/caretext/VoiceShell.tsx`
- Modify: `components/caretext/TopNav.tsx`

**Interfaces:**
- Consumes: `useVoiceCall().startCall` / `isCallActive` from Task 5; dialer helpers from Task 6; `GET /api/contacts?smsOnly=1&phone=` from Task 7
- Produces: `useDialer(): { isOpen: boolean; openDialer: () => void; closeDialer: () => void }`. Header **New Call** and **Calls** (`/calls`). Embed nav is not changed.

- [ ] **Step 1: Add `DialerProvider`**

Create `components/caretext/DialerProvider.tsx`:

```typescript
"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

type DialerContextValue = {
  isOpen: boolean;
  openDialer: () => void;
  closeDialer: () => void;
};

const DialerContext = createContext<DialerContextValue | null>(null);

export function useDialer() {
  const context = useContext(DialerContext);
  if (!context) {
    throw new Error("useDialer must be used within DialerProvider");
  }
  return context;
}

export function DialerProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const openDialer = useCallback(() => setIsOpen(true), []);
  const closeDialer = useCallback(() => setIsOpen(false), []);
  const value = useMemo(
    () => ({ isOpen, openDialer, closeDialer }),
    [closeDialer, isOpen, openDialer],
  );

  return <DialerContext.Provider value={value}>{children}</DialerContext.Provider>;
}
```

- [ ] **Step 2: Add `DialerModal`**

Create `components/caretext/DialerModal.tsx` using existing modal patterns (`rounded-xl border border-border bg-white`). Keys: `1-9`, `*`, `0`, `#`, backspace, Call.

```typescript
"use client";

import { useEffect, useState } from "react";
import { useDialer } from "@/components/caretext/DialerProvider";
import { useVoiceCall } from "@/components/caretext/VoiceCallProvider";
import {
  appendDialerDigit,
  backspaceDialerInput,
  canPlaceDialerCall,
  formatDialerDisplay,
} from "@/lib/dialer";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"] as const;

export function DialerModal() {
  const { isOpen, closeDialer } = useDialer();
  const { startCall, isCallActive, errorMessage } = useVoiceCall();
  const [raw, setRaw] = useState("");
  const [contactName, setContactName] = useState<string | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setRaw("");
      setContactName(null);
      setLookupError(null);
      setIsStarting(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeDialer();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [closeDialer, isOpen]);

  useEffect(() => {
    if (!isOpen || !canPlaceDialerCall(raw)) {
      setContactName(null);
      return;
    }

    const controller = new AbortController();
    void fetch(`/api/contacts?smsOnly=1&phone=${encodeURIComponent(raw)}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          return;
        }
        const data = (await response.json()) as {
          contacts?: Array<{ name: string | null }>;
        };
        setContactName(data.contacts?.[0]?.name ?? null);
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setContactName(null);
        }
      });

    return () => controller.abort();
  }, [isOpen, raw]);

  useEffect(() => {
    if (isOpen && isCallActive) {
      closeDialer();
    }
  }, [closeDialer, isCallActive, isOpen]);

  if (!isOpen) {
    return null;
  }

  const canCall = canPlaceDialerCall(raw) && !isCallActive && !isStarting;

  async function onCall() {
    if (!canPlaceDialerCall(raw) || isCallActive || isStarting) {
      return;
    }
    setIsStarting(true);
    setLookupError(null);
    await startCall({ phone: raw, contactName });
    setIsStarting(false);
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialer-title"
        className="w-full max-w-sm rounded-xl border border-border bg-white p-4 shadow-lg"
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 id="dialer-title" className="text-lg font-semibold">
              New Call
            </h2>
            {contactName ? <p className="text-sm text-muted">{contactName}</p> : null}
          </div>
          <button
            type="button"
            className="rounded-lg border border-border px-2 py-1 text-sm"
            onClick={closeDialer}
          >
            Close
          </button>
        </div>
        <label className="sr-only" htmlFor="dialer-number">
          Phone number
        </label>
        <input
          id="dialer-number"
          value={formatDialerDisplay(raw)}
          onChange={(event) => {
            const next = event.target.value.replace(/[^\d+*#]/g, "");
            setRaw(next.startsWith("+") ? `+${next.slice(1).replace(/\+/g, "")}` : next.replace(/\+/g, ""));
          }}
          inputMode="tel"
          autoComplete="tel"
          className="mb-3 w-full rounded-lg border border-border px-3 py-2 text-lg tracking-wide"
        />
        <div className="mb-3 grid grid-cols-3 gap-2">
          {KEYS.map((key) => (
            <button
              key={key}
              type="button"
              className="rounded-lg border border-border bg-slate-50 py-3 text-lg font-semibold"
              onClick={() => setRaw((current) => appendDialerDigit(current, key))}
            >
              {key}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            className="flex-1 rounded-lg border border-border px-3 py-2 text-sm"
            onClick={() => setRaw((current) => backspaceDialerInput(current))}
          >
            Backspace
          </button>
          <button
            type="button"
            disabled={!canCall}
            className="flex-1 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => void onCall()}
          >
            Call
          </button>
        </div>
        {isCallActive ? <p className="mt-2 text-sm text-amber-700">You already have an active call.</p> : null}
        {lookupError || errorMessage ? (
          <p className="mt-2 text-sm text-rose-700">{lookupError || errorMessage}</p>
        ) : null}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Mount provider + modal in `VoiceShell`**

`VoiceCallProvider` must wrap `DialerProvider` because the modal calls `useVoiceCall`. `TopNav` is a child of `VoiceShell`, so it can call `useDialer`.

```typescript
"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { DialerModal } from "@/components/caretext/DialerModal";
import { DialerProvider } from "@/components/caretext/DialerProvider";
import { IncomingCallBar } from "@/components/caretext/IncomingCallBar";
import { VoiceCallProvider } from "@/components/caretext/VoiceCallProvider";

export function VoiceShell({ children }: { children: ReactNode }) {
  return (
    <VoiceCallProvider>
      <DialerProvider>
        {children}
        <DialerModal />
      </DialerProvider>
    </VoiceCallProvider>
  );
}

export function GlobalIncomingCallBar() {
  const router = useRouter();

  return (
    <IncomingCallBar
      onAccepted={(conversationId) => {
        if (conversationId) {
          router.push(`/dashboard?conversationId=${conversationId}`);
        }
      }}
    />
  );
}
```

Note: `GlobalIncomingCallBar` is rendered **inside** `{children}`'s parent in `app/(protected)/layout.tsx` (`VoiceShell` > `main` > `TopNav` + `GlobalIncomingCallBar`). That is already inside `DialerProvider` if `VoiceShell` wraps children as above. Keep that nesting.

- [ ] **Step 4: Add New Call and Calls to `TopNav`**

In `components/caretext/TopNav.tsx`:

1. Import `useDialer` and add a **Calls** `Link` to `/calls` after Dashboard (before Contacts).
2. Add a **New Call** button next to Sign out (desktop) and in the mobile menu.

```typescript
import { useDialer } from "@/components/caretext/DialerProvider";

export function TopNav({ isAdmin }: { isAdmin: boolean }) {
  const { openDialer } = useDialer();
  // ...
```

In the `links` fragment, after Dashboard:

```typescript
      <Link href="/calls" className={navLinkClass} onClick={() => setMenuOpen(false)}>
        Calls
      </Link>
```

Desktop actions (before Sign out):

```typescript
          <button
            type="button"
            className="hidden rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white lg:inline-flex"
            onClick={openDialer}
          >
            New Call
          </button>
```

Mobile menu: same button, full width, `onClick={() => { setMenuOpen(false); openDialer(); }}`.

Do **not** edit embed headers.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit --pretty false`

Expected: no errors from the new files. `TopNav` is only used under `VoiceShell` in the protected layout.

- [ ] **Step 6: Commit**

```bash
git add components/caretext/DialerProvider.tsx components/caretext/DialerModal.tsx components/caretext/VoiceShell.tsx components/caretext/TopNav.tsx
git commit -m "feat: add New Call dialer modal and Calls nav"
```

---

### Task 10: Calls page with redial and Save contact

**Files:**
- Create: `app/(protected)/calls/page.tsx`
- Create: `components/caretext/CallsPageClient.tsx`

**Interfaces:**
- Consumes: `GET /api/calls` from Task 8; `canSaveContactFromCallLog`; `POST /api/contacts` (existing); `startCall({ phone })` from Task 5
- Produces: `/calls` shared list. Known contact + `conversationId` links to `/dashboard?conversationId=`. Known contact without thread links to `/contacts`. Unknown ended rows show **Save contact** (name + phone). **Redial** disabled while a call is active.

- [ ] **Step 1: Add the page shell**

Create `app/(protected)/calls/page.tsx`:

```typescript
import { CallsPageClient } from "@/components/caretext/CallsPageClient";

export default function CallsPage() {
  return <CallsPageClient />;
}
```

- [ ] **Step 2: Add `CallsPageClient`**

Create `components/caretext/CallsPageClient.tsx`. Match existing card/list styling (`rounded-xl border border-border bg-white`). Reuse `formatCallDuration`, `formatCallStatusLabel` from `lib/call-log-display` and `formatMessageTime` from `lib/format`.

Required behavior:

```typescript
"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useVoiceCall } from "@/components/caretext/VoiceCallProvider";
import { formatCallDuration, formatCallStatusLabel } from "@/lib/call-log-display";
import { canSaveContactFromCallLog, type CallLogListItem } from "@/lib/voice/call-log-list";
import { formatMessageTime } from "@/lib/format";

export function CallsPageClient() {
  const { startCall, isCallActive } = useVoiceCall();
  const [callLogs, setCallLogs] = useState<CallLogListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saveFor, setSaveFor] = useState<CallLogListItem | null>(null);
  const [saveName, setSaveName] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch("/api/calls");
    if (!response.ok) {
      throw new Error("Failed to load calls.");
    }
    const data = (await response.json()) as { callLogs: CallLogListItem[] };
    setCallLogs(data.callLogs);
  }, []);

  useEffect(() => {
    void load().catch((loadError: unknown) => {
      setError(loadError instanceof Error ? loadError.message : "Failed to load calls.");
    });
  }, [load]);

  async function onSaveContact() {
    if (!saveFor) {
      return;
    }
    setIsSaving(true);
    setSaveError(null);
    try {
      const response = await fetch("/api/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: saveName.trim() || null, phone: saveFor.phone }),
      });
      if (!response.ok) {
        const data = (await response.json()) as { error?: unknown };
        throw new Error(
          typeof data.error === "string" ? data.error : "Could not save contact.",
        );
      }
      setSaveFor(null);
      setSaveName("");
      await load();
    } catch (saveErr) {
      setSaveError(saveErr instanceof Error ? saveErr.message : "Could not save contact.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="rounded-xl border border-border bg-white p-4">
      <h1 className="text-lg font-semibold">Calls</h1>
      <p className="mb-4 text-sm text-muted">Inbound and outbound facility call history.</p>
      {error ? <p className="text-sm text-rose-700">{error}</p> : null}
      {!callLogs ? <p className="text-sm text-muted">Loading…</p> : null}
      {callLogs && callLogs.length === 0 ? (
        <p className="text-sm text-muted">No calls yet.</p>
      ) : null}
      <div className="space-y-2">
        {callLogs?.map((log) => {
          const duration = formatCallDuration(log.durationSeconds);
          const showSave = canSaveContactFromCallLog({
            hasContact: Boolean(log.contact),
            status: log.status,
          });
          const nameNode = log.contact ? (
            log.conversationId ? (
              <Link
                href={`/dashboard?conversationId=${log.conversationId}`}
                className="font-medium text-emerald-800 underline"
              >
                {log.contact.name || log.phone}
              </Link>
            ) : (
              <Link href="/contacts" className="font-medium text-emerald-800 underline">
                {log.contact.name || log.phone}
              </Link>
            )
          ) : (
            <span className="font-medium">{log.phone}</span>
          );

          return (
            <article key={log.id} className="rounded-lg border border-border bg-slate-50 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs capitalize text-muted">
                  {log.direction === "inbound" ? "Incoming" : "Outbound"}
                </span>
                <span className="text-xs capitalize text-muted">{formatCallStatusLabel(log.status)}</span>
                {duration ? <span className="text-xs text-muted">{duration}</span> : null}
              </div>
              <p className="mt-1 text-sm">{nameNode}</p>
              <p className="text-[11px] text-muted">
                {log.initiatedBy?.name ?? (log.direction === "inbound" ? "Missed" : "Unknown")}{" "}
                · {formatMessageTime(log.startedAt)}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={isCallActive}
                  className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={() => void startCall({ phone: log.phone, contactName: log.contact?.name })}
                >
                  Redial
                </button>
                {showSave ? (
                  <button
                    type="button"
                    className="rounded-lg border border-border bg-white px-3 py-1.5 text-sm"
                    onClick={() => {
                      setSaveFor(log);
                      setSaveName(log.contact?.name ?? "");
                      setSaveError(null);
                    }}
                  >
                    Save contact
                  </button>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>

      {saveFor ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-sm rounded-xl border border-border bg-white p-4">
            <h2 className="text-lg font-semibold">Save contact</h2>
            <p className="mb-3 text-sm text-muted">{saveFor.phone}</p>
            <label className="mb-1 block text-sm" htmlFor="save-contact-name">
              Name
            </label>
            <input
              id="save-contact-name"
              value={saveName}
              onChange={(event) => setSaveName(event.target.value)}
              className="mb-3 w-full rounded-lg border border-border px-3 py-2"
            />
            {saveError ? <p className="mb-2 text-sm text-rose-700">{saveError}</p> : null}
            <div className="flex gap-2">
              <button
                type="button"
                className="flex-1 rounded-lg border border-border px-3 py-2 text-sm"
                onClick={() => setSaveFor(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isSaving}
                className="flex-1 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                onClick={() => void onSaveContact()}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
```

Do not create a conversation in Save contact. Do not PATCH old call logs.

- [ ] **Step 3: Run the full unit suite**

Run: `npm test`

Expected: PASS (all existing + new tests)

- [ ] **Step 4: Manual check**

With `npm run dev` and a voice-capable session:

1. Header **New Call** opens the keypad; known number shows the contact name; Call uses the existing Call bar.
2. Unknown number: call works; no new inbox thread; row appears on `/calls`.
3. Thread Call still logs on that conversation.
4. Unknown inbound: bar shows the number; Accept does not jump to Dashboard; `/calls` has the row.
5. After hangup, **Save contact** creates the contact; duplicate number shows the existing contacts error.
6. **Redial** works; disabled during an active call.
7. Embed inbox is unchanged.

- [ ] **Step 5: Commit**

```bash
git add "app/(protected)/calls/page.tsx" components/caretext/CallsPageClient.tsx
git commit -m "feat: add shared Calls page with redial and save contact"
```

---

## Self-review

**Spec coverage**

| Spec item | Task |
|---|---|
| New Call modal + keypad from header | 6, 9 |
| Calls page shared log | 8, 10 |
| Known + open thread attaches | 1, 2 |
| Unknown outbound: no contact/thread | 1, 2 |
| Unknown inbound: answerable, no auto contact/thread | 3, 4, 5 |
| Soft-deleted treated as unknown | 1 (`deletedAt: null`) |
| Save contact after end, Calls only | 8 `canSaveContactFromCallLog`, 10 |
| No backfill | 10 (POST contacts only) |
| Redial | 10 |
| Thread Call unchanged | 2 conversationId path, 5 still accepts it |
| Embed unchanged | 9/10 do not touch embed |
| `GET /api/contacts?phone=` | 7 |
| Incoming invite without conversationId | 4, 5 |
| List limit 50/100 | 8 |
| Escalate missed inbound only if attached | 3 |

**Placeholders:** none.

**Type consistency:** `CallAttachment`, `CompletedIncomingInvite`, `CallLogListItem`, `startCall({ phone, conversationId?, contactName? })` are defined in the task that introduces them and reused with the same names later.
