# Message CSV Export — Design Spec

**Date:** 2026-06-23  
**Status:** Approved  
**Approach:** Server-generated CSV download (Approach 1)

## Summary

Add an admin-only Settings page with filters to download SMS message history as CSV. Supports optional date range, contact, and conversation filters. Includes archived conversations.

## Stakeholder decisions

| Decision | Choice |
|---|---|
| Access | Admins only |
| Scope | All messages with optional contact/conversation filters |
| Timestamps | Single `Message Time` column from `createdAt` (Option A) |
| Archived | Include archived conversations |

## CSV columns

```
Message Time, Direction, Status, Body, Contact Name, Contact Phone, Facility, Sent By, Conversation ID
```

- **Message Time:** `createdAt` as ISO 8601 UTC
- **Sent By:** nurse name for outbound messages; blank for inbound

## UI

- Route: `/settings` (admin only)
- Nav: Settings link in TopNav (admin only)
- Filters: optional start/end date, contact search/select, conversation select (scoped to contact)
- Action: Download CSV button with inline error display

## API

- `GET /api/messages/export`
- Query params: `startDate`, `endDate` (YYYY-MM-DD), `contactId`, `conversationId` (all optional)
- Auth: `requireAdmin()`
- Response: `text/csv` attachment, or 400/404 JSON errors

## Error handling

- Invalid date range → 400
- No matching messages → 404
- Non-admin → 403
