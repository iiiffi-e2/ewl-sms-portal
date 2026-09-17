# Call Log Filters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let staff search and filter the facility Calls page by number/name, date-time range, duration, and a single status, with the pager total matching the filtered set.

**Architecture:** Parse optional `GET /api/calls` query params into a Prisma `where` that always includes `VISIBLE_CALL_LOG_WHERE`. Name search looks up active contacts first, then matches those phones. `CallsPageClient` sends the params from a filter bar (component state only, not the URL).

**Tech Stack:** Next.js 16 App Router, Prisma 6, Vitest, React 19

**Spec:** `docs/superpowers/specs/2026-09-17-call-log-filters-design.md`

## Global Constraints

- Keep leftover stale / no-SID canceled rows hidden (`VISIBLE_CALL_LOG_WHERE`).
- Search matches `CallLog.phone` (digit-friendly) **or** active contact names (`deletedAt` null); do not search staff names or soft-deleted contacts.
- Date-time bounds are a single continuous window on `startedAt`; UI uses `datetime-local` converted to ISO in the browser’s local timezone.
- Duration bounds are optional non-negative integers (seconds); when either is set, rows with null `durationSeconds` do not match.
- Status is exactly one `CallStatus` or omitted (any).
- Filters live in `CallsPageClient` state only (not the URL). Reload clears them.
- Changing a filter requests page 1. Paging uses the filtered `total`.
- Invalid filter combos return 400 and must not run a partial query.
- Do not change embed inbox, thread `CallLogsPanel` query (already uses `VISIBLE_CALL_LOG_WHERE`), or delete historical rows.
- No Prisma schema change.

---

## File Map

| File | Responsibility |
|---|---|
| `lib/voice/call-log-list.ts` | Parse query, build Prisma `where`, URL params, datetime-local → ISO, status option list |
| `lib/voice/call-log-list.test.ts` | Parse, search, where, URL, datetime helpers |
| `app/api/calls/route.ts` | Validate params, name→phone lookup, filtered count/findMany, 400 on invalid |
| `components/caretext/CallsPageClient.tsx` | Filter bar, debounce search, empty-state copy, pass filters into fetch |

---

### Task 1: Parse call-log list query params

**Files:**
- Modify: `lib/voice/call-log-list.ts`
- Test: `lib/voice/call-log-list.test.ts`

**Interfaces:**
- Consumes: `CallStatus` from `@prisma/client`
- Produces:
  - `CallLogListQuery` `{ q: string | null; startedFrom: Date | null; startedTo: Date | null; minDurationSeconds: number | null; maxDurationSeconds: number | null; status: CallStatus | null }`
  - `ParseCallLogListQueryResult` `{ ok: true; query: CallLogListQuery } | { ok: false; error: string }`
  - `parseCallLogListQuery(input: { q?: string | null; startedFrom?: string | null; startedTo?: string | null; minDurationSeconds?: string | null; maxDurationSeconds?: string | null; status?: string | null }): ParseCallLogListQueryResult`
  - `callLogListHasFilters(query: CallLogListQuery): boolean`
  - `CALL_LOG_STATUS_FILTER_OPTIONS` — `CallStatus[]` in UI order: completed, no_answer, busy, failed, canceled, initiating, ringing, in_progress
  - `datetimeLocalToIso(value: string): string | null`
  - `buildCallLogListSearchParams(input: { page: number; limit?: number; q?: string | null; startedFrom?: string | null; startedTo?: string | null; minDurationSeconds?: string | null; maxDurationSeconds?: string | null; status?: string | null }): string`

Exact 400 messages (use these strings in parse failures):

- `startedFrom must be a valid datetime.`
- `startedTo must be a valid datetime.`
- `startedFrom must be on or before startedTo.`
- `minDurationSeconds must be a non-negative integer.`
- `maxDurationSeconds must be a non-negative integer.`
- `minDurationSeconds must be on or before maxDurationSeconds.`
- `status is not a valid call status.`

- [ ] **Step 1: Write the failing tests**

Add to `lib/voice/call-log-list.test.ts` (keep existing imports and tests). Extend the import list with `parseCallLogListQuery`, `callLogListHasFilters`, `datetimeLocalToIso`, `buildCallLogListSearchParams`, `CALL_LOG_STATUS_FILTER_OPTIONS`, `CallStatus`.

```typescript
import { CallStatus } from "@prisma/client";
import {
  CALL_LOG_STATUS_FILTER_OPTIONS,
  buildCallLogListSearchParams,
  callLogListHasFilters,
  datetimeLocalToIso,
  parseCallLogListQuery,
  // ...existing imports
} from "@/lib/voice/call-log-list";

describe("parseCallLogListQuery", () => {
  it("treats omitted and blank params as no filters", () => {
    expect(parseCallLogListQuery({})).toEqual({
      ok: true,
      query: {
        q: null,
        startedFrom: null,
        startedTo: null,
        minDurationSeconds: null,
        maxDurationSeconds: null,
        status: null,
      },
    });
    const blank = parseCallLogListQuery({ q: "  ", status: "" });
    expect(blank.ok).toBe(true);
    if (blank.ok) {
      expect(callLogListHasFilters(blank.query)).toBe(false);
    }
    const empty = parseCallLogListQuery({});
    if (empty.ok) {
      expect(callLogListHasFilters(empty.query)).toBe(false);
    }
  });

  it("parses search, dates, duration, and status", () => {
    const parsed = parseCallLogListQuery({
      q: "  Ada  ",
      startedFrom: "2026-09-01T15:00:00.000Z",
      startedTo: "2026-09-03T13:00:00.000Z",
      minDurationSeconds: "30",
      maxDurationSeconds: "300",
      status: "completed",
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }
    expect(parsed.query.q).toBe("Ada");
    expect(parsed.query.startedFrom?.toISOString()).toBe("2026-09-01T15:00:00.000Z");
    expect(parsed.query.startedTo?.toISOString()).toBe("2026-09-03T13:00:00.000Z");
    expect(parsed.query.minDurationSeconds).toBe(30);
    expect(parsed.query.maxDurationSeconds).toBe(300);
    expect(parsed.query.status).toBe(CallStatus.completed);
    expect(callLogListHasFilters(parsed.query)).toBe(true);
  });

  it("rejects invalid dates, inverted ranges, bad duration, and unknown status", () => {
    expect(parseCallLogListQuery({ startedFrom: "not-a-date" })).toEqual({
      ok: false,
      error: "startedFrom must be a valid datetime.",
    });
    expect(parseCallLogListQuery({ startedTo: "not-a-date" })).toEqual({
      ok: false,
      error: "startedTo must be a valid datetime.",
    });
    expect(
      parseCallLogListQuery({
        startedFrom: "2026-09-03T13:00:00.000Z",
        startedTo: "2026-09-01T15:00:00.000Z",
      }),
    ).toEqual({ ok: false, error: "startedFrom must be on or before startedTo." });
    expect(parseCallLogListQuery({ minDurationSeconds: "-1" })).toEqual({
      ok: false,
      error: "minDurationSeconds must be a non-negative integer.",
    });
    expect(parseCallLogListQuery({ maxDurationSeconds: "1.5" })).toEqual({
      ok: false,
      error: "maxDurationSeconds must be a non-negative integer.",
    });
    expect(
      parseCallLogListQuery({ minDurationSeconds: "40", maxDurationSeconds: "10" }),
    ).toEqual({
      ok: false,
      error: "minDurationSeconds must be on or before maxDurationSeconds.",
    });
    expect(parseCallLogListQuery({ status: "missed" })).toEqual({
      ok: false,
      error: "status is not a valid call status.",
    });
  });
});

describe("datetimeLocalToIso", () => {
  it("returns null for blank input and ISO for a local datetime", () => {
    expect(datetimeLocalToIso("")).toBeNull();
    expect(datetimeLocalToIso("   ")).toBeNull();
    const iso = datetimeLocalToIso("2026-09-17T15:00");
    expect(iso).toBe(new Date("2026-09-17T15:00").toISOString());
  });
});

describe("buildCallLogListSearchParams", () => {
  it("always includes page and limit and omits empty filters", () => {
    expect(buildCallLogListSearchParams({ page: 2 })).toBe("page=2&limit=50");
    expect(
      buildCallLogListSearchParams({
        page: 1,
        q: "Ada",
        startedFrom: "2026-09-01T15:00:00.000Z",
        status: "completed",
      }),
    ).toBe(
      "page=1&limit=50&q=Ada&startedFrom=2026-09-01T15%3A00%3A00.000Z&status=completed",
    );
  });
});

describe("CALL_LOG_STATUS_FILTER_OPTIONS", () => {
  it("lists ended statuses before live ones", () => {
    expect(CALL_LOG_STATUS_FILTER_OPTIONS).toEqual([
      CallStatus.completed,
      CallStatus.no_answer,
      CallStatus.busy,
      CallStatus.failed,
      CallStatus.canceled,
      CallStatus.initiating,
      CallStatus.ringing,
      CallStatus.in_progress,
    ]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/voice/call-log-list.test.ts`

Expected: FAIL with `parseCallLogListQuery is not a function` (or similar named export missing).

- [ ] **Step 3: Write minimal implementation**

Add to `lib/voice/call-log-list.ts` (after `VISIBLE_CALL_LOG_WHERE`):

```typescript
export const CALL_LOG_STATUS_FILTER_OPTIONS: CallStatus[] = [
  CallStatus.completed,
  CallStatus.no_answer,
  CallStatus.busy,
  CallStatus.failed,
  CallStatus.canceled,
  CallStatus.initiating,
  CallStatus.ringing,
  CallStatus.in_progress,
];

const CALL_STATUS_VALUES = new Set<string>(Object.values(CallStatus));

export type CallLogListQuery = {
  q: string | null;
  startedFrom: Date | null;
  startedTo: Date | null;
  minDurationSeconds: number | null;
  maxDurationSeconds: number | null;
  status: CallStatus | null;
};

export type ParseCallLogListQueryResult =
  | { ok: true; query: CallLogListQuery }
  | { ok: false; error: string };

function blankToNull(raw: string | null | undefined): string | null {
  const trimmed = raw?.trim() ?? "";
  return trimmed ? trimmed : null;
}

function parseOptionalDate(raw: string | null, field: "startedFrom" | "startedTo"): Date | null | { error: string } {
  if (!raw) {
    return null;
  }
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    return { error: `${field} must be a valid datetime.` };
  }
  return date;
}

function parseOptionalNonNegativeInt(
  raw: string | null,
  field: "minDurationSeconds" | "maxDurationSeconds",
): number | null | { error: string } {
  if (!raw) {
    return null;
  }
  if (!/^\d+$/.test(raw)) {
    return { error: `${field} must be a non-negative integer.` };
  }
  return Number.parseInt(raw, 10);
}

export function parseCallLogListQuery(input: {
  q?: string | null;
  startedFrom?: string | null;
  startedTo?: string | null;
  minDurationSeconds?: string | null;
  maxDurationSeconds?: string | null;
  status?: string | null;
}): ParseCallLogListQueryResult {
  const q = blankToNull(input.q);
  const startedFromRaw = blankToNull(input.startedFrom);
  const startedToRaw = blankToNull(input.startedTo);
  const minRaw = blankToNull(input.minDurationSeconds);
  const maxRaw = blankToNull(input.maxDurationSeconds);
  const statusRaw = blankToNull(input.status);

  const startedFrom = parseOptionalDate(startedFromRaw, "startedFrom");
  if (startedFrom && "error" in startedFrom) {
    return { ok: false, error: startedFrom.error };
  }
  const startedTo = parseOptionalDate(startedToRaw, "startedTo");
  if (startedTo && "error" in startedTo) {
    return { ok: false, error: startedTo.error };
  }
  if (startedFrom && startedTo && startedFrom.getTime() > startedTo.getTime()) {
    return { ok: false, error: "startedFrom must be on or before startedTo." };
  }

  const minDurationSeconds = parseOptionalNonNegativeInt(minRaw, "minDurationSeconds");
  if (minDurationSeconds && "error" in minDurationSeconds) {
    return { ok: false, error: minDurationSeconds.error };
  }
  const maxDurationSeconds = parseOptionalNonNegativeInt(maxRaw, "maxDurationSeconds");
  if (maxDurationSeconds && "error" in maxDurationSeconds) {
    return { ok: false, error: maxDurationSeconds.error };
  }
  if (
    typeof minDurationSeconds === "number" &&
    typeof maxDurationSeconds === "number" &&
    minDurationSeconds > maxDurationSeconds
  ) {
    return { ok: false, error: "minDurationSeconds must be on or before maxDurationSeconds." };
  }

  let status: CallStatus | null = null;
  if (statusRaw) {
    if (!CALL_STATUS_VALUES.has(statusRaw)) {
      return { ok: false, error: "status is not a valid call status." };
    }
    status = statusRaw as CallStatus;
  }

  return {
    ok: true,
    query: {
      q,
      startedFrom: startedFrom ?? null,
      startedTo: startedTo ?? null,
      minDurationSeconds: typeof minDurationSeconds === "number" ? minDurationSeconds : null,
      maxDurationSeconds: typeof maxDurationSeconds === "number" ? maxDurationSeconds : null,
      status,
    },
  };
}

export function callLogListHasFilters(query: CallLogListQuery): boolean {
  return Boolean(
    query.q ||
      query.startedFrom ||
      query.startedTo ||
      query.minDurationSeconds != null ||
      query.maxDurationSeconds != null ||
      query.status,
  );
}

export function datetimeLocalToIso(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString();
}

export function buildCallLogListSearchParams(input: {
  page: number;
  limit?: number;
  q?: string | null;
  startedFrom?: string | null;
  startedTo?: string | null;
  minDurationSeconds?: string | null;
  maxDurationSeconds?: string | null;
  status?: string | null;
}): string {
  const params = new URLSearchParams();
  params.set("page", String(input.page));
  params.set("limit", String(input.limit ?? DEFAULT_CALL_LOG_LIMIT));
  const q = input.q?.trim();
  if (q) {
    params.set("q", q);
  }
  if (input.startedFrom) {
    params.set("startedFrom", input.startedFrom);
  }
  if (input.startedTo) {
    params.set("startedTo", input.startedTo);
  }
  if (input.minDurationSeconds) {
    params.set("minDurationSeconds", input.minDurationSeconds);
  }
  if (input.maxDurationSeconds) {
    params.set("maxDurationSeconds", input.maxDurationSeconds);
  }
  if (input.status) {
    params.set("status", input.status);
  }
  return params.toString();
}
```

**Bug to avoid:** `if (minDurationSeconds && "error" in minDurationSeconds)` is wrong when the value is `0` (falsy). Use:

```typescript
if (minDurationSeconds !== null && typeof minDurationSeconds === "object" && "error" in minDurationSeconds) {
  return { ok: false, error: minDurationSeconds.error };
}
```

Same for max, and for dates (`0` is not a Date, but still use `"error" in value` only after checking the object shape). Prefer:

```typescript
function isParseError(value: unknown): value is { error: string } {
  return typeof value === "object" && value !== null && "error" in value;
}
```

Duration `0` must parse as `0`, and `callLogListHasFilters` is true when min is `0`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/voice/call-log-list.test.ts`

Expected: PASS (all tests in the file, including existing ones).

- [ ] **Step 5: Commit**

```bash
git add lib/voice/call-log-list.ts lib/voice/call-log-list.test.ts
git commit -m "feat: parse Calls list search and filter query params"
```

---

### Task 2: Build filtered Prisma where (including search)

**Files:**
- Modify: `lib/voice/call-log-list.ts`
- Test: `lib/voice/call-log-list.test.ts`

**Interfaces:**
- Consumes: `CallLogListQuery`, `VISIBLE_CALL_LOG_WHERE` from Task 1 / existing module
- Produces:
  - `callLogSearchDigits(q: string): string` — strip non-digits
  - `buildCallLogListWhere(query: CallLogListQuery, contactPhones: string[]): Prisma.CallLogWhereInput`

Search `OR` (only when `query.q` is set):

1. `{ phone: { contains: q, mode: "insensitive" } }`
2. If `callLogSearchDigits(q)` is non-empty **and** different from `q`, also `{ phone: { contains: digits, mode: "insensitive" } }`
3. If `contactPhones.length > 0`, `{ phone: { in: contactPhones } }` — never `{ in: [] }`

Date: `startedAt.gte` / `startedAt.lte` when bounds are set (combine in one `startedAt` object if both).

Duration: when either bound is set, require non-null `durationSeconds` and apply `gte` / `lte`.

Status: `{ status: query.status }` when set.

Always `AND` with `VISIBLE_CALL_LOG_WHERE`.

- [ ] **Step 1: Write the failing tests**

```typescript
import { buildCallLogListWhere, callLogSearchDigits, VISIBLE_CALL_LOG_WHERE } from "@/lib/voice/call-log-list";

describe("callLogSearchDigits", () => {
  it("strips non-digits", () => {
    expect(callLogSearchDigits("555-1234")).toBe("5551234");
    expect(callLogSearchDigits("Ada")).toBe("");
    expect(callLogSearchDigits("+1 (555) 000-1212")).toBe("15550001212");
  });
});

describe("buildCallLogListWhere", () => {
  const emptyQuery = {
    q: null,
    startedFrom: null,
    startedTo: null,
    minDurationSeconds: null,
    maxDurationSeconds: null,
    status: null,
  };

  it("is only the visible-log clause when there are no filters", () => {
    expect(buildCallLogListWhere(emptyQuery, [])).toEqual({
      AND: [VISIBLE_CALL_LOG_WHERE],
    });
  });

  it("matches phone text, digits, and contact phones", () => {
    const where = buildCallLogListWhere({ ...emptyQuery, q: "555-1234" }, ["+15551234567"]);
    expect(where).toEqual({
      AND: [
        VISIBLE_CALL_LOG_WHERE,
        {
          OR: [
            { phone: { contains: "555-1234", mode: "insensitive" } },
            { phone: { contains: "5551234", mode: "insensitive" } },
            { phone: { in: ["+15551234567"] } },
          ],
        },
      ],
    });
  });

  it("does not add an empty phone in-list or duplicate identical digit query", () => {
    const nameOnly = buildCallLogListWhere({ ...emptyQuery, q: "Ada" }, []);
    expect(nameOnly).toEqual({
      AND: [
        VISIBLE_CALL_LOG_WHERE,
        { OR: [{ phone: { contains: "Ada", mode: "insensitive" } }] },
      ],
    });
    const digitsOnly = buildCallLogListWhere({ ...emptyQuery, q: "5551234" }, []);
    expect(digitsOnly).toEqual({
      AND: [
        VISIBLE_CALL_LOG_WHERE,
        { OR: [{ phone: { contains: "5551234", mode: "insensitive" } }] },
      ],
    });
  });

  it("ANDs date, duration (excluding null), and status", () => {
    const from = new Date("2026-09-01T15:00:00.000Z");
    const to = new Date("2026-09-03T13:00:00.000Z");
    const where = buildCallLogListWhere(
      {
        q: null,
        startedFrom: from,
        startedTo: to,
        minDurationSeconds: 30,
        maxDurationSeconds: 300,
        status: CallStatus.completed,
      },
      [],
    );
    expect(where).toEqual({
      AND: [
        VISIBLE_CALL_LOG_WHERE,
        { startedAt: { gte: from, lte: to } },
        { durationSeconds: { not: null, gte: 30, lte: 300 } },
        { status: CallStatus.completed },
      ],
    });
  });

  it("applies a single duration bound and still excludes null duration", () => {
    expect(
      buildCallLogListWhere({ ...emptyQuery, minDurationSeconds: 0 }, []),
    ).toEqual({
      AND: [
        VISIBLE_CALL_LOG_WHERE,
        { durationSeconds: { not: null, gte: 0 } },
      ],
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/voice/call-log-list.test.ts`

Expected: FAIL with `buildCallLogListWhere is not a function`.

- [ ] **Step 3: Write minimal implementation**

```typescript
export function callLogSearchDigits(q: string): string {
  return q.replace(/\D/g, "");
}

export function buildCallLogListWhere(
  query: CallLogListQuery,
  contactPhones: string[],
): Prisma.CallLogWhereInput {
  const clauses: Prisma.CallLogWhereInput[] = [VISIBLE_CALL_LOG_WHERE];

  if (query.q) {
    const or: Prisma.CallLogWhereInput[] = [
      { phone: { contains: query.q, mode: "insensitive" } },
    ];
    const digits = callLogSearchDigits(query.q);
    if (digits && digits !== query.q) {
      or.push({ phone: { contains: digits, mode: "insensitive" } });
    }
    if (contactPhones.length > 0) {
      or.push({ phone: { in: contactPhones } });
    }
    clauses.push({ OR: or });
  }

  if (query.startedFrom || query.startedTo) {
    clauses.push({
      startedAt: {
        ...(query.startedFrom ? { gte: query.startedFrom } : {}),
        ...(query.startedTo ? { lte: query.startedTo } : {}),
      },
    });
  }

  if (query.minDurationSeconds != null || query.maxDurationSeconds != null) {
    clauses.push({
      durationSeconds: {
        not: null,
        ...(query.minDurationSeconds != null ? { gte: query.minDurationSeconds } : {}),
        ...(query.maxDurationSeconds != null ? { lte: query.maxDurationSeconds } : {}),
      },
    });
  }

  if (query.status) {
    clauses.push({ status: query.status });
  }

  return { AND: clauses };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/voice/call-log-list.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/voice/call-log-list.ts lib/voice/call-log-list.test.ts
git commit -m "feat: build filtered CallLog Prisma where clauses"
```

---

### Task 3: Apply filters on `GET /api/calls`

**Files:**
- Modify: `app/api/calls/route.ts`

**Interfaces:**
- Consumes: `parseCallLogListQuery`, `buildCallLogListWhere` from `lib/voice/call-log-list.ts`; `ACTIVE_CONTACT_WHERE` from `lib/contact-soft-delete.ts`
- Produces: same JSON `{ callLogs, page, pageSize, total }` but `total` / rows use the filtered where; `400` `{ error: string }` on parse failure

- [ ] **Step 1: Replace the unfiltered where with parsed filters**

There is no route test file; coverage is the Task 1–2 helpers. Wire the route as follows.

Keep existing auth, `take` / `page` / `skip`, contact decoration for **returned rows**, and JSON shape.

```typescript
import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { ACTIVE_CONTACT_WHERE } from "@/lib/contact-soft-delete";
import {
  buildCallLogListWhere,
  decorateCallLogsWithContacts,
  parseCallLogListLimit,
  parseCallLogListPage,
  parseCallLogListQuery,
} from "@/lib/voice/call-log-list";

export async function GET(request: Request) {
  const authResult = await requireSession();
  if ("error" in authResult) {
    return authResult.error;
  }

  const { searchParams } = new URL(request.url);
  const take = parseCallLogListLimit(searchParams.get("limit"));
  const page = parseCallLogListPage(searchParams.get("page"));
  const skip = (page - 1) * take;

  const parsed = parseCallLogListQuery({
    q: searchParams.get("q"),
    startedFrom: searchParams.get("startedFrom"),
    startedTo: searchParams.get("startedTo"),
    minDurationSeconds: searchParams.get("minDurationSeconds"),
    maxDurationSeconds: searchParams.get("maxDurationSeconds"),
    status: searchParams.get("status"),
  });

  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  let contactPhones: string[] = [];
  if (parsed.query.q) {
    const named = await prisma.contact.findMany({
      where: {
        ...ACTIVE_CONTACT_WHERE,
        name: { contains: parsed.query.q, mode: "insensitive" },
        phone: { not: null },
      },
      select: { phone: true },
    });
    contactPhones = named
      .map((contact) => contact.phone)
      .filter((phone): phone is string => Boolean(phone));
  }

  const where = buildCallLogListWhere(parsed.query, contactPhones);

  const [total, logs] = await prisma.$transaction([
    prisma.callLog.count({ where }),
    prisma.callLog.findMany({
      where,
      orderBy: { startedAt: "desc" },
      skip,
      take,
      select: {
        id: true,
        phone: true,
        direction: true,
        status: true,
        outcome: true,
        durationSeconds: true,
        startedAt: true,
        endedAt: true,
        conversationId: true,
        initiatedBy: { select: { id: true, name: true } },
      },
    }),
  ]);

  const phones = [...new Set(logs.map((log) => log.phone))];
  const contacts = phones.length
    ? await prisma.contact.findMany({
        where: { ...ACTIVE_CONTACT_WHERE, phone: { in: phones } },
        select: { id: true, name: true, phone: true },
      })
    : [];

  const contactsByPhone = new Map(
    contacts.flatMap((contact) =>
      contact.phone ? [[contact.phone, { id: contact.id, name: contact.name }] as const] : [],
    ),
  );

  return NextResponse.json({
    callLogs: decorateCallLogsWithContacts(logs, contactsByPhone),
    page,
    pageSize: take,
    total,
  });
}
```

Remove the unused `VISIBLE_CALL_LOG_WHERE` import (it is inside `buildCallLogListWhere`).

- [ ] **Step 2: Run existing helper tests (sanity)**

Run: `npx vitest run lib/voice/call-log-list.test.ts`

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add app/api/calls/route.ts
git commit -m "feat: filter GET /api/calls by search, time, duration, and status"
```

---

### Task 4: Filter bar on the Calls page

**Files:**
- Modify: `components/caretext/CallsPageClient.tsx`

**Interfaces:**
- Consumes: `buildCallLogListSearchParams`, `datetimeLocalToIso`, `CALL_LOG_STATUS_FILTER_OPTIONS`, `formatCallStatusLabel`, `DEFAULT_CALL_LOG_LIMIT`
- Produces: filter controls that refetch `/api/calls`; empty copy `No calls match these filters.` vs `No calls yet.`

Debounce search with `300` ms (same as `SEARCH_DEBOUNCE_MS` in `DashboardClient.tsx`).

Reset to page 1 **in the same event** that changes a filter (including the debounce timeout for search). Do not add a `useEffect` that only calls `setPage(1)` on filter deps — that double-fetches the old page with new filters.

On non-OK fetch, prefer `{ error: string }` from JSON; do not clear `callLogs` on failure (keep the last good table).

- [ ] **Step 1: Add filter state and fetch with query params**

At the top of `CallsPageClient`, add:

```typescript
const SEARCH_DEBOUNCE_MS = 300;
```

Add state next to `page`:

```typescript
const [search, setSearch] = useState("");
const [debouncedSearch, setDebouncedSearch] = useState("");
const [startedFrom, setStartedFrom] = useState("");
const [startedTo, setStartedTo] = useState("");
const [minDurationSeconds, setMinDurationSeconds] = useState("");
const [maxDurationSeconds, setMaxDurationSeconds] = useState("");
const [status, setStatus] = useState("");
```

Debounce:

```typescript
useEffect(() => {
  const timeout = setTimeout(() => {
    setDebouncedSearch(search);
    setPage(1);
  }, SEARCH_DEBOUNCE_MS);
  return () => clearTimeout(timeout);
}, [search]);
```

Replace `load` so it builds the query string (do not close over `page` as the default argument):

```typescript
const load = useCallback(async (nextPage: number) => {
  const params = buildCallLogListSearchParams({
    page: nextPage,
    q: debouncedSearch,
    startedFrom: datetimeLocalToIso(startedFrom),
    startedTo: datetimeLocalToIso(startedTo),
    minDurationSeconds: minDurationSeconds.trim() || null,
    maxDurationSeconds: maxDurationSeconds.trim() || null,
    status: status || null,
  });
  const response = await fetch(`/api/calls?${params}`);
  const data = (await response.json()) as {
    callLogs?: CallLogListItem[];
    page?: number;
    pageSize?: number;
    total?: number;
    error?: unknown;
  };
  if (!response.ok) {
    throw new Error(typeof data.error === "string" ? data.error : "Failed to load calls.");
  }
  if (!data.callLogs) {
    throw new Error("Failed to load calls.");
  }
  setCallLogs(data.callLogs);
  setPage(data.page ?? nextPage);
  setPageSize(data.pageSize ?? DEFAULT_CALL_LOG_LIMIT);
  setTotal(data.total ?? data.callLogs.length);
  setError(null);
}, [debouncedSearch, startedFrom, startedTo, minDurationSeconds, maxDurationSeconds, status]);
```

Keep the existing `useEffect` that calls `load(page)` and sets `error` on catch — do not set `callLogs` to `null` in the catch.

Import `buildCallLogListSearchParams`, `datetimeLocalToIso`, `CALL_LOG_STATUS_FILTER_OPTIONS`.

- [ ] **Step 2: Render the filter bar and empty copy**

`hasFilters` from the **applied** filters (debounced search + the other fields), matching what the request uses:

```typescript
const hasFilters = Boolean(
  debouncedSearch.trim() ||
    startedFrom ||
    startedTo ||
    minDurationSeconds.trim() ||
    maxDurationSeconds.trim() ||
    status,
);
```

Insert the filter row after the subtitle (`<p className="mb-4 ...">`), before error/loading. Use `mb-4` on the filter row and drop `mb-4` from the subtitle or keep spacing so the bar sits under the heading.

```tsx
<div className="mb-4 flex flex-wrap items-end gap-2">
  <label className="min-w-[12rem] flex-1 text-sm">
    <span className="mb-1 block text-muted">Search</span>
    <input
      type="search"
      value={search}
      onChange={(event) => setSearch(event.target.value)}
      placeholder="Search number or name"
      className="w-full rounded-lg border border-border px-3 py-2"
    />
  </label>
  <label className="text-sm">
    <span className="mb-1 block text-muted">From</span>
    <input
      type="datetime-local"
      value={startedFrom}
      onChange={(event) => {
        setStartedFrom(event.target.value);
        setPage(1);
      }}
      className="rounded-lg border border-border px-3 py-2"
    />
  </label>
  <label className="text-sm">
    <span className="mb-1 block text-muted">To</span>
    <input
      type="datetime-local"
      value={startedTo}
      onChange={(event) => {
        setStartedTo(event.target.value);
        setPage(1);
      }}
      className="rounded-lg border border-border px-3 py-2"
    />
  </label>
  <label className="w-28 text-sm">
    <span className="mb-1 block text-muted">Min sec</span>
    <input
      type="number"
      min={0}
      inputMode="numeric"
      value={minDurationSeconds}
      onChange={(event) => {
        setMinDurationSeconds(event.target.value);
        setPage(1);
      }}
      className="w-full rounded-lg border border-border px-3 py-2"
    />
  </label>
  <label className="w-28 text-sm">
    <span className="mb-1 block text-muted">Max sec</span>
    <input
      type="number"
      min={0}
      inputMode="numeric"
      value={maxDurationSeconds}
      onChange={(event) => {
        setMaxDurationSeconds(event.target.value);
        setPage(1);
      }}
      className="w-full rounded-lg border border-border px-3 py-2"
    />
  </label>
  <label className="text-sm">
    <span className="mb-1 block text-muted">Status</span>
    <select
      value={status}
      onChange={(event) => {
        setStatus(event.target.value);
        setPage(1);
      }}
      className="rounded-lg border border-border bg-white px-3 py-2"
    >
      <option value="">Any</option>
      {CALL_LOG_STATUS_FILTER_OPTIONS.map((value) => (
        <option key={value} value={value}>
          {formatCallStatusLabel(value)}
        </option>
      ))}
    </select>
  </label>
  {hasFilters || search.trim() ? (
    <button
      type="button"
      className="rounded-md border border-border bg-white px-3 py-2 text-sm"
      onClick={() => {
        setSearch("");
        setDebouncedSearch("");
        setStartedFrom("");
        setStartedTo("");
        setMinDurationSeconds("");
        setMaxDurationSeconds("");
        setStatus("");
        setPage(1);
      }}
    >
      Clear filters
    </button>
  ) : null}
</div>
```

Show Clear when the user has typed search that has not debounced yet (`search.trim()`) or when `hasFilters` is true.

Replace empty copy:

```tsx
{callLogs && callLogs.length === 0 ? (
  <p className="text-sm text-muted">
    {hasFilters ? "No calls match these filters." : "No calls yet."}
  </p>
) : null}
```

Duration labels: **Min sec** / **Max sec** as above (seconds, matching the spec). Status option labels come from `formatCallStatusLabel` (`no_answer` → `no answer`). Capitalize in the select via `className` `capitalize` on the `<select>` so it matches the table’s status column.

`onSaveContact` already calls `load(page)` — keep that so the list refreshes with current filters.

- [ ] **Step 3: Typecheck / tests**

Run: `npx vitest run lib/voice/call-log-list.test.ts`

Expected: PASS.

If `npx tsc --noEmit` is used in this repo, run it; otherwise `npx eslint components/caretext/CallsPageClient.tsx lib/voice/call-log-list.ts app/api/calls/route.ts`. Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add components/caretext/CallsPageClient.tsx
git commit -m "feat: add search and filters to the Calls page"
```

---

## Spec coverage

| Spec requirement | Task |
|---|---|
| `q` phone + active contact name | 2 (where), 3 (contact lookup) |
| Digit-friendly phone | 2 |
| `startedFrom` / `startedTo` on `startedAt`, local `datetime-local` | 1 (parse + ISO), 4 (inputs) |
| Inclusive bounds at input precision | 1 parse Date as given |
| Min/max duration seconds, null duration excluded | 2 |
| Single status including live | 1 options + 4 select |
| `VISIBLE_CALL_LOG_WHERE` always | 2 |
| 400 invalid combos, no partial query | 1 + 3 |
| Page 1 on filter change, filtered total | 3 (total), 4 (setPage(1) in events) |
| Empty copy with vs without filters | 4 |
| Keep last table on error | 4 (catch does not clear callLogs) |
| Clear filters | 4 |
| Debounce ~300ms | 4 |
| No URL persistence | 4 (state only) |
| No embed / no row delete / no staff search | — not implemented |

## Placeholder / type check

- Function names: `parseCallLogListQuery`, `buildCallLogListWhere`, `callLogSearchDigits`, `callLogListHasFilters`, `datetimeLocalToIso`, `buildCallLogListSearchParams`, `CALL_LOG_STATUS_FILTER_OPTIONS`.
- Query param names match the spec: `q`, `startedFrom`, `startedTo`, `minDurationSeconds`, `maxDurationSeconds`, `status`.
- Duration `0` must not be treated as a parse error (avoid truthiness checks).
