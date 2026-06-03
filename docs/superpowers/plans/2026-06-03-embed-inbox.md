# Embed Inbox Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an embed-first simplified inbox at `/embed/inbox` (thread list, messages, composer, Call) that can be iframe-embedded on any external domain, with login inside the iframe.

**Architecture:** Dedicated `(embed)` route group with minimal layout (no TopNav), new `EmbedInboxClient` composing existing caretext components, embed-specific middleware for `frame-ancestors *` and `/embed/login` redirects, and a parameterized `LoginForm` callback URL. Reuses all existing API routes unchanged.

**Tech Stack:** Next.js 16 (App Router), NextAuth v4 (JWT credentials), React 19, Tailwind 4, Twilio Voice SDK, Vitest.

**Spec:** `docs/superpowers/specs/2026-06-03-embed-inbox-design.md`

---

## File Structure

**Create:**
- `lib/embed.ts` — embed path constants + `applyEmbedResponseHeaders()` helper (unit-tested).
- `lib/embed.test.ts` — Vitest tests for `lib/embed.ts`.
- `app/(embed)/layout.tsx` — full-viewport embed shell with `AuthProvider`.
- `app/(embed)/embed/login/page.tsx` — embed login page.
- `app/(embed)/embed/inbox/page.tsx` — embed inbox page.
- `app/(embed)/embed/test-host/page.tsx` — same-origin iframe smoke-test page.
- `components/caretext/EmbedConversationHeader.tsx` — name, phone, Call only.
- `components/caretext/EmbedNewConversationForm.tsx` — phone + optional name for new threads.
- `components/caretext/EmbedInboxClient.tsx` — simplified inbox client.

**Modify:**
- `middleware.ts` — embed matcher, headers, embed login redirect.
- `components/caretext/LoginForm.tsx` — optional `callbackUrl` prop.
- `lib/auth.ts` — optional cross-origin iframe cookie settings via env flag.

**Testing note:** Follow existing project pattern: unit-test pure `lib/*` helpers only; route/UI wiring verified via `npm run lint`, `npm run test`, `npm run build`, and manual checklist from the spec.

---

## Task 1: Embed helpers (`lib/embed.ts`)

**Files:**
- Create: `lib/embed.ts`
- Create: `lib/embed.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/embed.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import {
  EMBED_INBOX_PATH,
  EMBED_LOGIN_PATH,
  applyEmbedResponseHeaders,
  buildEmbedLoginUrl,
} from "@/lib/embed";

describe("embed helpers", () => {
  it("builds embed login url with callback", () => {
    expect(buildEmbedLoginUrl("/embed/inbox")).toBe("/embed/login?callbackUrl=%2Fembed%2Finbox");
    expect(buildEmbedLoginUrl("/embed/inbox?conversationId=abc")).toBe(
      "/embed/login?callbackUrl=%2Fembed%2Finbox%3FconversationId%3Dabc",
    );
  });

  it("sets frame-ancestors header", () => {
    const response = new Response(null, { status: 200 });
    applyEmbedResponseHeaders(response);
    expect(response.headers.get("Content-Security-Policy")).toBe("frame-ancestors *");
  });

  it("exports stable paths", () => {
    expect(EMBED_LOGIN_PATH).toBe("/embed/login");
    expect(EMBED_INBOX_PATH).toBe("/embed/inbox");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- lib/embed.test.ts`
Expected: FAIL — module `@/lib/embed` not found.

- [ ] **Step 3: Write minimal implementation**

Create `lib/embed.ts`:

```typescript
import { NextResponse } from "next/server";

export const EMBED_LOGIN_PATH = "/embed/login";
export const EMBED_INBOX_PATH = "/embed/inbox";
export const EMBED_FRAME_ANCESTORS = "*";

export function buildEmbedLoginUrl(callbackUrl: string): string {
  const params = new URLSearchParams({ callbackUrl });
  return `${EMBED_LOGIN_PATH}?${params.toString()}`;
}

export function applyEmbedResponseHeaders(response: Response): Response {
  response.headers.set("Content-Security-Policy", `frame-ancestors ${EMBED_FRAME_ANCESTORS}`);
  return response;
}

export function applyEmbedResponseHeadersToNextResponse(response: NextResponse): NextResponse {
  response.headers.set("Content-Security-Policy", `frame-ancestors ${EMBED_FRAME_ANCESTORS}`);
  return response;
}

export function isEmbedPath(pathname: string): boolean {
  return pathname === EMBED_LOGIN_PATH || pathname.startsWith(`${EMBED_INBOX_PATH}`);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- lib/embed.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/embed.ts lib/embed.test.ts
git commit -m "feat: add embed path helpers and frame-ancestors header utility"
```

---

## Task 2: Middleware — embed auth redirect and headers

**Files:**
- Modify: `middleware.ts`

- [ ] **Step 1: Extend matcher and embed redirect logic**

Replace `middleware.ts` with:

```typescript
import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";
import {
  applyEmbedResponseHeadersToNextResponse,
  buildEmbedLoginUrl,
  isEmbedPath,
} from "@/lib/embed";

export default withAuth(
  function middleware(req) {
    const { pathname, search } = req.nextUrl;
    const callbackPath = `${pathname}${search}`;

    if (isEmbedPath(pathname) && pathname !== "/embed/login" && !req.nextauth.token) {
      const redirect = NextResponse.redirect(new URL(buildEmbedLoginUrl(callbackPath), req.url));
      return applyEmbedResponseHeadersToNextResponse(redirect);
    }

    const response = NextResponse.next();
    if (isEmbedPath(pathname)) {
      return applyEmbedResponseHeadersToNextResponse(response);
    }

    return response;
  },
  {
    callbacks: {
      authorized: ({ token, req }) => {
        const { pathname } = req.nextUrl;

        if (pathname.startsWith("/embed/login")) {
          return true;
        }

        if (isEmbedPath(pathname)) {
          return true;
        }

        if (!token) {
          return false;
        }

        if (pathname.startsWith("/templates")) {
          return token.role === "admin";
        }

        if (pathname.startsWith("/api/templates") && req.method !== "GET") {
          return token.role === "admin";
        }

        return true;
      },
    },
  },
);

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/templates/:path*",
    "/contacts/:path*",
    "/conversations/:path*",
    "/embed/:path*",
    "/api/messages/:path*",
    "/api/conversations/:path*",
    "/api/contacts/:path*",
    "/api/templates/:path*",
    "/api/calls/:path*",
    "/api/voice/:path*",
  ],
};
```

- [ ] **Step 2: Run lint**

Run: `npm run lint`
Expected: no errors in `middleware.ts`.

- [ ] **Step 3: Commit**

```bash
git add middleware.ts
git commit -m "feat: add embed middleware with frame-ancestors and login redirect"
```

---

## Task 3: Parameterize `LoginForm` callback URL

**Files:**
- Modify: `components/caretext/LoginForm.tsx`

- [ ] **Step 1: Add `callbackUrl` prop and use it on success**

Replace the component signature and submit handler in `components/caretext/LoginForm.tsx`:

```typescript
"use client";

import { FormEvent, useState } from "react";
import { signIn } from "next-auth/react";

type LoginFormProps = {
  callbackUrl?: string;
};

export function LoginForm({ callbackUrl = "/dashboard" }: LoginFormProps) {
  const [email, setEmail] = useState("admin@example.com");
  const [password, setPassword] = useState("password123");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
      callbackUrl,
    });

    setLoading(false);
    if (result?.error) {
      setError("Invalid credentials.");
      return;
    }

    window.location.href = callbackUrl;
  }

  // ... rest of JSX unchanged ...
}
```

Keep the existing form JSX below the handler unchanged.

- [ ] **Step 2: Run lint**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/caretext/LoginForm.tsx
git commit -m "feat: allow LoginForm to redirect to a custom callback URL"
```

---

## Task 4: Embed layout and login page

**Files:**
- Create: `app/(embed)/layout.tsx`
- Create: `app/(embed)/embed/login/page.tsx`

- [ ] **Step 1: Create embed layout**

Create `app/(embed)/layout.tsx`:

```tsx
import { AuthProvider } from "@/components/caretext/AuthProvider";

export default function EmbedLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <AuthProvider>
      <div className="h-dvh min-h-0 overflow-hidden p-2">{children}</div>
    </AuthProvider>
  );
}
```

- [ ] **Step 2: Create embed login page**

Create `app/(embed)/embed/login/page.tsx`:

```tsx
import Image from "next/image";
import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth";
import { LoginForm } from "@/components/caretext/LoginForm";
import { EMBED_INBOX_PATH } from "@/lib/embed";

type LoginPageProps = {
  searchParams: Promise<{ callbackUrl?: string }>;
};

export default async function EmbedLoginPage({ searchParams }: LoginPageProps) {
  const session = await getAuthSession();
  const { callbackUrl } = await searchParams;
  const safeCallbackUrl =
    callbackUrl && callbackUrl.startsWith("/embed/") ? callbackUrl : EMBED_INBOX_PATH;

  if (session?.user) {
    redirect(safeCallbackUrl);
  }

  return (
    <main className="flex h-full items-center justify-center">
      <div className="w-full max-w-md rounded-xl border border-border bg-white p-6 shadow-sm">
        <div className="mb-2 flex justify-center">
          <Image
            src="/caretext-logo.png"
            alt="CareText"
            width={1024}
            height={232}
            className="h-10 w-auto"
            priority
          />
        </div>
        <p className="mb-4 text-center text-sm text-muted">Sign in to open the CareText inbox.</p>
        <LoginForm callbackUrl={safeCallbackUrl} />
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Run build (compile check)**

Run: `npm run build`
Expected: compiles; new routes listed.

- [ ] **Step 4: Commit**

```bash
git add app/(embed)/layout.tsx app/(embed)/embed/login/page.tsx
git commit -m "feat: add embed layout and login page"
```

---

## Task 5: `EmbedConversationHeader`

**Files:**
- Create: `components/caretext/EmbedConversationHeader.tsx`

- [ ] **Step 1: Create slim header with Call button only**

Create `components/caretext/EmbedConversationHeader.tsx`:

```tsx
"use client";

import { useVoiceCall } from "@/components/caretext/VoiceCallProvider";

type EmbedConversationHeaderProps = {
  conversationId?: string;
  contactName?: string | null;
  phone?: string;
  isDraft?: boolean;
};

export function EmbedConversationHeader({
  conversationId,
  contactName,
  phone,
  isDraft,
}: EmbedConversationHeaderProps) {
  const { startCall, isCallActive, callPhase, errorMessage } = useVoiceCall();
  const isStartingCall = callPhase === "connecting";

  if (!phone) {
    return (
      <div className="rounded-xl border border-border bg-white p-4">
        <p className="text-lg font-semibold">{isDraft ? "New Conversation" : "Conversation"}</p>
        <p className="text-sm text-muted">
          {isDraft ? "Enter a phone number to start." : "Select a conversation from the list."}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-lg font-semibold">{contactName || phone}</p>
          <p className="text-sm text-muted">{phone}</p>
        </div>
        <button
          type="button"
          disabled={!conversationId || isCallActive || isStartingCall}
          className="min-w-[5.5rem] rounded-lg bg-emerald-600 px-5 py-3 text-base font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          onClick={async () => {
            if (!conversationId || !phone) return;
            await startCall({ conversationId, phone, contactName });
          }}
        >
          {isStartingCall ? "Calling..." : "Call"}
        </button>
      </div>
      {errorMessage ? <p className="mt-2 text-xs text-rose-600">{errorMessage}</p> : null}
    </div>
  );
}
```

- [ ] **Step 2: Run lint**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/caretext/EmbedConversationHeader.tsx
git commit -m "feat: add slim embed conversation header with call action"
```

---

## Task 6: `EmbedNewConversationForm`

**Files:**
- Create: `components/caretext/EmbedNewConversationForm.tsx`

- [ ] **Step 1: Create minimal new-conversation form**

Create `components/caretext/EmbedNewConversationForm.tsx`:

```tsx
"use client";

import { FormEvent, useState } from "react";

type EmbedNewConversationFormProps = {
  onCreate: (payload: { name: string; phone: string }) => Promise<void>;
};

export function EmbedNewConversationForm({ onCreate }: EmbedNewConversationFormProps) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setError(null);

    try {
      await onCreate({ name: name.trim(), phone: phone.trim() });
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Failed to create conversation.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form className="space-y-3 rounded-xl border border-border bg-white p-4" onSubmit={onSubmit}>
      <p className="text-sm font-semibold">Start a new conversation</p>
      <div>
        <label className="mb-1 block text-sm font-medium">Phone</label>
        <input
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          className="w-full rounded-lg border border-border px-3 py-2 text-sm"
          placeholder="+15551234567"
          required
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium">Name (optional)</label>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="w-full rounded-lg border border-border px-3 py-2 text-sm"
          placeholder="Contact name"
        />
      </div>
      {error ? <p className="text-sm text-rose-600">{error}</p> : null}
      <button
        type="submit"
        disabled={isSaving}
        className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
      >
        {isSaving ? "Creating..." : "Start conversation"}
      </button>
    </form>
  );
}
```

- [ ] **Step 2: Run lint**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/caretext/EmbedNewConversationForm.tsx
git commit -m "feat: add minimal embed new-conversation form"
```

---

## Task 7: `EmbedInboxClient` (main inbox UI)

**Files:**
- Create: `components/caretext/EmbedInboxClient.tsx`
- Create: `app/(embed)/embed/inbox/page.tsx`

- [ ] **Step 1: Create inbox page**

Create `app/(embed)/embed/inbox/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth";
import { EmbedInboxClient } from "@/components/caretext/EmbedInboxClient";
import { buildEmbedLoginUrl, EMBED_INBOX_PATH } from "@/lib/embed";

export default async function EmbedInboxPage({
  searchParams,
}: {
  searchParams: Promise<{ conversationId?: string }>;
}) {
  const session = await getAuthSession();
  if (!session?.user) {
    redirect(buildEmbedLoginUrl(EMBED_INBOX_PATH));
  }

  const { conversationId } = await searchParams;
  return <EmbedInboxClient initialConversationId={conversationId} />;
}
```

- [ ] **Step 2: Create `EmbedInboxClient`**

Create `components/caretext/EmbedInboxClient.tsx` by copying the data-fetching/state patterns from `components/caretext/DashboardClient.tsx` with these constraints:

**Include:**
- State: `search`, `isNewConversation`, `draftPhone`, `conversationId`, `conversations`, `templates`, `activeConversation`
- Loaders: `loadConversations`, `loadTemplates`, `loadConversationDetail` (same fetch URLs as dashboard)
- 5s polling interval for list + active thread
- `handleCreateConversation` — POST `/api/conversations` with `{ name, phone }` only (same error parsing as dashboard)
- Desktop layout: left aside (search, New Conversation button, `ConversationList` with `isAdmin={false}`, no `onDelete`); right column (`EmbedConversationHeader`, `CallBar`, `MessageThread` with `callLogs`, `ConversationComposerArea` or draft UI)
- Mobile layout: list OR conversation with Back button (same `showConversationPane` pattern as dashboard)
- Wrap in `VoiceCallProvider`

**Draft / new conversation behavior:**
- When `isNewConversation && !activeConversation`, render `EmbedNewConversationForm` in the main pane instead of `MessageThread` + composer
- On successful create: set `conversationId`, clear draft state, set `activeConversation` from response

**Exclude:**
- `ContactDetailsCard`, `InternalNotesPanel`, `CallLogsPanel`, `ConversationHeader`
- Desktop notifications (`Notification` API effects)
- Admin delete, status change, `isAdmin` usage

**Height:** use `h-[calc(100dvh-1rem)]` (embed layout has `p-2`) instead of dashboard's `calc(100dvh-6.5rem)`.

**Composer send handler:** identical to dashboard — POST `/api/messages/send`, then refresh list + detail.

Reference implementation skeleton:

```tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ConversationList } from "@/components/caretext/ConversationList";
import { MessageThread } from "@/components/caretext/MessageThread";
import { ConversationComposerArea } from "@/components/caretext/ConversationComposerArea";
import { VoiceCallProvider } from "@/components/caretext/VoiceCallProvider";
import { CallBar } from "@/components/caretext/CallBar";
import { EmbedConversationHeader } from "@/components/caretext/EmbedConversationHeader";
import { EmbedNewConversationForm } from "@/components/caretext/EmbedNewConversationForm";

// Copy ConversationListResponse and ConversationDetail types from DashboardClient.tsx

export function EmbedInboxClient({ initialConversationId }: { initialConversationId?: string }) {
  // ... same state + loaders + polling as DashboardClient (omit notification effects) ...

  const defaultPhone = useMemo(
    () => activeConversation?.contact.phone ?? draftPhone,
    [activeConversation, draftPhone],
  );
  const showConversationPane = isNewConversation || Boolean(conversationId);
  const isDraftConversation = isNewConversation && !activeConversation;

  // handleCreateConversation — POST { name, phone } only

  return (
    <VoiceCallProvider>
      {/* Mobile block: mirror DashboardClient mobile list/conversation split */}
      {/* Desktop block: lg:flex two-column layout without right sidebar */}
    </VoiceCallProvider>
  );
}
```

Implement both mobile and desktop blocks fully before proceeding (copy structure from `DashboardClient.tsx` lines 276–422 and 426–532, substituting components per constraints above).

- [ ] **Step 3: Run lint and build**

Run: `npm run lint && npm run build`
Expected: PASS with no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add components/caretext/EmbedInboxClient.tsx app/(embed)/embed/inbox/page.tsx
git commit -m "feat: add embed inbox client and page"
```

---

## Task 8: Same-origin iframe test host page

**Files:**
- Create: `app/(embed)/embed/test-host/page.tsx`

- [ ] **Step 1: Create test host page**

Create `app/(embed)/embed/test-host/page.tsx`:

```tsx
import { EMBED_INBOX_PATH } from "@/lib/embed";

export default function EmbedTestHostPage() {
  return (
    <main className="space-y-3 p-4">
      <h1 className="text-lg font-semibold">Embed inbox — same-origin test host</h1>
      <p className="text-sm text-muted">
        Confirms iframe framing headers and full-height layout. Use an external HTML file for cross-domain
        testing.
      </p>
      <iframe
        src={EMBED_INBOX_PATH}
        title="CareText embed inbox"
        className="h-[700px] w-full rounded-xl border border-border"
        allow="microphone"
      />
    </main>
  );
}
```

- [ ] **Step 2: Manual smoke test**

Run: `npm run dev`

Visit: `http://localhost:3000/embed/test-host`
Expected: iframe loads inbox (redirects to embed login if logged out); after login, two-column inbox visible inside iframe.

- [ ] **Step 3: Commit**

```bash
git add app/(embed)/embed/test-host/page.tsx
git commit -m "feat: add same-origin embed iframe test host page"
```

---

## Task 9: Cross-origin iframe cookie support (optional env flag)

**Files:**
- Modify: `lib/auth.ts`

- [ ] **Step 1: Add env-gated cookie settings for production cross-domain embeds**

In `lib/auth.ts`, add after imports:

```typescript
const useCrossOriginEmbedCookies = process.env.NEXTAUTH_EMBED_CROSS_ORIGIN === "true";
```

Add to `authOptions` (top level, sibling to `session`):

```typescript
  cookies: useCrossOriginEmbedCookies
    ? {
        sessionToken: {
          name: "__Secure-next-auth.session-token",
          options: {
            httpOnly: true,
            sameSite: "none",
            path: "/",
            secure: true,
          },
        },
      }
    : undefined,
```

Document in a code comment: set `NEXTAUTH_EMBED_CROSS_ORIGIN=true` only on HTTPS deployments where the inbox is embedded on another origin.

- [ ] **Step 2: Run lint and test**

Run: `npm run lint && npm run test`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add lib/auth.ts
git commit -m "feat: add optional cross-origin embed session cookie settings"
```

---

## Task 10: Final verification

**Files:** (none — verification only)

- [ ] **Step 1: Run full checks**

Run: `npm run lint && npm run test && npm run build`
Expected: all pass.

- [ ] **Step 2: Manual checklist (from spec)**

Standalone:
- [ ] `/embed/inbox` loads after login; no TopNav
- [ ] Search filters list
- [ ] New Conversation form creates thread
- [ ] Send message works; opt-in gate still enforced
- [ ] Call button initiates voice flow

Embed:
- [ ] `/embed/test-host` shows inbox inside iframe
- [ ] Response headers include `Content-Security-Policy: frame-ancestors *` on `/embed/inbox`

Regression:
- [ ] `/dashboard` unchanged (TopNav, right sidebar still present)

- [ ] **Step 3: Commit any fixups**

If fixes were needed during verification, commit them separately with message `fix: embed inbox verification follow-ups`.

---

## Spec coverage (self-review)

| Spec requirement | Task |
|---|---|
| `/embed/inbox`, `/embed/login` routes | Tasks 4, 7 |
| No TopNav, minimal padding | Task 4 layout |
| Same conversation list as dashboard | Task 7 (same API) |
| Search + New Conversation | Task 7 |
| No contact/notes/call-log sidebar | Task 7 constraints |
| Call button + CallBar | Tasks 5, 7 |
| Login inside iframe | Tasks 3, 4 |
| `frame-ancestors *` | Tasks 1, 2 |
| Reuse existing APIs | Task 7 |
| Cross-origin cookie note | Task 9 |
| Test host + manual checklist | Tasks 8, 10 |

No placeholders remain. Types and paths are consistent across tasks.
