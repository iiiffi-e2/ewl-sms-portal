# Notify Outbound Alerts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let staff send Notify alerts from room-mention messages in Notify threads via a Send alert modal, and remove inbound-alerts product UX.

**Architecture:** Pure room parsing + payload helpers in `lib/`. Authenticated `POST /api/alerts/send` loads the Notify contact, POSTs Postman v2.0 Alert JSON to `{commStackBaseUrl}/palatiumCare/{notifyFacilityCode}`, and audits the attempt on `Alert`. UI shows a under-bubble control + modal; inbound Alerts panel and alert system-message cards are removed.

**Tech Stack:** Next.js 16 (App Router), Prisma 6 + PostgreSQL, React 19, Vitest, Tailwind, Zod.

**Spec:** `docs/superpowers/specs/2026-08-08-notify-outbound-alerts-design.md`

## Global Constraints

- Alert direction for product UX is **outbound only** (CareText → Notify).
- Contract: Postman `POST {{server-url}}/palatiumCare/{{facilitycode}}?eventDateTime={{eventDateTime}}`.
- Host = contact `commStackBaseUrl`; facility path segment = contact `notifyFacilityCode`.
- Button only on Notify threads, outbound messages, room-pattern match; control under the bubble.
- Modal: room required (editable prefill), note optional, light inputs, success toast only (no thread system note).
- Clear / inbound webhook product UI are out of scope (remove panel + alert bubble styling).
- **Do not invent locked Notify contract values.** Until Notify confirms: omit `building`/`resident`/`device` from JSON; keep note in CareText audit only (not in Notify body); use provisional Bearer `COMM_STACK_SDK_TOKEN` and provisional UUID `id`, both marked `PROVISIONAL` in code comments.
- Follow existing patterns: pure logic in `lib/*.ts` with colocated `*.test.ts`; run with `npm test` / `npx vitest run <file>`.
- Auth for send route: `requireSession()`.

## File structure

| File | Responsibility |
|---|---|
| `prisma/schema.prisma` | `Contact.notifyFacilityCode`; Alert outbound fields + `sent`/`failed` statuses |
| `prisma/migrations/<ts>_notify_outbound_alerts/` | Migration SQL |
| `lib/notify-room.ts` | Room pattern extraction |
| `lib/notify-room.test.ts` | Room extraction tests |
| `lib/notify-outbound-alert.ts` | Payload builder + HTTP send to Notify |
| `lib/notify-outbound-alert.test.ts` | Payload + URL builder tests |
| `lib/validators.ts` | `notifyFacilityCode` on contact schemas; `sendAlertSchema` |
| `app/api/alerts/send/route.ts` | Authenticated outbound send |
| `app/api/contacts/route.ts` | Persist `notifyFacilityCode` on create |
| `app/api/contacts/[id]/route.ts` | Persist `notifyFacilityCode` on update |
| `components/caretext/SendAlertModal.tsx` | Modal UI |
| `components/caretext/MessageThread.tsx` | Under-bubble Send alert + modal wiring; remove alert cards |
| `components/caretext/ContactsManager.tsx` | Collect `notifyFacilityCode` |
| `components/caretext/ContactDetailsCard.tsx` | Collect/display `notifyFacilityCode` |
| `components/caretext/DashboardClient.tsx` | Remove `AlertsPanel` |
| `app/api/alerts/route.ts` | Remove or slim unused list endpoint if panel gone |
| `components/caretext/AlertsPanel.tsx` | Delete after panel removed |
| `app/api/webhooks/notify/alerts/**` | Leave inert or delete in cleanup task (no product UI) |

---

### Task 1: Room extraction helper

**Files:**
- Create: `lib/notify-room.ts`
- Create: `lib/notify-room.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `extractRoomMention(body: string): string | null` — first match of Room/Rm/Apt/Apartment + token; case-insensitive.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from "vitest";
import { extractRoomMention } from "@/lib/notify-room";

describe("extractRoomMention", () => {
  it("extracts Room N", () => {
    expect(extractRoomMention("Please check Room 214 now")).toBe("214");
  });

  it("extracts Rm / Apt / Apartment case-insensitively", () => {
    expect(extractRoomMention("go to rm 12B")).toBe("12B");
    expect(extractRoomMention("Apt 100 ready")).toBe("100");
    expect(extractRoomMention("Apartment 7A")).toBe("7A");
  });

  it("uses the first match only", () => {
    expect(extractRoomMention("Room 1 then Apt 2")).toBe("1");
  });

  it("returns null when no pattern matches", () => {
    expect(extractRoomMention("Please check on the resident")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/notify-room.test.ts`

Expected: FAIL — module `@/lib/notify-room` not found.

- [ ] **Step 3: Implement**

```ts
// lib/notify-room.ts
const ROOM_PATTERN =
  /\b(?:Room|Rm|Apartment|Apt)\s+([A-Za-z0-9-]+)\b/i;

export function extractRoomMention(body: string): string | null {
  const match = body.match(ROOM_PATTERN);
  const token = match?.[1]?.trim();
  return token ? token : null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/notify-room.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/notify-room.ts lib/notify-room.test.ts
git commit -m "feat: extract room mentions for Notify Send alert"
```

---

### Task 2: Schema — `notifyFacilityCode` + outbound Alert fields

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_notify_outbound_alerts/migration.sql` (via migrate)

**Interfaces:**
- Consumes: nothing.
- Produces: `Contact.notifyFacilityCode: String?`; `Alert.sourceMessageId`, `Alert.note`, `Alert.errorMessage`; `AlertStatus` values `sent` | `failed` (keep existing inbound values for old rows).

- [ ] **Step 1: Update Prisma schema**

On `model Contact`, after `facility`, add:

```prisma
  notifyFacilityCode       String?
```

Extend enum:

```prisma
enum AlertStatus {
  open
  cleared
  unmatched
  sent
  failed
}
```

On `model Alert`, add:

```prisma
  sourceMessageId String?
  note            String?
  errorMessage    String?
```

Add index:

```prisma
  @@index([sourceMessageId])
```

- [ ] **Step 2: Migrate**

Run:

```bash
npx prisma migrate dev --name notify_outbound_alerts
```

Expected: migration applied; client regenerated.

- [ ] **Step 3: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat: add notifyFacilityCode and outbound Alert audit fields"
```

---

### Task 3: Contact validators + API persistence for `notifyFacilityCode`

**Files:**
- Modify: `lib/validators.ts` (`createContactSchema`, `updateContactSchema`, and any conversation create contact shapes that include CommStack fields)
- Modify: `app/api/contacts/route.ts`
- Modify: `app/api/contacts/[id]/route.ts`
- Modify: `lib/validators-contact.test.ts` (or add cases if present)

**Interfaces:**
- Consumes: `Contact.notifyFacilityCode` from Task 2.
- Produces: Zod accepts optional `notifyFacilityCode` (trim, max 120). For Notify identity create/update, require non-empty `notifyFacilityCode` the same way CommStack fields are required (`refineNotifyCommStackConfig` or sibling refine).

- [ ] **Step 1: Write/adjust failing validator tests**

Add cases:

- Notify create without `notifyFacilityCode` → error on `notifyFacilityCode`
- Notify create with `notifyFacilityCode: "deb769"` → success
- SMS create ignores missing `notifyFacilityCode`

- [ ] **Step 2: Run tests — expect FAIL**

Run: `npx vitest run lib/validators-contact.test.ts`

- [ ] **Step 3: Implement schema + API mapping**

In `lib/validators.ts`:

```ts
notifyFacilityCode: z.string().trim().max(120).optional().nullable(),
```

In the Notify CommStack refine used on create (and update when Notify identity present), require:

```ts
if (!data.notifyFacilityCode?.trim()) {
  ctx.addIssue({
    code: "custom",
    path: ["notifyFacilityCode"],
    message: "Notify facility code is required for Notify contacts.",
  });
}
```

In `app/api/contacts/route.ts` and `[id]/route.ts`, map `notifyFacilityCode: parsed.data.notifyFacilityCode ?? null` (and patch `hasField` pattern on update).

- [ ] **Step 4: Run tests — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add lib/validators.ts lib/validators-contact.test.ts app/api/contacts/route.ts "app/api/contacts/[id]/route.ts"
git commit -m "feat: require notifyFacilityCode on Notify contacts"
```

---

### Task 4: Outbound payload + Notify HTTP client

**Files:**
- Create: `lib/notify-outbound-alert.ts`
- Create: `lib/notify-outbound-alert.test.ts`

**Interfaces:**
- Consumes: contact base URL + facility code; room string.
- Produces:
  - `buildNotifyAlertUrl(baseUrl: string, facilityCode: string, eventDateTime: string): string`
  - `buildOutboundAlertPayload(input: { id: string; eventDateTime: string; room: string }): Record<string, unknown>`
  - `sendOutboundNotifyAlert(input: { baseUrl: string; facilityCode: string; room: string; note?: string | null; sdkToken: string }): Promise<{ externalId: string; eventDateTime: string; requestPayload: unknown; responseStatus: number; responseBody: string }>`

**Provisional contract (document in file header):**

```ts
/**
 * PROVISIONAL until Notify confirms:
 * - Authorization: Bearer COMM_STACK_SDK_TOKEN
 * - payload.id: generated UUID
 * - note is NOT sent in Notify JSON (CareText audit only)
 * - location.building / resident / device omitted
 */
```

- [ ] **Step 1: Write failing tests**

```ts
import { describe, expect, it } from "vitest";
import {
  buildNotifyAlertUrl,
  buildOutboundAlertPayload,
} from "@/lib/notify-outbound-alert";

describe("buildNotifyAlertUrl", () => {
  it("strips scheme/trailing slash and builds palatiumCare path", () => {
    expect(
      buildNotifyAlertUrl(
        "https://qsscommbe3.notifync.com/",
        "deb769",
        "2026-08-08T12:00:00.000Z",
      ),
    ).toBe(
      "https://qsscommbe3.notifync.com/palatiumCare/deb769?eventDateTime=2026-08-08T12%3A00%3A00.000Z",
    );
  });
});

describe("buildOutboundAlertPayload", () => {
  it("builds Postman v2.0 Alert with room as location.name only", () => {
    expect(
      buildOutboundAlertPayload({
        id: "11111111-1111-1111-1111-111111111111",
        eventDateTime: "2026-08-08T12:00:00.000Z",
        room: "214",
      }),
    ).toEqual({
      version: "2.0",
      vendor: "Notify",
      id: "11111111-1111-1111-1111-111111111111",
      type: "Alert",
      eventDateTime: "2026-08-08T12:00:00.000Z",
      location: { name: "214" },
    });
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `npx vitest run lib/notify-outbound-alert.test.ts`

- [ ] **Step 3: Implement**

```ts
// lib/notify-outbound-alert.ts
import { randomUUID } from "crypto";

function normalizeCommStackHost(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed.replace(/^http:\/\//i, "https://");
  }
  return `https://${trimmed}`;
}

export function buildNotifyAlertUrl(
  baseUrl: string,
  facilityCode: string,
  eventDateTime: string,
): string {
  const origin = normalizeCommStackHost(baseUrl);
  const encodedFacility = encodeURIComponent(facilityCode.trim());
  const params = new URLSearchParams({ eventDateTime });
  return `${origin}/palatiumCare/${encodedFacility}?${params.toString()}`;
}

export function buildOutboundAlertPayload(input: {
  id: string;
  eventDateTime: string;
  room: string;
}) {
  return {
    version: "2.0",
    vendor: "Notify",
    id: input.id,
    type: "Alert" as const,
    eventDateTime: input.eventDateTime,
    location: { name: input.room.trim() },
  };
}

export async function sendOutboundNotifyAlert(input: {
  baseUrl: string;
  facilityCode: string;
  room: string;
  note?: string | null; // CareText-only until Notify confirms mapping
  sdkToken: string;
  fetchImpl?: typeof fetch;
}) {
  const eventDateTime = new Date().toISOString();
  const externalId = randomUUID();
  const requestPayload = buildOutboundAlertPayload({
    id: externalId,
    eventDateTime,
    room: input.room,
  });
  const url = buildNotifyAlertUrl(input.baseUrl, input.facilityCode, eventDateTime);
  const fetchFn = input.fetchImpl ?? fetch;
  const response = await fetchFn(url, {
    method: "POST",
    headers: {
      // PROVISIONAL auth — confirm with Notify
      Authorization: `Bearer ${input.sdkToken}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestPayload),
  });
  const responseBody = await response.text();
  return {
    externalId,
    eventDateTime,
    requestPayload,
    responseStatus: response.status,
    responseBody,
    ok: response.ok,
    note: input.note ?? null,
  };
}
```

- [ ] **Step 4: Run tests — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add lib/notify-outbound-alert.ts lib/notify-outbound-alert.test.ts
git commit -m "feat: build and send outbound Notify alert payloads"
```

---

### Task 5: `POST /api/alerts/send`

**Files:**
- Create: `app/api/alerts/send/route.ts`
- Modify: `lib/validators.ts` — add `sendAlertSchema`
- Create: `lib/notify-outbound-alert-route.test.ts` **or** keep route thin and unit-test validation helpers; if route tests are awkward, add a small `sendOutboundAlertForConversation` in `lib/notify-outbound-alert.ts` and test that.

**Interfaces:**
- Consumes: `sendOutboundNotifyAlert`, session auth, Prisma Contact/Conversation/Message/Alert.
- Produces: JSON `{ alert: { id, status, externalId, locationName, note } }` on success; 4xx/5xx with `{ error }` on failure.

- [ ] **Step 1: Add schema**

```ts
export const sendAlertSchema = z.object({
  conversationId: z.string().uuid(),
  messageId: z.string().uuid(),
  room: z.string().trim().min(1).max(40),
  note: z.string().trim().max(1000).optional().nullable(),
});
```

- [ ] **Step 2: Implement route**

```ts
// app/api/alerts/send/route.ts (structure)
// 1. requireSession()
// 2. parse sendAlertSchema
// 3. load conversation with contact; 404 if missing
// 4. reject if contact has phone-only / no notify identity
// 5. reject if message not in conversation or not outbound
// 6. reject if !contact.notifyFacilityCode || !contact.commStackBaseUrl
// 7. read COMM_STACK_SDK_TOKEN (or env-specific token helper used by commstack.ts); 500 if missing
// 8. call sendOutboundNotifyAlert
// 9. prisma.alert.create with status sent|failed, type Alert, locationName=room, note, sourceMessageId, facilityCode, payload=request+response summary, externalId+eventDateTime
// 10. if !ok return 502 with error; else 200 { alert }
```

Reuse any existing token helper from `lib/commstack.ts` if present (e.g. env reader); do not hardcode secrets.

- [ ] **Step 3: Unit-test the orchestration helper** (preferred over full Next route test)

Extract:

```ts
export async function processOutboundAlertSend(input: {
  conversationId: string;
  messageId: string;
  room: string;
  note?: string | null;
  sdkToken: string;
  fetchImpl?: typeof fetch;
}): Promise<
  | { ok: true; alert: { id: string; status: "sent"; externalId: string } }
  | { ok: false; status: number; error: string }
>
```

Test with mocked `fetchImpl` + prisma mock **or** keep prisma calls in route and mock fetch only via dependency injection on `sendOutboundNotifyAlert` while testing payload path separately (Task 4). Minimum for this task: route compiles and manual path documented; prefer one helper test with mocked fetch that asserts failed Notify → `AlertStatus.failed`.

- [ ] **Step 4: Commit**

```bash
git add app/api/alerts/send/route.ts lib/validators.ts lib/notify-outbound-alert.ts
git commit -m "feat: add POST /api/alerts/send for Notify outbound alerts"
```

---

### Task 6: Contact UI — `notifyFacilityCode`

**Files:**
- Modify: `components/caretext/ContactsManager.tsx`
- Modify: `components/caretext/ContactDetailsCard.tsx`

**Interfaces:**
- Consumes: API field `notifyFacilityCode`.
- Produces: Create/edit forms collect Notify facility code alongside CommStack fields.

- [ ] **Step 1: ContactsManager**

Add form field `notifyFacilityCode` (empty default). Show when channel is Notify (individual or channel). Require non-empty before submit (same gate as other CommStack fields). Include in POST body. Show on contact cards: `Facility code: {notifyFacilityCode}`.

- [ ] **Step 2: ContactDetailsCard**

Add to Notify form state + inputs (create + edit). Include in create/update payloads. Label: **Notify facility code** (helper text: used for `/palatiumCare/{code}` alerts).

- [ ] **Step 3: Manual smoke**

Create/edit a Notify contact with facility code `deb769` (or staging code); confirm it persists via GET `/api/contacts`.

- [ ] **Step 4: Commit**

```bash
git add components/caretext/ContactsManager.tsx components/caretext/ContactDetailsCard.tsx
git commit -m "feat: collect Notify facility code on contact forms"
```

---

### Task 7: Send alert UI (button + modal)

**Files:**
- Create: `components/caretext/SendAlertModal.tsx`
- Modify: `components/caretext/MessageThread.tsx`
- Modify: parent that owns thread props if conversation transport flag is needed (`DashboardClient` / `EmbedInboxClient` / `useConversationDetail`)

**Interfaces:**
- Consumes: `extractRoomMention`, `POST /api/alerts/send`.
- Produces: under-bubble control + modal; toast on success.

- [ ] **Step 1: Add `SendAlertModal`**

Props:

```ts
type SendAlertModalProps = {
  open: boolean;
  sourceMessagePreview: string;
  initialRoom: string;
  conversationId: string;
  messageId: string;
  onClose: () => void;
  onSent: () => void;
};
```

UI: white inputs, Room required, Note optional, Cancel / Send alert. On submit `POST /api/alerts/send` with JSON body. Show inline error. On success call `onSent` then `onClose` (parent shows toast or modal shows a brief success text before close — prefer a small success string in modal then close, or `window`/`setBanner` pattern already used in dashboard; match existing toast/banner if any).

- [ ] **Step 2: Wire `MessageThread`**

Add props:

```ts
enableSendAlert?: boolean; // true for Notify direct/channel threads
```

For each outbound non-system message when `enableSendAlert` and `extractRoomMention(body)`:

```tsx
<div className="flex flex-col items-end gap-1">
  <MessageBubble ... />
  <button
    type="button"
    className="text-xs font-medium text-indigo-700 underline"
    onClick={() => setAlertTarget({ messageId, body, room: extractRoomMention(body)! })}
  >
    Send alert
  </button>
</div>
```

Render `SendAlertModal` when `alertTarget` set.

Pass `enableSendAlert={Boolean(contact.notifyClientId || contact.notifyChannelId)}` from dashboard/embed parents.

- [ ] **Step 3: Remove inbound alert card branch**

In `MessageThread`, replace the `parseNotifyAlertDisplay` special-case with plain system-note centered text (same as other system notes). Remove unused import.

- [ ] **Step 4: Commit**

```bash
git add components/caretext/SendAlertModal.tsx components/caretext/MessageThread.tsx components/caretext/DashboardClient.tsx components/caretext/EmbedInboxClient.tsx
git commit -m "feat: Send alert control and modal on Notify room messages"
```

---

### Task 8: Remove inbound Alerts panel product UI

**Files:**
- Modify: `components/caretext/DashboardClient.tsx` — remove `<AlertsPanel />` imports/usages (desktop + mobile).
- Delete: `components/caretext/AlertsPanel.tsx`
- Delete or gut: `app/api/alerts/route.ts` (GET list) if unused.
- Optional: delete `app/api/webhooks/notify/alerts/route.ts` and `[facilityCode]/route.ts`, and stop calling `processNotifyAlertEvent` from product paths. If deleting, also trim dead inbound helpers later; acceptable to leave webhook files returning 410/404 with a short comment for one release.

**Interfaces:**
- Consumes: nothing.
- Produces: no Alerts panel in inbox UI.

- [ ] **Step 1: Remove panel from DashboardClient**

- [ ] **Step 2: Delete unused panel component + GET `/api/alerts` if nothing else imports them**

- [ ] **Step 3: Prefer deleting inbound webhook routes** (product non-goal). If kept temporarily, ensure they are not linked from UI.

- [ ] **Step 4: Run `npm test` and fix fallout from deleted imports**

- [ ] **Step 5: Commit**

```bash
git add -A components/caretext/DashboardClient.tsx components/caretext/AlertsPanel.tsx app/api/alerts app/api/webhooks/notify
git commit -m "chore: remove inbound Notify Alerts panel and unused list API"
```

---

### Task 9: End-to-end verification

**Files:** none (manual + automated suite)

- [ ] **Step 1: Run unit suite**

```bash
npm test
```

Expected: all pass, including `notify-room` and `notify-outbound-alert`.

- [ ] **Step 2: Manual checklist**

1. Notify contact has `commStackBaseUrl`, CommStack fields, and `notifyFacilityCode`.
2. Send outbound message containing `Room 214`.
3. **Send alert** appears under bubble; opens modal with room `214`.
4. Edit room / add note; submit.
5. On Notify acceptance: toast/success; no new system bubble in thread.
6. Message without room: no button.
7. Contact missing facility code: modal/API clear configuration error.
8. Confirm Alerts panel is gone from dashboard.

- [ ] **Step 3: Final commit if verification fixes were needed**

---

## Spec coverage check

| Spec requirement | Task |
|---|---|
| Outbound Postman `/palatiumCare` | 4, 5 |
| Under-bubble Send alert on room mention | 1, 7 |
| Modal room + optional note, light fields | 7 |
| `notifyFacilityCode` on contact | 2, 3, 6 |
| Host = `commStackBaseUrl` | 4, 5 |
| Toast only / no system note | 7 |
| Remove inbound panel + alert cards | 7, 8 |
| Clear out of scope | (no task) |
| Provisional auth/id/note mapping | 4 (documented) |
| Tests for room + payload + send failure | 1, 4, 5, 9 |

## Placeholder / Notify follow-ups (do not silently “fix”)

When Notify answers, update only:

1. Auth header in `sendOutboundNotifyAlert`
2. `id` generation/source in payload builder
3. Whether `note` is mapped into Notify JSON
4. Whether to include `building` / `resident` / `device`
