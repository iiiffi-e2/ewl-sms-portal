# CommStack Realtime on Vercel — Design Spec

**Date:** 2026-08-12  
**Status:** Approved for implementation (Approach A — disable realtime on Vercel; poll/sync only)  
**Context:** Production Vercel logs (export `ewl-care-text-log-export-2026-08-12T14-45-30.json`) showed ~12.6k `error` lines in ~9 minutes, almost all CommStack realtime WebSocket churn (`timeout` / `websocket error`), with nested `EMFILE` and `getaddrinfo EBUSY`, cascading into slow/500 inbox invocations.

## Summary

Stop opening long-lived CommStack Socket.IO connections inside Vercel serverless Node processes. Rely on the existing client poll (`/api/conversations` ~5s) plus `POST /api/commstack/sync-inbox` (~15s) for inbound Notify delivery. Keep realtime available for local/dev (and optional explicit opt-in) behind a clear enable gate.

## Goals

- Eliminate production reconnect storms, `EMFILE` exhaustion, and console error floods from `lib/commstack-realtime.ts`.
- Preserve inbound Notify message delivery via history sync (acceptable latency: seconds to ~15s).
- Make “realtime off” an intentional, observable mode — not a silent failure that looks like an outage.
- Leave a clean path to re-enable push later (always-on worker or `COMM_STACK_REALTIME=1`).

## Non-Goals

- Building an always-on realtime worker (Fly/Railway/container) in this change.
- Changing poll intervals, sync-inbox business logic, or CommStack send paths beyond removing “keep socket warm” side effects.
- Hardening the reconnect loop as the primary production strategy (Approach B) — only relevant if realtime is explicitly enabled.
- Client UI redesign; status API fields may gain a mode flag for operators/diagnostics only.

## Stakeholder decisions

| Decision | Choice |
|---|---|
| Inbound latency | Poll/sync is fine for now |
| Architecture | Approach A — disable realtime on Vercel by default |
| Local/dev | Realtime remains allowed unless explicitly disabled |
| Force-on in prod | Optional `COMM_STACK_REALTIME=1` escape hatch (documented as unsupported/risky on serverless) |
| Force-off anywhere | `COMM_STACK_REALTIME=0` |

## Root cause (why this design)

1. `instrumentation.ts` and `/api/commstack/sync-inbox` (plus send routes) call `startCommStackRealtime()`.
2. Connections target `wss://*.notifync.com:5213` and reconnect on disconnect every 3s with no backoff.
3. On Vercel, instances are short-lived and FD-limited; failed reconnects accumulate → `EMFILE` → more failures → `console.error` attached to whatever request is active → starved invocations (500s / multi-minute durations).
4. History sync already works when realtime cannot connect (`sync-inbox` catches realtime start failures).

## Enable gate

Add `isCommStackRealtimeEnabled()` (alongside existing `isCommStackConfigured()`), evaluated as:

| Condition | Result |
|---|---|
| `COMM_STACK_REALTIME=0` (or `false` / `off`) | **Disabled** |
| `COMM_STACK_REALTIME=1` (or `true` / `on`) | **Enabled** (even on Vercel) |
| Unset and `process.env.VERCEL` is set | **Disabled** (production/preview serverless default) |
| Unset and not on Vercel | **Enabled** (local `next dev` / non-Vercel Node) |

When disabled, `startCommStackRealtime` / `ensureCommStackRealtimeForConfig` return immediately without opening sockets, binding handlers, or scheduling reconnects. Log once at info when skipped due to the gate (avoid per-request spam: log at most once per process, or only from instrumentation).

## Call sites

| Location | Change when realtime disabled |
|---|---|
| `instrumentation.ts` | Skip start; info log that realtime is gated off |
| `app/api/commstack/sync-inbox/route.ts` | Do not call `startCommStackRealtime`; run `syncCommStackInbox` only |
| `app/api/messages/send/route.ts` | Remove/no-op “keep socket warm” ensure/start calls |
| `app/api/messages/send-voice/route.ts` | Same as send |
| `app/api/commstack/status/route.ts` | Do not attempt start; report mode + connected=false without treating as error |
| `lib/commstack-realtime.ts` | Gate at top of `startCommStackRealtime` / `ensureCommStackRealtimeForConfig` (defense in depth) |

## Status / observability

`GET /api/commstack/status` response gains:

- `realtimeMode: "enabled" | "disabled"`
- `realtimeConnected` remains boolean (false when disabled)
- `realtimeError` null when disabled (not “could not connect”)
- Existing `realtime.connections` may be empty when disabled

Optional one-line note in README / `.env.example` documenting `COMM_STACK_REALTIME`.

## Runtime flow (production default)

```text
Staff browser (visible tab)
  -> every ~5s: GET /api/conversations
  -> every ~15s: POST /api/commstack/sync-inbox
       -> syncCommStackInbox (history backfill)
       -> no WebSocket

Server boot (instrumentation)
  -> isCommStackRealtimeEnabled()? no on Vercel
  -> skip startCommStackRealtime
```

## Error handling

- Disabled path: no `console.error` from realtime connect/reconnect/error handlers (handlers never bound).
- Sync failures remain 502 from sync-inbox as today; unrelated to realtime.
- If `COMM_STACK_REALTIME=1` on Vercel: behavior reverts to current connect/reconnect code (accepted risk; document).

## Testing

- Unit test `isCommStackRealtimeEnabled` matrix: unset+VERCEL, unset+no VERCEL, `0`, `1`.
- Unit/integration: when disabled, `startCommStackRealtime` does not call client `realtime.connect` (mock).
- Manual: with gate off, sync-inbox returns 200 and imports without realtime logs; status shows `realtimeMode: "disabled"`.

## Out of scope follow-ups

- Always-on realtime worker + optional push into the portal.
- Exponential backoff / single-flight reconnect if force-enabling on long-lived hosts.
- Raising poll frequency if operators want snappier inbound without sockets.
