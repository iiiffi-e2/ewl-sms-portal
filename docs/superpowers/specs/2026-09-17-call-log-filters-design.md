# Call Log Filters — Design Spec

**Date:** 2026-09-17  
**Status:** Approved (brainstorming)  
**Approach:** Filter bar above the Calls table; server-side `GET /api/calls` query params (Approach 1)

## Summary

The facility Calls page (`/calls`) gains a filter bar: free-text search across phone number and contact name, plus optional start/end date-time, min/max duration, and a single status. Filters run on the server with the existing 50-row pager so **total** and page contents reflect the filtered set, not just the current page.

## Stakeholder decisions

| Decision | Choice |
|---|---|
| Date/time | One continuous start/end date-time window (option C) |
| Duration | Optional min and max length; either bound may be blank (option A) |
| Status | Single status dropdown, including live statuses (option A) |
| Architecture | Filter bar + server query params; not stored in the URL (Approach 1) |

## Goals

- Search calls by phone number or active contact name.
- Filter by a continuous local date-time range on `startedAt`.
- Filter by duration seconds (min and/or max).
- Filter by exactly one `CallStatus`, or any status.
- Keep leftover stale / no-SID canceled rows hidden.
- Reset to page 1 when filters change; paging uses the filtered count.

## Non-Goals (this pass)

- Persisting filters in the URL (refresh/share).
- Multi-select status, time-of-day windows independent of date, or duration presets.
- Filters for direction, staff, or conversation.
- Searching staff names.
- Embed inbox call history.
- Deleting historical placeholder `CallLog` rows.

## Current behavior this changes

- `GET /api/calls` only accepts `page` and `limit`, counts/lists all visible logs.
- `CallsPageClient` loads with those two params; no search or filter UI.
- Contact names are attached after fetch by matching `CallLog.phone` to active contacts. `CallLog` has no `contactId`.

## Architecture

Extend `GET /api/calls`. Parse optional filters in `lib/voice/call-log-list.ts` into a Prisma `where` that always includes `VISIBLE_CALL_LOG_WHERE`.

```
Staff                         Next.js
 |                               |
 |-- type/search/change filter ->|
 |-- GET /api/calls?page=1&q=&startedFrom=&startedTo=
 |        &minDurationSeconds=&maxDurationSeconds=&status=
 |                               |-- parse + validate
 |                               |-- contact name → phones (if q)
 |                               |-- count + findMany (skip/take)
 |                               |-- decorate names by phone
 |<-- { callLogs, page, pageSize, total }
```

Changing any filter (including debounced search) requests **page 1**. Previous/Next and page numbers keep using the returned `total`.

### Query parameters

| Param | Meaning |
|---|---|
| `q` | Trimmed free text. Empty or omitted: no search. |
| `startedFrom` | Inclusive lower bound on `startedAt` (ISO-8601 datetime). |
| `startedTo` | Inclusive upper bound on `startedAt` (ISO-8601 datetime). |
| `minDurationSeconds` | Inclusive minimum `durationSeconds` (non-negative integer). |
| `maxDurationSeconds` | Inclusive maximum `durationSeconds` (non-negative integer). |
| `status` | Exactly one `CallStatus` enum value. |
| `page` / `limit` | Unchanged (default 50, max 100). |

Omitted or empty optional params are ignored.

### Search matching

`q` matches if **either**:

1. **Phone:** `CallLog.phone` contains the raw query (case-insensitive) **or** contains the digit-only form of the query when that form differs and is non-empty. Example: `555-1234` matches `+15551234567`.
2. **Name:** any **active** contact (`deletedAt` null) whose `name` contains `q` (case-insensitive); those contacts’ phones are included via `phone: { in: [...] }`.

Unknown numbers (no active contact) still match on phone. Soft-deleted contacts are not used for name search. Staff names are not searched.

If `q` is set and no contacts match by name, phone matching still runs.

### Date-time

Bounds apply to `CallLog.startedAt`. The UI uses `datetime-local` and converts to ISO in the **browser local timezone**, matching the Time column (`formatMessageTime` / date-fns local time). Either bound may be omitted. Values are used at the input’s precision (typically minutes): **To 5:00 PM** means `startedAt <= 17:00:00` local, not the rest of that hour.

### Duration

When either duration param is set, only rows with a non-null `durationSeconds` can match. A completed call stored as `0` is a duration of zero, not null.

### Status

One of: `initiating`, `ringing`, `in_progress`, `completed`, `failed`, `no_answer`, `busy`, `canceled`. Labels in the UI use `formatCallStatusLabel` (underscores → spaces).

## Validation (400)

Return 400 with a short error message when:

- `startedFrom` or `startedTo` is present but not a valid datetime.
- Both are present and `startedFrom` is after `startedTo`.
- Duration params are present but not non-negative integers.
- Both duration bounds are present and min > max.
- `status` is present but not a `CallStatus` value.

Invalid filters must not run a partial query.

## UI

Filter row under the Calls heading, above the table, wrapping on small screens:

- Search text input, placeholder `Search number or name`. Debounce ~300ms (same order as inbox search). No submit button.
- From / To `datetime-local` inputs. Empty = no bound.
- Min / max duration: optional `type="number"` fields, unit **seconds**, `min="0"`.
- Status `<select>`: Any (empty), then Completed, No answer, Busy, Failed, Canceled, Initiating, Ringing, In progress.
- **Clear filters** when any filter is set: clears search, dates, duration, status, and reloads page 1.

Empty copy:

- No filters and no rows: `No calls yet.`
- Filters on and zero matches: `No calls match these filters.`

A 400 or load failure uses the existing red error line. Do not replace a previously loaded table with a false empty state on validation/network error.

Paging controls (Previous, page numbers, Next, “Showing X–Y of N”) are unchanged and use the filtered `total`.

## Testing

Unit tests around parse/where helpers (same file as existing call-log list tests):

- Phone digit search and contact-name → phone `in` list.
- Date, duration, and status `AND` with `VISIBLE_CALL_LOG_WHERE`.
- Null `durationSeconds` excluded when a duration bound is set.
- Invalid ranges/status fail parse.
- Empty/omitted params do not add clauses.

## Out of scope details (explicit)

Filters live in `CallsPageClient` state only. Reloading the page clears them. Conversation thread `CallLogsPanel` is unchanged except it already omits placeholder logs.
