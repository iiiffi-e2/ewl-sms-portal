# Mobile Responsive Inbox Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make CareText’s protected shell and conversation inbox usable on phone-width viewports: hamburger nav with Sign out inside the menu, and a mobile conversation layout where the message thread is clearly visible above the composer.

**Architecture:** `TopNav` gains a client-side open/close menu below `lg`. `ConversationHeader` adds a `variant` prop (`full` | `slim`) so mobile shows name + facility + Call only. Status controls move into a small shared `ConversationStatusControls` component used by the full header and by the mobile details stack. `DashboardClient`’s mobile conversation pane drops the dual `flex-1` split: a fixed-height chat region holds header/thread/composer; Contact Details and related panels sit below and are reached by scrolling.

**Tech Stack:** Next.js 16 (App Router), React 19, Tailwind CSS v4, next-auth `signOut`, Vitest for any pure helpers (none required for this UI work). Component verification is manual at ~375px; run `npm run lint` after UI changes.

## Global Constraints

- Breakpoint for mobile vs desktop: **`lg` (1024px)** — same as today’s `DashboardClient` split. Do not introduce a different breakpoint for this work.
- Desktop (`lg+`) appearance and behavior must **match current production** (horizontal nav + Sign out; full conversation header; side-by-side thread | 320px sidebar).
- Embed inbox (`EmbedInboxClient` and related) is **out of scope** — do not change it.
- Slim mobile header contents: **contact name + facility + Call** (groups: title + participant count; Call stays disabled). Phone, status badge, and status dropdown are **not** in the slim header.
- Sign out on mobile: **only inside the hamburger menu** (hidden from the top bar below `lg`).
- Do not add new npm dependencies (no React Testing Library) unless absolutely required.
- Follow existing CareText component patterns and theme tokens (`border-border`, `text-muted`, indigo/emerald buttons already in use).

## File structure

| File | Responsibility |
|---|---|
| `components/caretext/TopNav.tsx` | Logo + desktop links/Sign out; mobile hamburger + menu panel including Sign out |
| `components/caretext/ConversationStatusControls.tsx` | Status badge + status `<select>` (shared by full header and mobile details stack) |
| `components/caretext/ConversationHeader.tsx` | `variant="full" \| "slim"`; full keeps today’s chrome; slim is name/facility/Call (+ admin ···) |
| `components/caretext/DashboardClient.tsx` | Mobile conversation column order and height budget; pass `variant` and render status below composer |

---

### Task 1: Mobile hamburger TopNav

**Files:**
- Modify: `components/caretext/TopNav.tsx`

**Interfaces:**
- Consumes: existing `TopNav({ isAdmin: boolean })` prop from `app/(protected)/layout.tsx` (unchanged).
- Produces: below `lg`, a hamburger that toggles a menu containing Dashboard, Contacts, admin Templates/Settings, and Sign out; at `lg+`, current horizontal nav + Sign out.

- [ ] **Step 1: Convert TopNav to interactive client nav with menu state**

Replace the contents of `components/caretext/TopNav.tsx` with:

```tsx
"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { useEffect, useId, useRef, useState } from "react";

const navLinkClass = "block rounded-lg px-3 py-2 text-sm text-muted hover:bg-slate-50 hover:text-foreground lg:inline lg:rounded-none lg:px-0 lg:py-0 lg:hover:bg-transparent";

export function TopNav({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!menuOpen) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMenuOpen(false);
        buttonRef.current?.focus();
      }
    }

    function onPointerDown(event: MouseEvent | TouchEvent) {
      const target = event.target as Node;
      if (panelRef.current?.contains(target) || buttonRef.current?.contains(target)) {
        return;
      }
      setMenuOpen(false);
    }

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
    };
  }, [menuOpen]);

  const links = (
    <>
      <Link href="/dashboard" className={navLinkClass} onClick={() => setMenuOpen(false)}>
        Dashboard
      </Link>
      <Link href="/contacts" className={navLinkClass} onClick={() => setMenuOpen(false)}>
        Contacts
      </Link>
      {isAdmin ? (
        <>
          <Link href="/templates" className={navLinkClass} onClick={() => setMenuOpen(false)}>
            Templates
          </Link>
          <Link href="/settings" className={navLinkClass} onClick={() => setMenuOpen(false)}>
            Settings
          </Link>
        </>
      ) : null}
    </>
  );

  return (
    <header className="relative mb-4 rounded-xl border border-border bg-white px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-4">
          <Link href="/dashboard" className="shrink-0" onClick={() => setMenuOpen(false)}>
            <Image
              src="/caretext-logo.png"
              alt="CareText"
              width={2200}
              height={500}
              className="h-auto w-[150px] sm:w-[195px]"
              priority
            />
          </Link>
          <nav className="hidden items-center gap-3 text-sm text-muted lg:flex">{links}</nav>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            className="hidden rounded-lg border border-border px-3 py-1.5 text-sm lg:inline-flex"
            onClick={() => signOut({ callbackUrl: "/login" })}
          >
            Sign out
          </button>
          <button
            ref={buttonRef}
            type="button"
            className="inline-flex items-center justify-center rounded-lg border border-border px-3 py-2 text-sm lg:hidden"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            aria-controls={menuId}
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? (
              <span aria-hidden="true" className="text-base leading-none">
                ✕
              </span>
            ) : (
              <span aria-hidden="true" className="flex flex-col gap-1">
                <span className="block h-0.5 w-4 bg-foreground" />
                <span className="block h-0.5 w-4 bg-foreground" />
                <span className="block h-0.5 w-4 bg-foreground" />
              </span>
            )}
          </button>
        </div>
      </div>

      {menuOpen ? (
        <div
          ref={panelRef}
          id={menuId}
          className="mt-3 border-t border-border pt-3 lg:hidden"
        >
          <nav className="flex flex-col gap-1">{links}</nav>
          <button
            type="button"
            className="mt-2 w-full rounded-lg border border-border px-3 py-2 text-left text-sm"
            onClick={() => signOut({ callbackUrl: "/login" })}
          >
            Sign out
          </button>
        </div>
      ) : null}
    </header>
  );
}
```

- [ ] **Step 2: Lint the nav change**

Run: `npx eslint components/caretext/TopNav.tsx`
Expected: no errors.

- [ ] **Step 3: Manual check (mobile + desktop)**

Run: `npm run dev` and open the app at ~375px width and at ≥1024px.

Expected at ~375px:
- Logo + hamburger only in the bar (no clipped Dashboard/Contacts/Templates; no Sign out in the bar)
- Menu opens with links + Sign out; Escape / outside tap closes; navigating closes

Expected at `lg+`:
- Horizontal links + Sign out button; no hamburger

- [ ] **Step 4: Commit**

```bash
git add components/caretext/TopNav.tsx
git commit -m "feat: add mobile hamburger menu to TopNav"
```

---

### Task 2: Extract status controls + slim ConversationHeader

**Files:**
- Create: `components/caretext/ConversationStatusControls.tsx`
- Modify: `components/caretext/ConversationHeader.tsx`

**Interfaces:**
- Consumes: existing `ConversationHeader` props from `DashboardClient` (status, onStatusChange, Call, etc.).
- Produces:
  - `ConversationStatusControls({ status, onStatusChange }: { status?: string; onStatusChange?: (status: string) => Promise<void> })`
  - `ConversationHeader` accepts optional `variant?: "full" | "slim"` (default `"full"`). Slim omits phone, status badge, and status select; keeps name/facility (or group title), Call, and admin ··· delete menu.

- [ ] **Step 1: Create `ConversationStatusControls`**

Create `components/caretext/ConversationStatusControls.tsx`:

```tsx
"use client";

import { useState } from "react";
import { StatusBadge } from "@/components/caretext/StatusBadge";

const statuses = ["new", "sms_sent", "awaiting_reply", "replied", "escalated", "closed"];

type ConversationStatusControlsProps = {
  status?: string;
  onStatusChange?: (status: string) => Promise<void>;
};

export function ConversationStatusControls({
  status,
  onStatusChange,
}: ConversationStatusControlsProps) {
  const [isSaving, setIsSaving] = useState(false);

  if (!status) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <StatusBadge status={status} />
      {onStatusChange ? (
        <select
          defaultValue={status}
          disabled={isSaving}
          className="rounded-lg border border-border px-2 py-1 text-xs"
          onChange={async (event) => {
            setIsSaving(true);
            try {
              await onStatusChange(event.target.value);
            } finally {
              setIsSaving(false);
            }
          }}
        >
          {statuses.map((statusValue) => (
            <option key={statusValue} value={statusValue}>
              {statusValue.replaceAll("_", " ")}
            </option>
          ))}
        </select>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: Add `variant` to `ConversationHeader`**

In `components/caretext/ConversationHeader.tsx`:

1. Import `ConversationStatusControls`.
2. Remove the local `statuses` constant (moved into the new component).
3. Extend props:

```tsx
type ConversationHeaderProps = {
  // ...existing props unchanged...
  variant?: "full" | "slim";
};
```

4. Default `variant = "full"` in the destructuring.
5. In the main return (non-empty phone / group branch), change the identity + controls block so:
   - **Identity (always):** group title + participant count, or contact name + facility (for slim) / contact name + phone + facility (for full).
   - **Status:** render `<ConversationStatusControls status={status} onStatusChange={onStatusChange} />` only when `variant === "full"`.
   - **Call button:** always (same enable/disable rules as today).
   - **Admin ··· menu:** keep for both variants when applicable.

Concrete identity markup for the non-group branch:

```tsx
{isGroup ? (
  <>
    <p className="text-lg font-semibold">{title || "Group conversation"}</p>
    <p className="text-sm text-muted">
      {(participants?.length ?? 0)} participant{(participants?.length ?? 0) === 1 ? "" : "s"}
    </p>
  </>
) : (
  <>
    <p className="text-lg font-semibold">{contactName || phone}</p>
    {variant === "full" ? <p className="text-sm text-muted">{phone}</p> : null}
    {facility ? (
      <p className="text-sm text-muted">
        {variant === "full" ? `Facility: ${facility}` : facility}
      </p>
    ) : null}
  </>
)}
```

And replace the inline status badge + `<select>` with:

```tsx
{variant === "full" ? (
  <ConversationStatusControls status={status} onStatusChange={onStatusChange} />
) : null}
```

Keep Call button + error message behavior unchanged. For slim, tighten padding if helpful (`p-3` instead of `p-4`) and keep Call at a slightly denser size (`px-4 py-2 text-sm`) so the header uses less vertical space — desktop `full` must keep current Call sizing (`px-5 py-3 text-base`).

Example Call className pattern:

```tsx
className={
  variant === "slim"
    ? "ml-auto min-w-[5.5rem] rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50 sm:ml-0"
    : "ml-auto min-w-[5.5rem] rounded-lg bg-emerald-600 px-5 py-3 text-base font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50 sm:ml-0"
}
```

Apply the same sizing split to the disabled group Call button.

- [ ] **Step 3: Lint**

Run: `npx eslint components/caretext/ConversationStatusControls.tsx components/caretext/ConversationHeader.tsx`
Expected: no errors.

- [ ] **Step 4: Smoke-check desktop header still full**

With `npm run dev`, open a conversation at `lg+`. Expected: name, phone, facility, status badge, status select, Call — same as before (default `variant="full"`).

- [ ] **Step 5: Commit**

```bash
git add components/caretext/ConversationStatusControls.tsx components/caretext/ConversationHeader.tsx
git commit -m "feat: add slim ConversationHeader variant and shared status controls"
```

---

### Task 3: Restructure mobile conversation pane in DashboardClient

**Files:**
- Modify: `components/caretext/DashboardClient.tsx` (mobile block only — the `lg:hidden` tree roughly lines 411–561)

**Interfaces:**
- Consumes: `ConversationHeader` `variant="slim"`; `ConversationStatusControls` for the mobile details stack.
- Produces: mobile vertical order — compact back → slim header (+ CallBar) → thread → composer → status + Contact Details + notes + call logs; thread visibly tall.

- [ ] **Step 1: Replace the mobile conversation `<section>` body**

Keep the outer mobile shell:

```tsx
<div className="flex h-[calc(100dvh-6.5rem)] min-h-0 flex-col gap-3 overflow-hidden lg:hidden">
```

and the list pane (`!showConversationPane`) unchanged.

Replace the `showConversationPane` branch (`<section>...</section>`) so it matches this structure (reuse the same data props / handlers already in the file — do not duplicate fetch logic):

```tsx
<section className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
  <button
    type="button"
    className="w-fit shrink-0 px-0 py-1 text-sm font-medium text-indigo-700 hover:underline"
    onClick={() => {
      clearConversationSelection();
      setIsNewConversation(false);
      setDraftPhone("");
    }}
  >
    ← Conversations
  </button>

  <div className="flex h-[calc(100dvh-11rem)] min-h-[22rem] shrink-0 flex-col gap-3">
    <div className="shrink-0 space-y-3">
      <ConversationHeader
        variant="slim"
        conversationId={activeConversation?.id}
        contactName={activeConversation?.contact?.name}
        phone={activeConversation?.contact?.phone}
        facility={activeConversation?.contact?.facility}
        status={activeConversation?.status}
        isDraft={isDraftConversation}
        isAdmin={isAdmin}
        isGroup={isGroupConversation}
        title={activeConversation?.title}
        participants={activeConversation?.participants}
        onStatusChange={async (status) => {
          if (!activeConversation) return;
          await fetch(`/api/conversations/${activeConversation.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status }),
          });
          await loadConversationDetail(activeConversation.id);
          await loadConversations();
        }}
        onDeleteConversation={
          activeConversation
            ? () => handleDeleteConversation(activeConversation.id)
            : undefined
        }
      />
      <CallBar />
    </div>

    <div className="min-h-0 flex-1 overflow-hidden">
      {isLoadingDetail ? (
        <ConversationThreadLoading />
      ) : (
        <MessageThread
          messages={activeConversation?.messages ?? []}
          callLogs={activeConversation?.callLogs ?? []}
          conversationId={conversationId ?? undefined}
          isGroup={isGroupConversation}
          participants={activeConversation?.participants}
          hasMoreOlder={hasMoreOlderMessages}
          isLoadingOlder={isLoadingOlder}
          onLoadEarlier={loadOlderMessages}
        />
      )}
    </div>

    <div className="shrink-0">
      {activeConversation && activeConversation.type === "group" ? (
        <GroupComposerArea
          conversationId={activeConversation.id}
          twilioConversationSid={activeConversation.twilioConversationSid ?? null}
          participants={activeConversation.participants ?? []}
          templates={templates}
          onSend={(body) => handleGroupSend(activeConversation.id, body)}
          onRefresh={() => {
            void loadConversationDetail(activeConversation.id);
            void loadConversations();
          }}
        />
      ) : (
        <ConversationComposerArea
          templates={templates}
          isDraft={isDraftConversation}
          conversationId={activeConversation?.id}
          consentStatus={activeConversation?.contact?.consentStatus}
          defaultPhone={defaultPhone}
          onPhoneChange={setDraftPhone}
          onIntroSent={handleIntroSent}
          onSend={handleSendMessage}
        />
      )}
    </div>
  </div>

  <div className="shrink-0 space-y-3 pb-2">
    <div className="rounded-xl border border-border bg-white p-4">
      <p className="mb-2 text-sm font-semibold">Status</p>
      <ConversationStatusControls
        status={activeConversation?.status}
        onStatusChange={
          activeConversation
            ? async (status) => {
                await fetch(`/api/conversations/${activeConversation.id}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ status }),
                });
                await loadConversationDetail(activeConversation.id);
                await loadConversations();
              }
            : undefined
        }
      />
      {activeConversation?.contact?.phone ? (
        <p className="mt-2 text-sm text-muted">{activeConversation.contact.phone}</p>
      ) : null}
    </div>
    <ContactDetailsCard
      contact={activeConversation?.contact ?? undefined}
      isDraft={isDraftConversation}
      draftPhone={draftPhone}
      onDraftPhoneChange={setDraftPhone}
      onCreate={handleCreateConversation}
      onUpdated={async () => {
        if (!activeConversation) return;
        await loadConversationDetail(activeConversation.id);
        await loadConversations();
      }}
    />
    <InternalNotesPanel
      conversationId={activeConversation?.id}
      notes={activeConversation?.notes ?? []}
      onCreated={(newNote) => {
        updateActiveConversation((current) => ({
          ...current,
          notes: [newNote, ...current.notes],
        }));
      }}
    />
    <CallLogsPanel callLogs={activeConversation?.callLogs ?? []} />
  </div>
</section>
```

Add the import at the top of `DashboardClient.tsx`:

```tsx
import { ConversationStatusControls } from "@/components/caretext/ConversationStatusControls";
```

Do **not** change the desktop `hidden lg:flex` tree except leaving `ConversationHeader` on default `variant="full"` (omit the prop).

- [ ] **Step 2: Lint**

Run: `npx eslint components/caretext/DashboardClient.tsx`
Expected: no errors.

- [ ] **Step 3: Manual mobile conversation verification**

At ~375px width with `npm run dev`:

1. Open a conversation that has message history.
2. Expected immediately visible: `← Conversations`, slim header (name + facility + Call), a **large** message thread, and the composer under it.
3. Contact Details must **not** share a 50/50 split that collapses the thread; scroll down past the composer to reach Status, Contact Details, notes, call logs.
4. Status select still updates conversation status.
5. Call from slim header still starts a call (or shows the same disabled/active states as today).
6. Back returns to the conversation list.
7. At `lg+`, layout unchanged (full header with status; sidebar contact details).

- [ ] **Step 4: Commit**

```bash
git add components/caretext/DashboardClient.tsx
git commit -m "fix: prioritize chat thread height on mobile conversation view"
```

---

### Task 4: End-to-end responsive pass

**Files:**
- None expected (verification only). Touch-up commits allowed if a prior task left a small visual gap (e.g. chat region height constant).

- [ ] **Step 1: Full checklist at ~375px**

| # | Check | Pass? |
|---|---|---|
| 1 | Nav bar: logo + hamburger only; no clipped links | |
| 2 | Menu: Dashboard, Contacts, (+ Templates/Settings if admin), Sign out | |
| 3 | Sign out not visible in the bar when menu closed | |
| 4 | Menu closes on navigate / Escape / outside tap | |
| 5 | Conversation list still usable | |
| 6 | Open thread: messages clearly visible without scrolling past Contact Details | |
| 7 | Composer under thread; Contact Details below after scroll | |
| 8 | Status controls below composer work | |
| 9 | Call from slim header works | |
| 10 | `← Conversations` returns to list | |

- [ ] **Step 2: Desktop regression at ≥1024px**

| # | Check | Pass? |
|---|---|---|
| 1 | Horizontal nav + Sign out; no hamburger | |
| 2 | Full header (phone + status + Call) | |
| 3 | Side-by-side thread \| contact sidebar | |

- [ ] **Step 3: Lint all touched files**

Run: `npx eslint components/caretext/TopNav.tsx components/caretext/ConversationHeader.tsx components/caretext/ConversationStatusControls.tsx components/caretext/DashboardClient.tsx`
Expected: no errors.

- [ ] **Step 4: Final commit only if Step 1–2 required code fixes**

If fixes were needed:

```bash
git add components/caretext/
git commit -m "fix: polish mobile inbox responsive layout"
```

If no code changes, skip the commit.

---

## Spec coverage checklist

| Spec requirement | Task |
|---|---|
| Hamburger nav below `lg`; links in menu | Task 1 |
| Sign out only in mobile menu | Task 1 |
| Desktop nav unchanged | Task 1, Task 4 |
| Slim header: name + facility + Call | Task 2 |
| Status/phone not in slim header | Task 2, Task 3 |
| Contact Details below composer | Task 3 |
| Compact back control | Task 3 |
| Remove 50/50 flex split; thread tall | Task 3 |
| Desktop conversation layout unchanged | Task 3, Task 4 |
| Embed out of scope | Global Constraints (no task touches it) |
