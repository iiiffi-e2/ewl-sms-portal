# Embed Inbox — Design Spec

**Date:** 2026-06-03  
**Status:** Approved (brainstorming)  
**Approach:** Dedicated embed route + slim client (Approach 1)

## Summary

Add a simplified, embed-first inbox at `/embed/inbox` for testing and external embedding. The view shows open thread list (same as dashboard: all non-archived conversations), search, New Conversation, message thread, SMS composer, and Call button — without contact details, internal notes, call-log sidebar, or status controls. Users authenticate by logging in inside the iframe (same credentials as the main portal). Any domain may embed the page via `<iframe>` with `Content-Security-Policy: frame-ancestors *`.

## Goals

- Provide a minimal chat workspace suitable for iframe embedding on external sites.
- Reuse existing API routes, auth, messaging, consent, and voice-call infrastructure.
- Keep the main `/dashboard` experience unchanged.
- Support standalone use (direct browser tab) and cross-domain iframe embed.

## Non-Goals (v1)

- Embed tokens, API keys, or SSO for parent-page auth.
- Domain allowlist for `frame-ancestors` (open to any domain).
- `postMessage` integration with parent pages.
- Desktop notifications inside the embed.
- Admin delete, status dropdown, assignment controls, or right-sidebar panels.
- Refactoring `DashboardClient` into a shared hook (can follow later if embed sticks).

## Stakeholder decisions

| Decision | Choice |
|---|---|
| Implementation approach | Dedicated embed route + slim client |
| Thread list filter | Same as dashboard — all non-archived (includes closed) |
| Included features | Search, New Conversation, messages, composer, Call |
| Excluded features | Contact panel, notes, call-log sidebar, status controls |
| Auth | Login inside iframe (same credentials) |
| Framing policy | `frame-ancestors *` (any domain) |
| Chrome | Embed-first — no TopNav, minimal padding |

## Architecture & routing

```
/embed/login                    → login form (embed layout, public)
/embed/inbox                    → simplified inbox (protected)
/embed/inbox?conversationId=… → deep-link a thread
/embed/test-host                → dev-only iframe smoke-test page (optional)
```

### Route group

New `app/(embed)/` layout:

- Wraps children in `AuthProvider`.
- Full viewport height (`h-dvh`), minimal padding (`p-2` or `p-0`).
- No `TopNav`.

### Middleware

- Add `/embed/:path*` to auth matcher.
- `/embed/login` is public (no session required).
- Unauthenticated access to `/embed/inbox` redirects to `/embed/login?callbackUrl=/embed/inbox`.
- Existing role rules for `/templates` etc. unchanged.

### Embed headers

Apply to all `/embed/*` responses (via middleware response headers or `next.config.ts` `headers()`):

| Header | Value |
|---|---|
| `Content-Security-Policy` | `frame-ancestors *` |
| `X-Frame-Options` | omit (do not set DENY/SAMEORIGIN) |

Main app routes (`/dashboard`, etc.) remain non-embeddable by default.

### External embed snippet

```html
<iframe
  src="https://your-portal.example.com/embed/inbox"
  width="100%"
  height="700"
  style="border:0;"
  allow="microphone"
></iframe>
```

Include `allow="microphone"` for Twilio browser voice. Add `allow="autoplay"` if needed during voice testing.

## Components

### New files

| File | Purpose |
|---|---|
| `app/(embed)/layout.tsx` | Embed shell — AuthProvider, full viewport, no TopNav |
| `app/(embed)/embed/login/page.tsx` | Embed login page |
| `app/(embed)/embed/inbox/page.tsx` | Server page rendering `EmbedInboxClient` |
| `components/caretext/EmbedInboxClient.tsx` | Simplified inbox state and layout |
| `components/caretext/EmbedConversationHeader.tsx` | Contact name, phone, Call button only |
| `components/caretext/EmbedNewConversationForm.tsx` | Phone (required) + name (optional) for new threads |

### Reused unchanged

- `ConversationList` / `ConversationListItem` — pass `isAdmin={false}`, omit `onDelete`
- `MessageThread` — messages plus inline `CallThreadBar` entries in timeline (not sidebar `CallLogsPanel`)
- `ConversationComposerArea` — opt-in gate, templates, send flow
- `VoiceCallProvider`, `CallBar`
- All existing `/api/*` routes

### Layout

Desktop: two-column split at full iframe height.

```
┌──────────────────┬─────────────────────────────────────┐
│ Search           │  EmbedConversationHeader + Call     │
│ [New Conversation]│  CallBar (when active)             │
│ ConversationList │  MessageThread                      │
│                  │  ConversationComposerArea           │
└──────────────────┴─────────────────────────────────────┘
```

Mobile: list OR conversation pane with Back button (same pattern as dashboard).

### LoginForm change

Add optional `callbackUrl` prop (default `/dashboard`). Embed login passes `/embed/inbox` and redirects there on success instead of the main dashboard.

## Data flow

`EmbedInboxClient` mirrors the core loop from `DashboardClient`:

1. **Load list** — `GET /api/conversations?q=…`
2. **Load detail** — `GET /api/conversations/:id` on selection
3. **Poll every 5s** — refresh list and active thread
4. **Send message** — `POST /api/messages/send`
5. **New conversation** — `POST /api/conversations` via `EmbedNewConversationForm` (replaces `ContactDetailsCard` draft flow)
6. **Call** — `EmbedConversationHeader` → `useVoiceCall().startCall()`

Templates loaded from `GET /api/templates`.

**New Conversation:** Dashboard draft mode references Contact Details. Embed uses inline phone + optional name form that POSTs to create the conversation, then opens the thread.

**Notifications:** Omit desktop `Notification` API in embed v1; polling handles updates.

## Auth & session cookies

1. iframe loads `/embed/inbox`.
2. No session → redirect to `/embed/login?callbackUrl=/embed/inbox`.
3. User signs in with existing credentials provider.
4. Redirect to `callbackUrl`.

For cross-origin iframe session persistence in production, configure NextAuth session cookies with `SameSite=None` and `Secure=true` (HTTPS required). Local same-origin iframe tests work on `http://localhost`; cross-domain tests may require HTTPS and cookie config.

## Error handling

| Scenario | Behavior |
|---|---|
| API 401 | Redirect to `/embed/login` with current path as `callbackUrl` |
| Send message fails | Inline error in composer |
| New conversation validation fails | Inline error on `EmbedNewConversationForm` |
| Call fails | Error under Call button |
| Opt-in required | `OptInGate` blocks composer until intro sent |
| Opted out contact | Composer shows opt-out message |
| Poll/network failure | Silent retry on next 5s interval |

## Testing & verification

### Standalone

- `/embed/inbox` redirects when logged out; loads inbox after login.
- Search, thread selection, send, call, and New Conversation all work.
- No TopNav; no right sidebar panels.

### Same-origin embed smoke test

- Optional `/embed/test-host` page with `<iframe src="/embed/inbox">` confirms headers and layout.

### Cross-domain embed

- Static page on another origin embeds portal URL with `allow="microphone"`.
- Login, session persistence, messaging, and polling verified inside iframe.
- If session drops on refresh, apply `SameSite=None; Secure` cookie settings.

### Regression

- `/dashboard` unchanged — no embed headers, TopNav present.

### Manual checklist

- [ ] List matches dashboard (non-archived threads)
- [ ] No contact/notes/call-log sidebar panels
- [ ] Call button and CallBar work
- [ ] Opt-in gate enforced
- [ ] iframe loads on external page
