# Mobile Responsive Inbox — Design Spec

**Date:** 2026-07-17
**Status:** Approved
**Approach:** Compact mobile shell (hamburger nav + single-column conversation with primary thread)

## Summary

Fix CareText’s mobile layout so the header no longer overflows, Sign out lives
inside a mobile menu, and opening a conversation shows a large, usable chat
thread instead of mostly the composer and Contact Details.

Desktop (`lg+`, ≥1024px) layout stays unchanged.

## Stakeholder decisions

| Decision | Choice |
|---|---|
| Overall approach | Compact mobile shell (Approach 1) |
| Contact details on mobile | Below the composer; scroll to reach after the chat region |
| Slim header contents | Contact name + facility + Call button |
| Status / phone on mobile | Not in slim header; available with Contact Details below composer |
| Sign out on mobile | Only inside the hamburger menu (hidden from the top bar) |
| Sticky chat chrome | No — standard column layout; thread region fills remaining height |
| Tabs for Messages vs Details | No |
| Embed inbox | Out of scope |

## Problems (current)

1. **TopNav overflow:** Logo (`w-[195px]`) plus always-visible horizontal links
   (`Dashboard`, `Contacts`, `Templates`, …) and Sign out do not fit phone
   widths. Links clip; Sign out wraps onto its own row and wastes vertical space.
2. **Hidden chat thread:** On mobile, `DashboardClient` stacks the message column
   and Contact Details column with both as `flex-1` (~50/50). Header chrome plus
   composer consume most of the top half, so `MessageThread` collapses to little
   or no visible height while Contact Details dominate the lower half.

## Section 1 — Mobile navigation

**File:** `components/caretext/TopNav.tsx`

**Below `lg`:**
- Bar shows CareText logo (may shrink slightly so the toggle fits) and a hamburger
  button on the right.
- Inline nav links and the Sign out button are not shown in the bar.
- Opening the menu reveals a panel (slide-down or overlay under the header) with:
  - Dashboard
  - Contacts
  - Templates and Settings (admin only, same gating as today)
  - Sign out at the bottom of the menu
- Menu closes on navigation, Sign out, Escape, and outside click (if overlay).

**`lg` and above:** Unchanged — horizontal links + Sign out button in the header.

## Section 2 — Mobile conversation pane

**File:** `components/caretext/DashboardClient.tsx`  
**Supporting:** `components/caretext/ConversationHeader.tsx`  
**Possibly:** `components/caretext/ContactDetailsCard.tsx` (if status controls need a clear home below the composer)

**Vertical order on mobile conversation view:**

1. Compact back control (`← Conversations`) — not a large full-width primary button
2. Slim header: name + facility (left); Call (right). Groups: title + participant count; Call remains disabled as today
3. Message thread — grows to fill remaining viewport height; scrolls independently
4. Composer — directly under the thread
5. Below that stack: Contact Details, status badge + status dropdown, Internal Notes, Call Logs

**Layout mechanics:**
- Remove the dual `flex-1` message/details split on mobile.
- Chat region (slim header + thread + composer) uses a fixed-height budget so the
  thread is visibly tall; details sit under it and are reached by scrolling the
  outer column/page.
- Desktop side-by-side layout (thread | 320px sidebar) is unchanged.

**Slim header vs full header:**
- Mobile uses a slim variant of `ConversationHeader` (or equivalent props/mode).
- Phone number, status badge, and status dropdown are omitted from the slim
  header and surface with Contact Details below the composer.
- Desktop keeps the full header behavior used today.

## Section 3 — Scope

**In scope:**
- Mobile TopNav hamburger + menu with Sign out
- Mobile conversation layout restructure and slim header
- Keeping Call available from the slim header

**Out of scope:**
- Embed inbox (`EmbedInboxClient`)
- Desktop layout redesign
- New product features beyond responsive fixes

## Success criteria

- Phone-width viewport: nav does not overflow; Sign out appears only in the menu
- Opening a conversation shows a large visible message thread without first
  scrolling past Contact Details
- Back returns to the conversation list
- Call still works from the slim header
- Desktop appearance and behavior match current production

## Testing

Manual checks at ~375px width (and one tablet width below `lg`):

1. Open menu → all expected links; Sign out works; menu closes after navigate
2. Conversation list still usable
3. Open a thread with history → messages clearly visible above the composer
4. Scroll past composer → Contact Details, status controls, notes, call logs
5. Call from slim header still starts a call
6. Resize/`lg` breakpoint → desktop nav and two-column conversation unchanged
