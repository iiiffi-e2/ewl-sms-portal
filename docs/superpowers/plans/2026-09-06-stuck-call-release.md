# Stuck Call Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close `CallLog` on hangup immediately, expire leftover `in_progress` after 10 minutes, and expire unclaimed inbound `ringing` after 2 minutes so staff are not blocked by a ghost active call.

**Architecture:** The browser PATCHes a terminal status on every Twilio `disconnect` (`completed` if the call connected, `canceled` otherwise). `expireStaleActiveCalls` shortens the `in_progress` window to 10 minutes and also sweeps unclaimed inbound ringing. The voice status webhook may still write duration/outcome but must not move a terminal row back to an active status.

**Tech Stack:** Next.js 16 App Router, Prisma 6, Twilio Voice SDK, Zod, Vitest, React 19

**Spec:** `docs/superpowers/specs/2026-09-06-stuck-call-release-design.md`

## Global Constraints

- No Prisma schema or `CallStatus` enum changes.
- No manual “Release call” button.
- Do not look up the Twilio Call SID on initiate.
- Keep the 2-minute stale window for `initiating` / `ringing` setup states.
- Do not expire an `in_progress` row younger than 10 minutes.
- Connected hangup writes `completed`; never-connected hangup writes `canceled`.
- A late non-terminal Twilio status callback must not reopen a terminal `CallLog`.

---

## File Map

| File | Responsibility |
|---|---|
| `lib/validators.ts` | `updateCallLogSchema` accepts `completed` |
| `lib/validators-call.test.ts` | Schema accept/reject cases |
| `lib/voice/calls.ts` | 10-minute `in_progress` stale, unclaimed inbound sweep, hangup/PATCH status helpers |
| `lib/voice/calls.test.ts` | Expiry windows, hangup status, PATCH status map |
| `lib/voice/status.ts` | `buildVoiceStatusUpdate` — webhook must not reopen terminal rows |
| `lib/voice/status.test.ts` | Terminal vs non-terminal webhook payload cases |
| `app/api/calls/[id]/route.ts` | Map `completed` → `CallStatus.completed` |
| `app/api/calls/ringing/route.ts` | Run stale expiry before returning a ringing inbound |
| `app/api/webhooks/voice/status/route.ts` | Use `buildVoiceStatusUpdate`; select current `status` |
| `components/caretext/VoiceCallProvider.tsx` | Always PATCH on `disconnect` |

`POST /api/calls/initiate` already calls `expireStaleActiveCalls(userId)`. Do not change that call.

---

### Task 1: Accept `completed` on call-log PATCH schema

**Files:**
- Modify: `lib/validators.ts`
- Modify: `lib/validators-call.test.ts`

**Interfaces:**
- Consumes: existing `updateCallLogSchema`
- Produces: `updateCallLogSchema` parses `{ status: "canceled" | "failed" | "completed" }`

- [ ] **Step 1: Write the failing tests**

Add to `lib/validators-call.test.ts` (keep the existing `initiateCallSchema` tests). Import `updateCallLogSchema` from `@/lib/validators`:

```typescript
import { describe, expect, it } from "vitest";
import { initiateCallSchema, updateCallLogSchema } from "@/lib/validators";

describe("updateCallLogSchema", () => {
  it("accepts canceled, failed, and completed", () => {
    expect(updateCallLogSchema.safeParse({ status: "canceled" }).success).toBe(true);
    expect(updateCallLogSchema.safeParse({ status: "failed" }).success).toBe(true);
    expect(updateCallLogSchema.safeParse({ status: "completed" }).success).toBe(true);
  });

  it("rejects unknown statuses", () => {
    expect(updateCallLogSchema.safeParse({ status: "in_progress" }).success).toBe(false);
    expect(updateCallLogSchema.safeParse({ status: "stale" }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/validators-call.test.ts`

Expected: FAIL — `completed` is not in the enum (`success` is `false`).

- [ ] **Step 3: Write minimal implementation**

In `lib/validators.ts`, change:

```typescript
export const updateCallLogSchema = z.object({
  status: z.enum(["canceled", "failed"]),
});
```

to:

```typescript
export const updateCallLogSchema = z.object({
  status: z.enum(["canceled", "failed", "completed"]),
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/validators-call.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/validators.ts lib/validators-call.test.ts
git commit -m "feat: allow completed status on call log PATCH"
```

---

### Task 2: Map PATCH status including `completed`

**Files:**
- Modify: `lib/voice/calls.ts`
- Modify: `lib/voice/calls.test.ts`
- Modify: `app/api/calls/[id]/route.ts`

**Interfaces:**
- Consumes: `updateCallLogSchema` status `"canceled" | "failed" | "completed"`
- Produces: `mapPatchCallLogStatus(status: "canceled" | "failed" | "completed"): CallStatus`

The current route treats anything other than `"canceled"` as `failed`, so `"completed"` would be stored as `failed`.

- [ ] **Step 1: Write the failing tests**

Replace `lib/voice/calls.test.ts` contents with:

```typescript
import { CallStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { ACTIVE_CALL_STATUSES, mapPatchCallLogStatus } from "@/lib/voice/calls";

describe("ACTIVE_CALL_STATUSES", () => {
  it("includes non-terminal in-flight statuses", () => {
    expect(ACTIVE_CALL_STATUSES).toEqual([
      CallStatus.initiating,
      CallStatus.ringing,
      CallStatus.in_progress,
    ]);
  });
});

describe("mapPatchCallLogStatus", () => {
  it("maps canceled, failed, and completed", () => {
    expect(mapPatchCallLogStatus("canceled")).toBe(CallStatus.canceled);
    expect(mapPatchCallLogStatus("failed")).toBe(CallStatus.failed);
    expect(mapPatchCallLogStatus("completed")).toBe(CallStatus.completed);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/voice/calls.test.ts`

Expected: FAIL — `mapPatchCallLogStatus` is not exported.

- [ ] **Step 3: Write minimal implementation**

Add to `lib/voice/calls.ts`:

```typescript
export function mapPatchCallLogStatus(
  status: "canceled" | "failed" | "completed",
): CallStatus {
  if (status === "canceled") {
    return CallStatus.canceled;
  }
  if (status === "completed") {
    return CallStatus.completed;
  }
  return CallStatus.failed;
}
```

In `app/api/calls/[id]/route.ts`, import `mapPatchCallLogStatus` from `@/lib/voice/calls` and change the update `data` to:

```typescript
data: {
  status: mapPatchCallLogStatus(parsed.data.status),
  endedAt: new Date(),
  outcome: parsed.data.status,
},
```

Remove the unused `CallStatus` import from the route if it is no longer referenced.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/voice/calls.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/voice/calls.ts lib/voice/calls.test.ts app/api/calls/[id]/route.ts
git commit -m "feat: persist completed when patching a call log"
```

---

### Task 3: PATCH completed on connected hangup

**Files:**
- Modify: `lib/voice/calls.ts`
- Modify: `lib/voice/calls.test.ts`
- Modify: `components/caretext/VoiceCallProvider.tsx`

**Interfaces:**
- Consumes: `mapPatchCallLogStatus`, `PATCH /api/calls/:id`
- Produces: `hangupCallLogPatchStatus(wasConnected: boolean): "canceled" | "completed"`

- [ ] **Step 1: Write the failing tests**

Add to `lib/voice/calls.test.ts` (import `hangupCallLogPatchStatus`):

```typescript
describe("hangupCallLogPatchStatus", () => {
  it("cancels a call that never connected", () => {
    expect(hangupCallLogPatchStatus(false)).toBe("canceled");
  });

  it("completes a call that connected", () => {
    expect(hangupCallLogPatchStatus(true)).toBe("completed");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/voice/calls.test.ts`

Expected: FAIL — `hangupCallLogPatchStatus` is not exported.

- [ ] **Step 3: Write minimal implementation**

Add to `lib/voice/calls.ts`:

```typescript
export function hangupCallLogPatchStatus(wasConnected: boolean): "canceled" | "completed" {
  return wasConnected ? "completed" : "canceled";
}
```

In `components/caretext/VoiceCallProvider.tsx`:

1. Import `hangupCallLogPatchStatus` from `@/lib/voice/calls`.
2. Rename `cancelCallLog` to `finalizeCallLog` and accept a status:

```typescript
const finalizeCallLog = useCallback(async (callLogId: string, status: "canceled" | "completed") => {
  await fetch(`/api/calls/${callLogId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
}, []);
```

3. In `bindCallEvents`, change `disconnect` so it always finalizes:

```typescript
call.on("disconnect", async () => {
  setCallPhase("disconnecting");
  await finalizeCallLog(callLogId, hangupCallLogPatchStatus(wasConnected));
  resetCallState();
});
```

4. Keep `cancel`, `error`, and failed `startCall` on `canceled`:

```typescript
await finalizeCallLog(callLogId, "canceled");
```

5. Update `bindCallEvents` / `startCall` dependency arrays from `cancelCallLog` to `finalizeCallLog`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/voice/calls.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/voice/calls.ts lib/voice/calls.test.ts components/caretext/VoiceCallProvider.tsx
git commit -m "fix: mark connected hangups completed instead of leaving the call active"
```

---

### Task 4: 10-minute in-progress stale sweep and unclaimed inbound ringing

**Files:**
- Modify: `lib/voice/calls.ts`
- Modify: `lib/voice/calls.test.ts`
- Modify: `app/api/calls/ringing/route.ts`

**Interfaces:**
- Consumes: `prisma.callLog.updateMany`, `SETUP_STALE_MS` (2 minutes, unchanged), session user id
- Produces: `expireStaleActiveCalls(userId: string): Promise<void>` also cancels:
  - this user’s `in_progress` rows with `startedAt` older than 10 minutes
  - any inbound `ringing` row with `initiatedById` null and `startedAt` older than 2 minutes

`GET /api/calls/ringing` must call `expireStaleActiveCalls(authResult.session.user.id)` before `findFirst`, so a ghost inbound ring is not returned.

- [ ] **Step 1: Write the failing tests**

Add prisma mocks and expiry tests to `lib/voice/calls.test.ts`. Put the `vi.mock` and `updateMany` hoisted fn at the top of the file (same pattern as `lib/voice/call-attachment.test.ts`), then import `expireStaleActiveCalls` after the mock:

```typescript
import { CallDirection, CallStatus } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const updateMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    callLog: {
      updateMany: (...args: unknown[]) => updateMany(...args),
    },
  },
}));

import {
  ACTIVE_CALL_STATUSES,
  expireStaleActiveCalls,
  hangupCallLogPatchStatus,
  mapPatchCallLogStatus,
} from "@/lib/voice/calls";

const NOW = 1_725_000_000_000;

function updateWhere(index: number) {
  return updateMany.mock.calls[index]?.[0]?.where;
}

describe("expireStaleActiveCalls", () => {
  beforeEach(() => {
    updateMany.mockReset();
    updateMany.mockResolvedValue({ count: 0 });
    vi.spyOn(Date, "now").mockReturnValue(NOW);
  });

  it("cancels in_progress rows older than 10 minutes", async () => {
    await expireStaleActiveCalls("user-1");

    const inProgress = updateMany.mock.calls
      .map((call) => call[0])
      .find((arg) => arg.where.status === CallStatus.in_progress);

    expect(inProgress).toEqual({
      where: {
        initiatedById: "user-1",
        status: CallStatus.in_progress,
        startedAt: { lt: new Date(NOW - 10 * 60 * 1000) },
      },
      data: {
        status: CallStatus.canceled,
        endedAt: expect.any(Date),
        outcome: "stale",
      },
    });
  });

  it("cancels unclaimed inbound ringing older than 2 minutes", async () => {
    await expireStaleActiveCalls("user-1");

    const inbound = updateMany.mock.calls
      .map((call) => call[0])
      .find((arg) => arg.where.direction === CallDirection.inbound);

    expect(inbound).toEqual({
      where: {
        direction: CallDirection.inbound,
        initiatedById: null,
        status: CallStatus.ringing,
        startedAt: { lt: new Date(NOW - 2 * 60 * 1000) },
      },
      data: {
        status: CallStatus.canceled,
        endedAt: expect.any(Date),
        outcome: "stale",
      },
    });
  });

  it("still cancels this user's initiating/ringing rows with no Twilio SID immediately", async () => {
    await expireStaleActiveCalls("user-1");

    const noSid = updateMany.mock.calls
      .map((call) => call[0])
      .find((arg) => arg.where.twilioSid === null);

    expect(noSid.where).toEqual({
      initiatedById: "user-1",
      status: { in: [CallStatus.initiating, CallStatus.ringing] },
      twilioSid: null,
    });
  });
});
```

Keep the existing `ACTIVE_CALL_STATUSES`, `mapPatchCallLogStatus`, and `hangupCallLogPatchStatus` describes in this same file. Remove the unused `updateWhere` helper if you inlined finds as above.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/voice/calls.test.ts`

Expected: FAIL — `in_progress` window is still 4 hours (`NOW - 4 * 60 * 60 * 1000`), and there is no inbound `direction` update.

- [ ] **Step 3: Write minimal implementation**

In `lib/voice/calls.ts`:

1. Import `CallDirection` from `@prisma/client` (keep `CallStatus` and `Prisma`).
2. Change:

```typescript
const IN_PROGRESS_STALE_MS = 4 * 60 * 60 * 1000;
```

to:

```typescript
const IN_PROGRESS_STALE_MS = 10 * 60 * 1000;
```

3. At the end of `expireStaleActiveCalls`, add:

```typescript
await prisma.callLog.updateMany({
  where: {
    direction: CallDirection.inbound,
    initiatedById: null,
    status: CallStatus.ringing,
    startedAt: { lt: new Date(now - SETUP_STALE_MS) },
  },
  data: {
    status: CallStatus.canceled,
    endedAt: new Date(),
    outcome: "stale",
  },
});
```

In `app/api/calls/ringing/route.ts`, import `expireStaleActiveCalls` from `@/lib/voice/calls` and call it immediately after a successful `requireSession`:

```typescript
await expireStaleActiveCalls(authResult.session.user.id);
```

Place that call before `prisma.callLog.findFirst`.

Do not change `app/api/calls/initiate/route.ts`; it already calls `expireStaleActiveCalls`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/voice/calls.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/voice/calls.ts lib/voice/calls.test.ts app/api/calls/ringing/route.ts
git commit -m "fix: expire leftover in-progress and unclaimed inbound calls sooner"
```

---

### Task 5: Do not reopen a terminal call from a late Twilio status webhook

**Files:**
- Modify: `lib/voice/status.ts`
- Modify: `lib/voice/status.test.ts`
- Modify: `app/api/webhooks/voice/status/route.ts`

**Interfaces:**
- Consumes: `isTerminalCallStatus`, `mapTwilioCallStatus`
- Produces:

```typescript
export function buildVoiceStatusUpdate(input: {
  currentStatus: CallStatus;
  endedAt: Date | null;
  mappedStatus: CallStatus;
  twilioOutcome: string;
  callSid: string;
  durationSeconds?: number;
}): {
  twilioSid: string;
  status?: CallStatus;
  outcome: string;
  endedAt?: Date;
  durationSeconds?: number;
} | null
```

Rules:

- Already terminal (`endedAt` set **or** `isTerminalCallStatus(currentStatus)`) and `mappedStatus` is not terminal → return `null` (skip the update).
- Already terminal and `mappedStatus` is terminal → `{ twilioSid, outcome, durationSeconds? }` only. Do not change `status`. Include `durationSeconds` only when `Number.isFinite(durationSeconds)`.
- Not terminal → `{ twilioSid, status: mappedStatus, outcome }` plus, when `mappedStatus` is terminal, `endedAt: endedAt ?? new Date()` and finite `durationSeconds`.

- [ ] **Step 1: Write the failing tests**

Add to `lib/voice/status.test.ts` (import `buildVoiceStatusUpdate`):

```typescript
describe("buildVoiceStatusUpdate", () => {
  it("ignores a non-terminal Twilio status after the call is already terminal", () => {
    expect(
      buildVoiceStatusUpdate({
        currentStatus: CallStatus.completed,
        endedAt: new Date("2026-09-06T22:00:00.000Z"),
        mappedStatus: CallStatus.in_progress,
        twilioOutcome: "in-progress",
        callSid: "CA123",
        durationSeconds: 12,
      }),
    ).toBeNull();
  });

  it("ignores a non-terminal Twilio status when current status is terminal even if endedAt is missing", () => {
    expect(
      buildVoiceStatusUpdate({
        currentStatus: CallStatus.canceled,
        endedAt: null,
        mappedStatus: CallStatus.ringing,
        twilioOutcome: "ringing",
        callSid: "CA123",
      }),
    ).toBeNull();
  });

  it("applies duration and outcome from a later terminal webhook without changing status", () => {
    expect(
      buildVoiceStatusUpdate({
        currentStatus: CallStatus.completed,
        endedAt: new Date("2026-09-06T22:00:00.000Z"),
        mappedStatus: CallStatus.completed,
        twilioOutcome: "completed",
        callSid: "CA123",
        durationSeconds: 47,
      }),
    ).toEqual({
      twilioSid: "CA123",
      outcome: "completed",
      durationSeconds: 47,
    });
  });

  it("still writes status when the call is not yet terminal", () => {
    const result = buildVoiceStatusUpdate({
      currentStatus: CallStatus.in_progress,
      endedAt: null,
      mappedStatus: CallStatus.completed,
      twilioOutcome: "completed",
      callSid: "CA123",
      durationSeconds: 20,
    });

    expect(result).toMatchObject({
      twilioSid: "CA123",
      status: CallStatus.completed,
      outcome: "completed",
      durationSeconds: 20,
    });
    expect(result?.endedAt).toBeInstanceOf(Date);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/voice/status.test.ts`

Expected: FAIL — `buildVoiceStatusUpdate` is not exported.

- [ ] **Step 3: Write minimal implementation**

Add to `lib/voice/status.ts`:

```typescript
export function buildVoiceStatusUpdate(input: {
  currentStatus: CallStatus;
  endedAt: Date | null;
  mappedStatus: CallStatus;
  twilioOutcome: string;
  callSid: string;
  durationSeconds?: number;
}): {
  twilioSid: string;
  status?: CallStatus;
  outcome: string;
  endedAt?: Date;
  durationSeconds?: number;
} | null {
  const alreadyTerminal = Boolean(input.endedAt) || isTerminalCallStatus(input.currentStatus);
  const mappedTerminal = isTerminalCallStatus(input.mappedStatus);
  const durationSeconds = Number.isFinite(input.durationSeconds)
    ? input.durationSeconds
    : undefined;

  if (alreadyTerminal && !mappedTerminal) {
    return null;
  }

  if (alreadyTerminal) {
    return {
      twilioSid: input.callSid,
      outcome: input.twilioOutcome,
      ...(durationSeconds !== undefined ? { durationSeconds } : {}),
    };
  }

  return {
    twilioSid: input.callSid,
    status: input.mappedStatus,
    outcome: input.twilioOutcome,
    ...(mappedTerminal
      ? {
          endedAt: input.endedAt ?? new Date(),
          ...(durationSeconds !== undefined ? { durationSeconds } : {}),
        }
      : {}),
  };
}
```

In `app/api/webhooks/voice/status/route.ts`:

1. Import `buildVoiceStatusUpdate` (keep `mapTwilioCallStatus`; `isTerminalCallStatus` can be removed from this file if unused).
2. Change the `select` in both lookups to `{ id: true, endedAt: true, status: true }`.
3. Replace the unconditional `prisma.callLog.update` with:

```typescript
const data = buildVoiceStatusUpdate({
  currentStatus: callLog.status,
  endedAt: callLog.endedAt,
  mappedStatus,
  twilioOutcome: callStatus,
  callSid,
  durationSeconds: duration,
});

if (!data) {
  return NextResponse.json({ ok: true, skipped: true });
}

await prisma.callLog.update({
  where: { id: callLog.id },
  data,
});

return NextResponse.json({ ok: true });
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/voice/status.test.ts lib/voice/calls.test.ts lib/validators-call.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/voice/status.ts lib/voice/status.test.ts app/api/webhooks/voice/status/route.ts
git commit -m "fix: keep terminal call logs closed when a late Twilio status arrives"
```

---

## Verification

After all tasks:

```bash
npx vitest run lib/validators-call.test.ts lib/voice/calls.test.ts lib/voice/status.test.ts
```

Expected: PASS

Manual (staging or local with voice):

1. Place a short outbound call, hang up from either side, then place another call immediately. It must not 409.
2. Confirm the first log is `completed` (or `canceled` if it never connected).
3. Do not leave an inbound ring unanswered for more than 2 minutes, then open the app: no ghost incoming call.

---

## Spec coverage

| Spec requirement | Task |
|---|---|
| Hangup always PATCHes a terminal status | Task 3 |
| Connected hangup is `completed` | Task 2, Task 3 |
| Never-connected hangup is `canceled` | Task 3 |
| `updateCallLogSchema` accepts `completed` | Task 1 |
| PATCH maps `completed` → `CallStatus.completed` | Task 2 |
| `in_progress` stale window 10 minutes | Task 4 |
| Unclaimed inbound `ringing` expires after 2 minutes | Task 4 |
| Expiry runs on initiate (already) and ringing poll | Task 4 |
| Setup `initiating`/`ringing` 2-minute window unchanged | Task 4 |
| No-SID initiating/ringing still cancel immediately | Task 4 |
| Webhook can still set duration/outcome | Task 5 |
| Webhook cannot reopen a terminal call | Task 5 |
| No schema change, no release button, no Twilio SID lookup | All tasks |
