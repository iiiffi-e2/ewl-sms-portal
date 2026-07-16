# Message Content Search — Design Spec

**Date:** 2026-07-15
**Status:** Approved
**Approach:** `ILIKE contains` + Postgres `pg_trgm` GIN index (Option B)

## Summary

Extend the existing inbox search (`GET /api/conversations?q=`) so it also matches
the text of messages within threads, in addition to the current contact
name/phone/facility, group title, and participant matching. Matching
conversations show a snippet of the matched message with the search term
highlighted. The feature is designed to avoid adding load-time lag: message-body
matching is backed by a trigram GIN index and gated behind a minimum query
length.

## Stakeholder decisions

| Decision | Choice |
|---|---|
| Result UI | Same conversation list; matched conversations show a highlighted snippet of the matched message |
| Scale strategy | `ILIKE contains` + `pg_trgm` GIN index (safe, substring matching, scales to millions) |
| Minimum query length for body search | 3 characters |
| Archived conversations | Excluded (unchanged from current behavior) |

## Database

Add a trigram index so case-insensitive substring (`ILIKE '%term%'`) matching on
`Message.body` is index-backed rather than a sequential scan. Authored as a raw
SQL migration because Prisma cannot express a `pg_trgm` GIN index natively.

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX message_body_trgm_idx ON "Message" USING gin ("body" gin_trgm_ops);
```

A comment is added next to the `Message` model in `schema.prisma` documenting the
index so it is not lost on a future `prisma db pull`.

## API — `GET /api/conversations`

- When `q` is **3 or more characters**, add one branch to the existing `OR`:
  `{ messages: { some: { body: { contains: query, mode: "insensitive" } } } }`
- When `q` is 1–2 characters, behavior is unchanged (no message-body scan).
- Archived filtering is unchanged (`archivedAt: null` unless `includeArchived`).

### Matched snippet fetch

The list include only carries the latest 5 messages per conversation, but a match
may be an older message. Rather than expanding that include, run one additional
batched, index-backed query after the conversation query (only when `q` is 3+
chars):

```ts
prisma.message.findMany({
  where: { conversationId: { in: ids }, body: { contains: query, mode: "insensitive" } },
  distinct: ["conversationId"],
  orderBy: { createdAt: "desc" },
  select: { conversationId: true, body: true, createdAt: true },
})
```

Returns at most one matched message per conversation (no N+1). The result is
attached to each conversation in the response as `matchedMessage`
(`{ body, createdAt }` or absent).

## Frontend

- `ConversationListItem` accepts an optional `matchedMessage` and the active
  search term.
- When a conversation matched on message body, render a trimmed snippet centered
  on the match (e.g. `…owe a balance on your…`) in place of the latest-message
  preview, with the matched term **bolded**.
- Search input placeholder updates to `Search name, phone, facility, or messages`
  (both mobile and desktop inputs in `DashboardClient`, and the embed inbox).
- No changes to polling, detail fetching/caching, or the message thread view.

## Performance guardrails

- 3-character minimum before any message-body matching runs.
- Trigram GIN index → indexed `ILIKE`, no sequential scans on `Message`.
- Snippet lookup is a single batched query gated behind the same 3-char check.
- Existing 300ms search debounce is retained.

## Testing

- Migration applies cleanly and `EXPLAIN` shows the trigram index is used for a
  body `ILIKE` search.
- 1–2 character queries do not trigger message-body matching.
- A body-only match surfaces the correct conversation with the correct snippet.
- Highlighting renders the matched term correctly, including case-insensitive
  matches.
- Archived conversations remain excluded from results.
