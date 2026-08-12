# CommStack Realtime Vercel Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop CommStack WebSocket realtime on Vercel by default so production uses poll + `sync-inbox` only, eliminating EMFILE/reconnect console storms.

**Architecture:** Add `isCommStackRealtimeEnabled()` (explicit `COMM_STACK_REALTIME` override, else off when `VERCEL` is set). Gate all `startCommStackRealtime` / `ensureCommStackRealtimeForConfig` entry points and remove “keep socket warm” side effects from sync/send routes. Status API reports `realtimeMode`.

**Tech Stack:** Next.js App Router, TypeScript, Vitest, existing `@notify/commstack-sdk` wrapper in `lib/commstack.ts`.

**Spec:** `docs/superpowers/specs/2026-08-12-commstack-realtime-vercel-design.md`

## Global Constraints

- Default on Vercel (`process.env.VERCEL` set): realtime **disabled**.
- Default off Vercel (local): realtime **enabled** (unchanged for `next dev`).
- Explicit override: `COMM_STACK_REALTIME=0|false|off` disables; `1|true|on` enables (even on Vercel).
- When disabled: no sockets, no reconnect timers, no `console.error` from realtime handlers.
- Do not change `syncCommStackInbox` business logic or client poll intervals.
- Tests: Vitest colocated `lib/*.test.ts`; run `npm test -- <file>`.
- Do not commit unless the user asks (or the executing agent was told to commit).

## File structure

| File | Responsibility |
|---|---|
| `lib/commstack.ts` | `isCommStackRealtimeEnabled()` + parse helper using existing `readEnv` |
| `lib/commstack-realtime-enabled.test.ts` | Gate matrix unit tests |
| `lib/commstack-realtime.ts` | Early return in start/ensure; once-per-process skip log |
| `instrumentation.ts` | Skip start when gated off; clear info log |
| `app/api/commstack/sync-inbox/route.ts` | Remove realtime warm-up call |
| `app/api/messages/send/route.ts` | Remove ensure/start-on-send |
| `app/api/messages/send-voice/route.ts` | Remove ensure/start-on-send |
| `app/api/commstack/status/route.ts` | Report `realtimeMode`; do not start when disabled |
| `.env.example` | Document `COMM_STACK_REALTIME` |
| `README.md` | One-line note under CommStack config |

---

### Task 1: Realtime enable gate

**Files:**
- Modify: `lib/commstack.ts` (export new helpers near `isCommStackConfigured`)
- Create: `lib/commstack-realtime-enabled.test.ts`

**Interfaces:**
- Produces:
  - `export function isCommStackRealtimeEnabled(): boolean`
  - Internal parse: treat `0` / `false` / `off` as disabled; `1` / `true` / `on` as enabled (case-insensitive after trim via `readEnv`)

- [ ] **Step 1: Write the failing test**

Create `lib/commstack-realtime-enabled.test.ts`:

```typescript
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isCommStackRealtimeEnabled } from "@/lib/commstack";

describe("isCommStackRealtimeEnabled", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.COMM_STACK_REALTIME;
    delete process.env.VERCEL;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("is enabled locally when unset and VERCEL is unset", () => {
    expect(isCommStackRealtimeEnabled()).toBe(true);
  });

  it("is disabled when VERCEL is set and override unset", () => {
    process.env.VERCEL = "1";
    expect(isCommStackRealtimeEnabled()).toBe(false);
  });

  it("respects COMM_STACK_REALTIME=0 on local", () => {
    process.env.COMM_STACK_REALTIME = "0";
    expect(isCommStackRealtimeEnabled()).toBe(false);
  });

  it("respects COMM_STACK_REALTIME=false and off (case-insensitive)", () => {
    process.env.COMM_STACK_REALTIME = "False";
    expect(isCommStackRealtimeEnabled()).toBe(false);
    process.env.COMM_STACK_REALTIME = "OFF";
    expect(isCommStackRealtimeEnabled()).toBe(false);
  });

  it("respects COMM_STACK_REALTIME=1 on Vercel", () => {
    process.env.VERCEL = "1";
    process.env.COMM_STACK_REALTIME = "1";
    expect(isCommStackRealtimeEnabled()).toBe(true);
  });

  it("respects COMM_STACK_REALTIME=true and on", () => {
    process.env.VERCEL = "1";
    process.env.COMM_STACK_REALTIME = "true";
    expect(isCommStackRealtimeEnabled()).toBe(true);
    process.env.COMM_STACK_REALTIME = "ON";
    expect(isCommStackRealtimeEnabled()).toBe(true);
  });

  it("treats unknown COMM_STACK_REALTIME values as unset (fall through to VERCEL default)", () => {
    process.env.VERCEL = "1";
    process.env.COMM_STACK_REALTIME = "maybe";
    expect(isCommStackRealtimeEnabled()).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- lib/commstack-realtime-enabled.test.ts`

Expected: FAIL — `isCommStackRealtimeEnabled` is not exported.

- [ ] **Step 3: Implement the gate in `lib/commstack.ts`**

Near `isCommStackConfigured`, add:

```typescript
function parseRealtimeFlag(raw: string | undefined): boolean | null {
  if (raw == null) return null;
  const value = raw.trim().toLowerCase();
  if (value === "0" || value === "false" || value === "off") return false;
  if (value === "1" || value === "true" || value === "on") return true;
  return null;
}

/**
 * Whether long-lived CommStack Socket.IO should run in this process.
 * Default: off on Vercel (serverless), on elsewhere. Override with COMM_STACK_REALTIME.
 */
export function isCommStackRealtimeEnabled(): boolean {
  const override = parseRealtimeFlag(readEnv("COMM_STACK_REALTIME"));
  if (override != null) return override;
  return !process.env.VERCEL;
}
```

Note: `VERCEL` check uses presence of `process.env.VERCEL` (Vercel sets it to `"1"`), not `readEnv`, matching the spec.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- lib/commstack-realtime-enabled.test.ts`

Expected: PASS (all cases).

- [ ] **Step 5: Commit (only if user requested commits)**

```bash
git add lib/commstack.ts lib/commstack-realtime-enabled.test.ts
git commit -m "feat: gate CommStack realtime with COMM_STACK_REALTIME / VERCEL"
```

---

### Task 2: Gate start/ensure in realtime module

**Files:**
- Modify: `lib/commstack-realtime.ts`
- Create: `lib/commstack-realtime-gate.test.ts`

**Interfaces:**
- Consumes: `isCommStackRealtimeEnabled` from `@/lib/commstack`
- Produces: `startCommStackRealtime` / `ensureCommStackRealtimeForConfig` no-op when disabled; at most one skip info log per process

- [ ] **Step 1: Write the failing test**

Create `lib/commstack-realtime-gate.test.ts`:

```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const originalEnv = process.env;

describe("startCommStackRealtime gate", () => {
  beforeEach(() => {
    process.env = { ...originalEnv, VERCEL: "1" };
    delete process.env.COMM_STACK_REALTIME;
    vi.resetModules();
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it("returns without loading configs when realtime is disabled on Vercel", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const { startCommStackRealtime } = await import("@/lib/commstack-realtime");
    await startCommStackRealtime();
    // Second call must not log again
    await startCommStackRealtime();
    expect(info.mock.calls.filter((c) => String(c[0]).includes("realtime skipped")).length).toBe(1);
  });
});
```

This test must not hit Prisma: the early return must happen **before** `isCommStackConfigured` / `loadDistinctConfigs`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- lib/commstack-realtime-gate.test.ts`

Expected: FAIL or hang/error — current code proceeds past gate into CommStack/Prisma.

- [ ] **Step 3: Implement early returns**

In `lib/commstack-realtime.ts`:

1. Import `isCommStackRealtimeEnabled` from `@/lib/commstack` (alongside existing imports from that module).
2. Add module state:

```typescript
let skippedRealtimeLog = false;

function logRealtimeSkippedOnce(): void {
  if (skippedRealtimeLog) return;
  skippedRealtimeLog = true;
  console.info(
    "[commstack] realtime skipped — disabled (VERCEL default or COMM_STACK_REALTIME=0)",
  );
}
```

3. At the top of `ensureCommStackRealtimeForConfig`:

```typescript
export async function ensureCommStackRealtimeForConfig(
  config: ContactCommStackConfig,
): Promise<void> {
  if (!isCommStackRealtimeEnabled()) {
    logRealtimeSkippedOnce();
    return;
  }
  if (!isCommStackConfigured()) {
    return;
  }
  await startConnection(config);
}
```

4. At the top of `startCommStackRealtime` (before configured check):

```typescript
export async function startCommStackRealtime(): Promise<void> {
  if (!isCommStackRealtimeEnabled()) {
    logRealtimeSkippedOnce();
    return;
  }
  if (!isCommStackConfigured()) {
    console.info("[commstack] realtime skipped — CommStack env is not configured");
    return;
  }
  // ... existing body unchanged
}
```

- [ ] **Step 4: Run tests**

Run: `npm test -- lib/commstack-realtime-enabled.test.ts lib/commstack-realtime-gate.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit (only if user requested commits)**

```bash
git add lib/commstack-realtime.ts lib/commstack-realtime-gate.test.ts
git commit -m "fix: no-op CommStack realtime start when gated off"
```

---

### Task 3: Call sites — instrumentation, sync-inbox, send routes

**Files:**
- Modify: `instrumentation.ts`
- Modify: `app/api/commstack/sync-inbox/route.ts`
- Modify: `app/api/messages/send/route.ts`
- Modify: `app/api/messages/send-voice/route.ts`

**Interfaces:**
- Consumes: `isCommStackRealtimeEnabled` / gated `startCommStackRealtime` (defense in depth still required)

- [ ] **Step 1: Update `instrumentation.ts`**

Replace the start block so disabled is explicit and does not call start:

```typescript
export async function register() {
  if (process.env.NEXT_RUNTIME === "edge") {
    return;
  }

  const { isCommStackConfigured, isCommStackRealtimeEnabled } = await import("@/lib/commstack");
  const { startCommStackRealtime } = await import("@/lib/commstack-realtime");

  if (!isCommStackConfigured()) {
    console.info("[commstack] instrumentation skipped — COMM_STACK_ENV not configured");
    return;
  }

  if (!isCommStackRealtimeEnabled()) {
    console.info(
      "[commstack] instrumentation skipped — realtime disabled (VERCEL default or COMM_STACK_REALTIME=0)",
    );
    return;
  }

  try {
    await startCommStackRealtime();
    console.info("[commstack] instrumentation realtime start complete");
  } catch (error) {
    console.error("[commstack] startup realtime failed", error);
  }
}
```

- [ ] **Step 2: Update `app/api/commstack/sync-inbox/route.ts`**

Remove the realtime warm-up try/catch entirely. Keep auth + `syncCommStackInbox` only:

```typescript
import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-auth";
import { isCommStackConfigured } from "@/lib/commstack";
import { syncCommStackInbox } from "@/lib/commstack-sync";

export async function POST() {
  const authResult = await requireSession();
  if ("error" in authResult) {
    return authResult.error;
  }

  if (!isCommStackConfigured()) {
    return NextResponse.json({ synced: 0, imported: 0, skipped: true });
  }

  try {
    const result = await syncCommStackInbox();
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to sync Notify inbox.",
      },
      { status: 502 },
    );
  }
}
```

Remove unused `startCommStackRealtime` import.

- [ ] **Step 3: Update send routes**

In `app/api/messages/send/route.ts` and `app/api/messages/send-voice/route.ts`:

1. Remove imports of `ensureCommStackRealtimeForConfig` and `startCommStackRealtime`.
2. Delete the “Keep the portal realtime socket alive…” blocks (the `void ensure…` / `void start…` calls and comments).

Outbound CommStack send logic stays unchanged.

- [ ] **Step 4: Sanity check TypeScript / tests**

Run: `npm test -- lib/commstack-realtime-enabled.test.ts lib/commstack-realtime-gate.test.ts`

Expected: PASS. Confirm no leftover unused imports in the four files (lint if available).

- [ ] **Step 5: Commit (only if user requested commits)**

```bash
git add instrumentation.ts app/api/commstack/sync-inbox/route.ts app/api/messages/send/route.ts app/api/messages/send-voice/route.ts
git commit -m "fix: stop warming CommStack realtime from API routes and instrumentation"
```

---

### Task 4: Status API + docs

**Files:**
- Modify: `app/api/commstack/status/route.ts`
- Modify: `.env.example`
- Modify: `README.md` (CommStack env section)

**Interfaces:**
- Produces JSON field `realtimeMode: "enabled" | "disabled"` on status responses (configured and unconfigured paths should both be coherent)

- [ ] **Step 1: Update status route**

Import `isCommStackRealtimeEnabled` from `@/lib/commstack`.

When CommStack is not configured, include:

```typescript
realtimeMode: isCommStackRealtimeEnabled() ? "enabled" : "disabled",
```

alongside existing `realtimeConnected: false`.

When configured:

```typescript
const realtimeEnabled = isCommStackRealtimeEnabled();
let realtimeError: string | null = null;

if (realtimeEnabled) {
  try {
    await startCommStackRealtime();
  } catch (error) {
    realtimeError = error instanceof Error ? error.message : String(error);
  }
}

return NextResponse.json({
  configured: true,
  verified,
  verifyError,
  realtimeMode: realtimeEnabled ? "enabled" : "disabled",
  realtimeConnected: realtimeEnabled ? isCommStackRealtimeConnected() : false,
  realtimeError: realtimeEnabled ? (realtimeError ?? getCommStackRealtimeError()) : null,
  realtime: realtimeEnabled
    ? getCommStackRealtimeStatus()
    : { connections: [] },
  env: process.env.COMM_STACK_ENV?.trim() ?? null,
  communities: communityList,
  notifyContactCount: notifyContacts.length,
  checks: diagnostics.checks,
  missing: diagnostics.missing,
});
```

- [ ] **Step 2: Document env in `.env.example`**

After the `COMM_STACK_ENV` block, add:

```bash
# Optional: long-lived CommStack Socket.IO in this Node process.
# Default: off on Vercel, on for local `next dev`. Set 0 to force off, 1 to force on.
# COMM_STACK_REALTIME="0"
```

- [ ] **Step 3: Document in `README.md`**

Under Required for Notify / CommStack messaging, add:

```markdown
- `COMM_STACK_REALTIME` — optional; `0`/`1` to force realtime sockets off/on. Default is off on Vercel (poll + sync-inbox), on locally.
```

- [ ] **Step 4: Run focused tests once more**

Run: `npm test -- lib/commstack-realtime-enabled.test.ts lib/commstack-realtime-gate.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit (only if user requested commits)**

```bash
git add app/api/commstack/status/route.ts .env.example README.md
git commit -m "docs: expose realtimeMode and document COMM_STACK_REALTIME"
```

---

### Task 5: Manual verification checklist

No code changes. Confirm before calling the work done:

- [ ] **Step 1: Local with default (realtime on)**  
  `npm run dev` → open status (or diagnose) → `realtimeMode: "enabled"` acceptable; no requirement to fully connect if CommStack staging is down.

- [ ] **Step 2: Local force-off**  
  Set `COMM_STACK_REALTIME=0` in `.env.local`, restart → status shows `realtimeMode: "disabled"`, `realtimeConnected: false`, `realtimeError: null`. Inbox poll + sync-inbox still work.

- [ ] **Step 3: Production expectation after deploy**  
  On Vercel without `COMM_STACK_REALTIME=1`: instrumentation skip log once; no `[commstack] realtime error` spam; sync-inbox 200s; inbox updates within ~15s via history sync.

---

## Spec coverage (self-review)

| Spec requirement | Task |
|---|---|
| `isCommStackRealtimeEnabled` matrix | Task 1 |
| Gate `start` / `ensure` | Task 2 |
| instrumentation / sync-inbox / send / send-voice | Task 3 |
| Status `realtimeMode` + no start when disabled | Task 4 |
| README / `.env.example` | Task 4 |
| Manual verification | Task 5 |
| Always-on worker / reconnect hardening | Out of scope (spec) |
