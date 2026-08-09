# Contact Edit & Soft-Delete Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let staff edit and soft-delete contacts from `/contacts`, and restore soft-deleted contacts by creating one with the same phone or Notify identity.

**Architecture:** Add `Contact.deletedAt` and filter it out of list/picker queries. `DELETE /api/contacts/[id]` sets `deletedAt`. Create-by-identity (`POST /api/contacts`) clears `deletedAt` when it matches a soft-deleted row. The contacts screen opens the existing `ContactDetailsCard` in a side panel and passes an `onDelete` callback so Delete appears only there—not in the dashboard sidebar.

**Tech Stack:** Next.js 16 (App Router), Prisma 6 + PostgreSQL, React 19, Vitest, Tailwind, Zod.

**Spec:** `docs/superpowers/specs/2026-08-08-contact-edit-delete-design.md`

## Global Constraints

- Soft-delete only — never hard-delete contacts.
- Soft-delete must **not** archive conversations or mutate messages.
- Restore is **only** via create-with-same-identity (no deleted-contacts browser / Restore button).
- Delete UI appears **only** on the contacts-screen details panel (opt-in callback); dashboard sidebar `ContactDetailsCard` must not show Delete.
- Auth stays `requireSession()` (not admin-only), matching existing contact PATCH/POST.
- Follow existing patterns: pure logic in `lib/*.ts` with colocated `*.test.ts` (Vitest); run with `npm test`.
- Do not expand scope into hard-delete tooling or cascading conversation archive.

## File structure

| File | Responsibility |
|---|---|
| `prisma/schema.prisma` | `Contact.deletedAt` + index |
| `prisma/migrations/<ts>_contact_soft_delete/` | Migration SQL |
| `lib/contact-soft-delete.ts` | Pure helpers: active filter, soft-deleted check, create-identity action |
| `lib/contact-soft-delete.test.ts` | Unit tests for those helpers |
| `app/api/contacts/route.ts` | GET excludes deleted; POST restores when soft-deleted |
| `app/api/contacts/[id]/route.ts` | DELETE soft-deletes; PATCH rejects deleted |
| `app/api/contacts/[id]/conversation/route.ts` | 404 if soft-deleted |
| `app/api/conversations/group/route.ts` | Only load non-deleted contacts |
| `app/api/webhooks/sms/route.ts` | Upsert clears `deletedAt` on match |
| `app/api/conversations/route.ts` | Contact upserts clear `deletedAt` on update |
| `app/api/messages/send/route.ts` | Phone upsert clears `deletedAt`; Notify lookups restore if soft-deleted |
| `components/caretext/ContactDetailsCard.tsx` | Optional `onDelete` affordance |
| `components/caretext/ContactsManager.tsx` | Edit panel + delete wiring + restore toast |

---

### Task 1: Schema — `Contact.deletedAt`

**Files:**
- Modify: `prisma/schema.prisma` (`Contact` model)
- Create: `prisma/migrations/<timestamp>_contact_soft_delete/migration.sql` (via `prisma migrate dev`)

**Interfaces:**
- Consumes: nothing.
- Produces: `Contact.deletedAt: DateTime?` and `@@index([deletedAt])` available to Prisma Client.

- [ ] **Step 1: Add the field to the schema**

In `prisma/schema.prisma`, on `model Contact`, after `updatedAt` and before the relations, add:

```prisma
  deletedAt                DateTime?
```

And with the other indexes add:

```prisma
  @@index([deletedAt])
```

- [ ] **Step 2: Create and apply the migration**

Run:

```bash
npx prisma migrate dev --name contact_soft_delete
```

Expected: migration folder created/applied; Prisma Client regenerated; no drift errors.

- [ ] **Step 3: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat: add Contact.deletedAt for soft-delete"
```

---

### Task 2: Soft-delete helpers (TDD)

**Files:**
- Create: `lib/contact-soft-delete.ts`
- Create: `lib/contact-soft-delete.test.ts`

**Interfaces:**
- Consumes: nothing (pure).
- Produces:
  - `ACTIVE_CONTACT_WHERE = { deletedAt: null } as const`
  - `isSoftDeleted(contact: { deletedAt: Date | null }): boolean`
  - `decideContactIdentityCreateAction(existing: { deletedAt: Date | null; hasActiveConversation: boolean }): "restore" | "conflict" | "reuse"`

- [ ] **Step 1: Write the failing tests**

Create `lib/contact-soft-delete.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  ACTIVE_CONTACT_WHERE,
  decideContactIdentityCreateAction,
  isSoftDeleted,
} from "@/lib/contact-soft-delete";

describe("ACTIVE_CONTACT_WHERE", () => {
  it("filters deletedAt null", () => {
    expect(ACTIVE_CONTACT_WHERE).toEqual({ deletedAt: null });
  });
});

describe("isSoftDeleted", () => {
  it("is true when deletedAt is set", () => {
    expect(isSoftDeleted({ deletedAt: new Date("2026-08-08T00:00:00Z") })).toBe(true);
  });

  it("is false when deletedAt is null", () => {
    expect(isSoftDeleted({ deletedAt: null })).toBe(false);
  });
});

describe("decideContactIdentityCreateAction", () => {
  it("restores soft-deleted contacts even with an active conversation", () => {
    expect(
      decideContactIdentityCreateAction({
        deletedAt: new Date("2026-08-08T00:00:00Z"),
        hasActiveConversation: true,
      }),
    ).toBe("restore");
  });

  it("conflicts when active contact already has an active conversation", () => {
    expect(
      decideContactIdentityCreateAction({
        deletedAt: null,
        hasActiveConversation: true,
      }),
    ).toBe("conflict");
  });

  it("reuses when active contact has no active conversation", () => {
    expect(
      decideContactIdentityCreateAction({
        deletedAt: null,
        hasActiveConversation: false,
      }),
    ).toBe("reuse");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- lib/contact-soft-delete.test.ts`

Expected: FAIL — module `@/lib/contact-soft-delete` not found (or exports missing).

- [ ] **Step 3: Implement helpers**

Create `lib/contact-soft-delete.ts`:

```ts
export const ACTIVE_CONTACT_WHERE = { deletedAt: null } as const;

export function isSoftDeleted(contact: { deletedAt: Date | null }): boolean {
  return contact.deletedAt != null;
}

export type ContactIdentityCreateAction = "restore" | "conflict" | "reuse";

export function decideContactIdentityCreateAction(existing: {
  deletedAt: Date | null;
  hasActiveConversation: boolean;
}): ContactIdentityCreateAction {
  if (existing.deletedAt != null) {
    return "restore";
  }
  if (existing.hasActiveConversation) {
    return "conflict";
  }
  return "reuse";
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- lib/contact-soft-delete.test.ts`

Expected: PASS (all tests green).

- [ ] **Step 5: Commit**

```bash
git add lib/contact-soft-delete.ts lib/contact-soft-delete.test.ts
git commit -m "feat: add contact soft-delete helper decisions"
```

---

### Task 3: Contact list GET + soft-delete DELETE

**Files:**
- Modify: `app/api/contacts/route.ts` (`GET`)
- Modify: `app/api/contacts/[id]/route.ts` (add `DELETE`)

**Interfaces:**
- Consumes: `ACTIVE_CONTACT_WHERE`, `isSoftDeleted` from `lib/contact-soft-delete.ts`
- Produces:
  - `GET /api/contacts` → only `deletedAt: null`
  - `DELETE /api/contacts/[id]` → sets `deletedAt`, or `404` if missing/already deleted

- [ ] **Step 1: Filter GET**

In `app/api/contacts/route.ts`, import `ACTIVE_CONTACT_WHERE` and merge it into the `findMany` `where`:

```ts
import { ACTIVE_CONTACT_WHERE } from "@/lib/contact-soft-delete";

// inside GET:
const contacts = await prisma.contact.findMany({
  where: {
    ...ACTIVE_CONTACT_WHERE,
    ...(smsOnly ? { phone: { not: null } } : {}),
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

- [ ] **Step 2: Implement DELETE on `[id]`**

In `app/api/contacts/[id]/route.ts`, import `isSoftDeleted` and add:

```ts
import { isSoftDeleted } from "@/lib/contact-soft-delete";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await requireSession();
  if ("error" in authResult) {
    return authResult.error;
  }

  const { id } = await params;
  const existing = await prisma.contact.findUnique({ where: { id } });
  if (!existing || isSoftDeleted(existing)) {
    return NextResponse.json({ error: "Contact not found." }, { status: 404 });
  }

  const contact = await prisma.contact.update({
    where: { id },
    data: { deletedAt: new Date() },
  });

  return NextResponse.json({ contact });
}
```

- [ ] **Step 3: Manual API smoke check**

With the app running and a session cookie:

1. `GET /api/contacts` — note a contact id.
2. `DELETE /api/contacts/<id>` — expect 200 and `deletedAt` set.
3. `GET /api/contacts` — that id must be absent.
4. `DELETE /api/contacts/<id>` again — expect 404.

- [ ] **Step 4: Commit**

```bash
git add app/api/contacts/route.ts app/api/contacts/[id]/route.ts
git commit -m "feat: soft-delete contacts and hide them from list"
```

---

### Task 4: PATCH guard + POST restore-by-identity

**Files:**
- Modify: `app/api/contacts/[id]/route.ts` (`PATCH`)
- Modify: `app/api/contacts/route.ts` (`POST`)

**Interfaces:**
- Consumes: `isSoftDeleted`, `decideContactIdentityCreateAction` from `lib/contact-soft-delete.ts`; `findContactByIdentity`, `contactHasActiveConversation` from `lib/contact-reuse.ts`
- Produces:
  - PATCH → `404` when soft-deleted
  - POST identity match → `{ restored: true }` when soft-deleted; else existing `409` / `reused` behavior; always clears `deletedAt` on reuse/restore update

- [ ] **Step 1: Guard PATCH**

After loading `existing` in `PATCH`, reject soft-deleted contacts:

```ts
if (!existing || isSoftDeleted(existing)) {
  return NextResponse.json({ error: "Contact not found." }, { status: 404 });
}
```

(Replace the current `if (!existing)` block.)

- [ ] **Step 2: Update POST identity reuse**

In `app/api/contacts/route.ts`, import helpers and replace the `if (existing) { ... }` block with:

```ts
import {
  decideContactIdentityCreateAction,
} from "@/lib/contact-soft-delete";

// inside POST, after findContactByIdentity:
if (existing) {
  const action = decideContactIdentityCreateAction({
    deletedAt: existing.deletedAt,
    hasActiveConversation: contactHasActiveConversation(existing),
  });

  if (action === "conflict") {
    return NextResponse.json(
      {
        error: notifyChannelId
          ? "An active conversation already exists for this Notify channel ID."
          : notifyClientId
            ? "An active conversation already exists for this Notify client ID."
            : "An active conversation already exists for this phone number.",
      },
      { status: 409 },
    );
  }

  const contact = await prisma.contact.update({
    where: { id: existing.id },
    data: {
      ...contactData,
      deletedAt: null,
    },
  });
  await provisionNotifyUser(contact);
  return NextResponse.json(
    {
      contact,
      ...(action === "restore" ? { restored: true } : { reused: true }),
    },
    { status: 200 },
  );
}
```

- [ ] **Step 3: Manual smoke check**

1. Soft-delete a contact (Task 3).
2. `POST /api/contacts` with the same phone/Notify identity and updated name.
3. Expect `200`, `restored: true`, `deletedAt: null`.
4. `GET /api/contacts` — contact reappears with the new fields.
5. `PATCH` a live contact — still works.
6. Soft-delete again, then `PATCH` — expect `404`.

- [ ] **Step 4: Commit**

```bash
git add app/api/contacts/route.ts app/api/contacts/[id]/route.ts
git commit -m "feat: restore soft-deleted contacts on create-by-identity"
```

---

### Task 5: Related endpoints — conversation, group, inbound upserts

**Files:**
- Modify: `app/api/contacts/[id]/conversation/route.ts`
- Modify: `app/api/conversations/group/route.ts`
- Modify: `app/api/webhooks/sms/route.ts`
- Modify: `app/api/conversations/route.ts` (contact upsert `update` branches)
- Modify: `app/api/messages/send/route.ts` (phone upsert + Notify findUnique restore)

**Interfaces:**
- Consumes: `ACTIVE_CONTACT_WHERE`, `isSoftDeleted`
- Produces: soft-deleted contacts cannot open conversations or join groups; inbound/create/send upserts clear `deletedAt`

- [ ] **Step 1: Block conversation open for soft-deleted contacts**

In `app/api/contacts/[id]/conversation/route.ts`:

```ts
import { isSoftDeleted } from "@/lib/contact-soft-delete";

const contact = await prisma.contact.findUnique({
  where: { id },
  select: { id: true, deletedAt: true },
});

if (!contact || isSoftDeleted(contact)) {
  return NextResponse.json({ error: "Contact not found." }, { status: 404 });
}
```

- [ ] **Step 2: Group create only loads active contacts**

In `app/api/conversations/group/route.ts`:

```ts
import { ACTIVE_CONTACT_WHERE } from "@/lib/contact-soft-delete";

const contacts = await prisma.contact.findMany({
  where: { id: { in: uniqueContactIds }, ...ACTIVE_CONTACT_WHERE },
});
```

(Soft-deleted ids then fail the existing length check → `"One or more contacts were not found."`)

- [ ] **Step 3: SMS webhook upsert restores on inbound**

In `app/api/webhooks/sms/route.ts`, change the contact upsert `update` from `{}` to clear soft-delete:

```ts
const contact = await prisma.contact.upsert({
  where: { phone: normalizedPhone },
  update: { deletedAt: null },
  create: { phone: normalizedPhone },
});
```

- [ ] **Step 4: Conversation-create contact upserts restore**

In `app/api/conversations/route.ts`:

1. Add `deletedAt: null` to the shared `notifyUpdate` object used by Notify upserts.
2. Add `deletedAt: null` to the phone upsert `update` object.

Do not change create payloads.

- [ ] **Step 5: Message-send path restores soft-deleted contacts**

In `app/api/messages/send/route.ts`:

1. On the phone `upsert`, add `deletedAt: null` to `update`.
2. After any `findUnique` that loads a contact by `notifyClientId` / `notifyChannelId`, if `isSoftDeleted(contact)`, run:

```ts
contact = await prisma.contact.update({
  where: { id: contact.id },
  data: { deletedAt: null },
});
```

so outbound Notify send does not leave the contact soft-deleted while messaging.

- [ ] **Step 6: Commit**

```bash
git add app/api/contacts/[id]/conversation/route.ts app/api/conversations/group/route.ts app/api/webhooks/sms/route.ts app/api/conversations/route.ts app/api/messages/send/route.ts
git commit -m "fix: honor contact soft-delete in conversation and inbound paths"
```

---

### Task 6: `ContactDetailsCard` optional delete

**Files:**
- Modify: `components/caretext/ContactDetailsCard.tsx`

**Interfaces:**
- Consumes: optional `onDelete?: () => Promise<void> | void`
- Produces: Delete button + confirm only when `onDelete` is provided and not draft mode; dashboard usage unchanged when prop omitted

- [ ] **Step 1: Extend props and local delete state**

Update the props type and component signature:

```ts
type ContactDetailsCardProps = {
  contact?: Contact;
  isDraft?: boolean;
  draftPhone?: string;
  onDraftPhoneChange?: (phone: string) => void;
  onCreate?: (payload: SmsCreatePayload | NotifyCreatePayload) => Promise<void> | void;
  onUpdated?: () => Promise<void> | void;
  onDelete?: () => Promise<void> | void;
};

export function ContactDetailsCard({
  contact,
  isDraft = false,
  draftPhone = "",
  onDraftPhoneChange,
  onCreate,
  onUpdated,
  onDelete,
}: ContactDetailsCardProps) {
  // existing state...
  const [isDeleting, setIsDeleting] = useState(false);
```

- [ ] **Step 2: Add delete handler**

Inside the component (near other handlers):

```ts
async function handleDelete() {
  if (!onDelete || !contact) return;
  const confirmed = window.confirm(
    "Delete this contact? They can be restored by creating a contact with the same phone/Notify ID.",
  );
  if (!confirmed) return;

  setIsDeleting(true);
  setError(null);
  setSuccess(null);
  try {
    await onDelete();
  } catch (deleteError) {
    setError(deleteError instanceof Error ? deleteError.message : "Could not delete contact.");
  } finally {
    setIsDeleting(false);
  }
}
```

- [ ] **Step 3: Render Delete control**

Below the form (still inside the outer card `div`, after `</form>`), only when delete is allowed:

```tsx
{onDelete && contact && !isDraftMode ? (
  <div className="mt-3 border-t border-border pt-3">
    <button
      type="button"
      disabled={isDeleting || isEditing}
      onClick={() => void handleDelete()}
      className="w-full rounded-lg border border-rose-300 px-3 py-2 text-sm font-semibold text-rose-700 disabled:opacity-60"
    >
      {isDeleting ? "Deleting..." : "Delete contact"}
    </button>
  </div>
) : null}
```

Do **not** pass `onDelete` from `DashboardClient` (or any inbox usage).

- [ ] **Step 4: Commit**

```bash
git add components/caretext/ContactDetailsCard.tsx
git commit -m "feat: optional delete action on ContactDetailsCard"
```

---

### Task 7: Contacts screen — edit panel + delete + restore notice

**Files:**
- Modify: `components/caretext/ContactsManager.tsx`

**Interfaces:**
- Consumes: `ContactDetailsCard` with `onUpdated` / `onDelete`; `DELETE /api/contacts/[id]`; create response `restored`
- Produces: Edit opens side panel; delete confirms via card; create shows “Contact restored” when applicable

- [ ] **Step 1: Add selection + success state**

Near existing state in `ContactsManager`:

```ts
import { ContactDetailsCard } from "@/components/caretext/ContactDetailsCard";

const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
const [success, setSuccess] = useState<string | null>(null);

const selectedContact = contacts.find((c) => c.id === selectedContactId) ?? null;
```

- [ ] **Step 2: Wire create restore message**

In `handleCreate`, when `response.ok`, parse JSON and set success before resetting:

```ts
const data = await response.json().catch(() => null);
resetForm();
setIsFormOpen(false);
setSuccess(data?.restored ? "Contact restored" : null);
await loadContacts();
return;
```

(Remove the early `return` that skipped parsing; keep error handling for non-OK responses.)

- [ ] **Step 3: Add delete handler used by the panel**

```ts
async function handleDeleteSelected() {
  if (!selectedContactId) return;
  const response = await fetch(`/api/contacts/${selectedContactId}`, {
    method: "DELETE",
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(
      typeof data?.error === "string" ? data.error : "Could not delete contact.",
    );
  }
  setSelectedContactId(null);
  setSuccess(null);
  await loadContacts();
}
```

- [ ] **Step 4: Add Edit button on each list card**

Replace the single Send Message button area with a button group:

```tsx
<div className="flex shrink-0 flex-col gap-2 sm:items-end">
  <button
    type="button"
    className="rounded-lg border border-border bg-white px-3 py-2 text-sm font-medium"
    onClick={() => {
      setSelectedContactId(contact.id);
      setError(null);
      setSuccess(null);
    }}
  >
    Edit
  </button>
  <button
    type="button"
    disabled={messagingContactId === contact.id}
    className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
    onClick={() => void handleSendMessage(contact.id)}
  >
    {messagingContactId === contact.id ? "Opening..." : "Send Message"}
  </button>
</div>
```

- [ ] **Step 5: Layout list + side panel**

Wrap the contacts list section and add the panel. Structure:

```tsx
{success ? <p className="text-sm text-emerald-700">{success}</p> : null}

<div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
  <div className="space-y-2 rounded-xl border border-border bg-white p-4">
    {/* existing contacts.map list */}
  </div>

  {selectedContact ? (
    <div className="lg:sticky lg:top-4 lg:self-start">
      <div className="mb-2 flex justify-end">
        <button
          type="button"
          className="text-sm font-medium text-muted underline-offset-2 hover:underline"
          onClick={() => setSelectedContactId(null)}
        >
          Close
        </button>
      </div>
      <ContactDetailsCard
        contact={selectedContact}
        onUpdated={async () => {
          await loadContacts();
        }}
        onDelete={handleDeleteSelected}
      />
    </div>
  ) : null}
</div>
```

Notes:

- Keep the search / new-contact card above this grid.
- `Contact` type fields already on the list card cover what `ContactDetailsCard` needs; if TypeScript complains about missing `emergencyContact*` fields, extend the local `Contact` type and rely on GET returning those Prisma columns (they are already on the model — include them in the type as `string | null`).

- [ ] **Step 6: Manual UI check**

1. `/contacts` → Edit opens panel with details; Save updates list; panel stays open.
2. Delete in panel → confirm → contact disappears; panel closes.
3. Dashboard inbox contact sidebar → no Delete button.
4. New contact with soft-deleted identity → “Contact restored” and contact returns to list.

- [ ] **Step 7: Run unit tests**

Run: `npm test -- lib/contact-soft-delete.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add components/caretext/ContactsManager.tsx
git commit -m "feat: edit and soft-delete contacts from contacts screen"
```

---

## Spec coverage checklist

| Spec requirement | Task |
|---|---|
| `Contact.deletedAt` + index | Task 1 |
| GET excludes soft-deleted | Task 3 |
| DELETE soft-deletes / 404 if already deleted | Task 3 |
| PATCH rejects soft-deleted | Task 4 |
| POST restore-by-identity (`restored: true`) | Task 4 |
| Conversation open 404 when deleted | Task 5 |
| Group picker excludes deleted | Task 5 |
| Inbound SMS upsert restores | Task 5 |
| Conversation create upsert restores | Task 5 |
| Message-send upsert / Notify lookup restores | Task 5 |
| Edit via `ContactDetailsCard` side panel | Task 7 |
| Delete only when contacts screen passes callback | Tasks 6–7 |
| Restore success copy on create | Task 7 |
| No hard-delete / no deleted browser / no cascade archive | Global constraints (no tasks) |

## Self-review notes

- No TBD/placeholder steps.
- Helper action names (`restore` / `conflict` / `reuse`) match POST response flags used in Task 7.
- Delete confirm copy matches the approved spec.
- Dashboard path intentionally never receives `onDelete`.
