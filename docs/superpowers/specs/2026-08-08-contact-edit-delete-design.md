# Contact Edit & Soft-Delete — Design Spec

**Date:** 2026-08-08  
**Status:** Approved for implementation (Approach 1)  
**Related:** Contacts screen (`/contacts`), `ContactDetailsCard`, contact APIs

## Summary

Add edit and soft-delete on the contacts screen. Edit reuses the dashboard `ContactDetailsCard` in a side panel opened from the list. Delete is soft (`deletedAt`) and appears only in that contacts-screen panel—not in the inbox sidebar. Soft-deleted contacts are restored by creating a contact with the same phone or Notify identity (no dedicated restore UI).

## Goals

- Edit an existing contact from `/contacts`.
- Soft-delete a contact from the contacts-screen details panel.
- Hide soft-deleted contacts from the contacts list and contact pickers.
- Restore a soft-deleted contact by creating one with the same identity.
- Leave conversations and message history intact on soft-delete.

## Non-Goals (v1)

- Explicit “view deleted” / “Restore” button on the contacts list.
- Hard-delete of contacts.
- Archiving related conversations when a contact is soft-deleted.
- Delete control on the dashboard inbox `ContactDetailsCard`.
- Admin-only mutation gates (keep current `requireSession` behavior).

## Stakeholder decisions

| Decision | Choice |
|---|---|
| Architecture | Approach 1 — extend contacts screen + `deletedAt` |
| Edit UI | Reuse `ContactDetailsCard` in a side panel from `/contacts` |
| Delete UI | Only inside that contacts-screen panel (opt-in prop / callback) |
| Delete semantics | Soft-delete via `deletedAt` |
| Restore | Create with same phone / Notify ID clears `deletedAt` and updates fields |
| Conversations on delete | Unchanged (not archived) |

## Data model

- Add `Contact.deletedAt DateTime?`.
- Index suitable for list queries filtering `deletedAt: null` (e.g. `@@index([deletedAt])`).
- No other schema changes.

## API

### `GET /api/contacts`

- Return only contacts where `deletedAt` is null.

### `DELETE /api/contacts/[id]` (new)

- Auth: `requireSession()` (same as PATCH).
- If missing or already soft-deleted → `404`.
- Otherwise set `deletedAt = now()` and return the updated contact.
- Do not archive conversations or mutate messages.

### `PATCH /api/contacts/[id]` (existing)

- If contact is missing or soft-deleted → `404`.
- Otherwise keep current update behavior.

### `POST /api/contacts` (existing create / reuse)

Identity match behavior:

1. Soft-deleted match → clear `deletedAt`, apply create payload, return `{ contact, restored: true }` with `200`.
2. Active match with an active conversation → keep current `409`.
3. Active match with no active conversation → keep current reuse/update (`reused: true`).
4. No match → create as today (`201`).

### Related endpoints

- `POST /api/contacts/[id]/conversation` — if contact missing or soft-deleted → `404`.
- Group (and similar) contact pickers — only include `deletedAt: null`.
- Inbound SMS / identity upserts that find a soft-deleted contact by phone — clear `deletedAt` (same restore spirit as create-by-identity) so inbound traffic is not orphaned.

## UI

### Contacts screen (`ContactsManager`)

- Each list card: **Edit** action (alongside Send Message).
- Edit opens a side panel rendering `ContactDetailsCard` for that contact.
- On successful save (`onUpdated`): refresh the list; keep the panel open on the updated contact.
- Pass delete capability only from this screen (e.g. `onDelete` callback). Dashboard sidebar usage does not pass it.
- Delete: confirm dialog explaining soft-delete and restore-via-create; call `DELETE`; on success close panel and refresh list; on failure show inline error.
- Create form unchanged. If response indicates `restored: true`, show a short success note (“Contact restored”) and refresh the list.

### `ContactDetailsCard`

- Add optional delete affordance gated by a prop/callback supplied only by `ContactsManager`.
- When the callback is absent (dashboard sidebar), no Delete control is rendered.
- Existing view/edit/PATCH behavior unchanged.

## Error handling & feedback

| Situation | Behavior |
|---|---|
| Delete API failure | Inline error in the contacts panel |
| Create restores soft-deleted contact | Success message “Contact restored” |
| PATCH/DELETE on missing or already-deleted | `404` |
| Create active duplicate with open conversation | Existing `409` |

## Testing

- Soft-deleted contacts excluded from `GET /api/contacts`.
- `DELETE` sets `deletedAt`; second delete → `404`.
- `POST` with matching soft-deleted identity restores (`restored: true`).
- `PATCH` on soft-deleted contact → `404`.
- Conversation-open for soft-deleted contact → `404`.
- UI: edit panel opens from list; Delete visible only when delete callback is provided.

## Out of scope follow-ups

- Admin purge / hard-delete tooling.
- Dedicated deleted-contacts browser with explicit Restore.
- Soft-delete cascading to conversation archive.
