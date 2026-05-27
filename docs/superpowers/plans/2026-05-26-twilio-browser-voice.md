# Twilio Browser Voice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `tel:` Call button with in-browser Twilio Voice SDK calling, logging full call lifecycle to `CallLog`.

**Architecture:** Layered `lib/voice/` server module (token, TwiML, webhook validation) + authenticated API routes + `VoiceCallProvider` React context managing the Twilio Device. Twilio webhooks update `CallLog` status asynchronously.

**Tech Stack:** Next.js 16 App Router, Prisma 6, Twilio Node SDK 5.x, `@twilio/voice-sdk`, Vitest, Zod

**Spec:** `docs/superpowers/specs/2026-05-26-twilio-browser-voice-design.md`

---

## File Map

| File | Responsibility |
|---|---|
| `prisma/schema.prisma` | Call enums, User.phoneNumber, CallLog extensions |
| `lib/voice/token.ts` | Access Token generation for Voice SDK |
| `lib/voice/twiml.ts` | Outbound Dial TwiML builder |
| `lib/voice/webhook.ts` | X-Twilio-Signature validation |
| `lib/voice/status.ts` | Map Twilio CallStatus → Prisma CallStatus |
| `lib/validators.ts` | Zod schemas for call initiate/patch |
| `app/api/voice/token/route.ts` | Authenticated token endpoint |
| `app/api/calls/initiate/route.ts` | Create CallLog before connect |
| `app/api/calls/[id]/route.ts` | PATCH for client-side cancel cleanup |
| `app/api/webhooks/voice/twiml/route.ts` | TwiML Dial handler |
| `app/api/webhooks/voice/status/route.ts` | Call status webhook |
| `components/caretext/VoiceCallProvider.tsx` | Device lifecycle + call state |
| `components/caretext/CallBar.tsx` | In-call UI |
| `components/caretext/ConversationHeader.tsx` | Call button wired to provider |
| `components/caretext/DashboardClient.tsx` | Provider wrapper + CallBar placement |
| `middleware.ts` | Protect `/api/voice/*` (webhooks stay public) |

---

### Task 1: Dependencies, env vars, and test setup

**Files:**
- Modify: `package.json`
- Modify: `.env.example`
- Create: `vitest.config.ts`
- Modify: `README.md` (Notes section)

- [ ] **Step 1: Install packages**

```bash
npm install @twilio/voice-sdk
npm install -D vitest
```

- [ ] **Step 2: Add test script to `package.json`**

Add to `"scripts"`:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 3: Create `vitest.config.ts`**

```typescript
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
```

- [ ] **Step 4: Update `.env.example`**

```
TWILIO_API_KEY_SID="SKxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
TWILIO_API_KEY_SECRET="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
TWILIO_TWIML_APP_SID="APxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
```

- [ ] **Step 5: Verify install**

Run: `npm test`
Expected: "No test files found" (exit 0) or empty pass — confirms vitest runs.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json vitest.config.ts .env.example
git commit -m "chore: add voice SDK and vitest for Twilio browser calling"
```

---

### Task 2: Prisma schema migration

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add enums and fields to schema**

Add after existing enums in `prisma/schema.prisma`:

```prisma
enum CallDirection {
  outbound
  inbound
}

enum CallMode {
  browser
  phone
}

enum CallStatus {
  initiating
  ringing
  in_progress
  completed
  failed
  no_answer
  busy
  canceled
}
```

Add to `User` model:

```prisma
  phoneNumber  String?
```

Replace `CallLog` model fields (keep relations/indexes, add new fields):

```prisma
model CallLog {
  id              String        @id @default(uuid())
  conversationId  String?
  phone           String
  initiatedById   String?
  twilioSid       String?
  direction       CallDirection @default(outbound)
  mode            CallMode      @default(browser)
  status          CallStatus    @default(initiating)
  durationSeconds Int?
  recordingSid    String?
  recordingUrl    String?
  startedAt       DateTime      @default(now())
  endedAt         DateTime?
  outcome         String?
  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt
  conversation    Conversation? @relation(fields: [conversationId], references: [id], onDelete: SetNull)
  initiatedBy     User?         @relation(fields: [initiatedById], references: [id], onDelete: SetNull)

  @@index([conversationId])
  @@index([initiatedById])
  @@index([phone])
  @@index([status])
}
```

- [ ] **Step 2: Run migration**

```bash
npm run prisma:migrate -- --name add_voice_call_fields
```

Expected: Migration created and applied successfully.

- [ ] **Step 3: Commit**

```bash
git add prisma/
git commit -m "feat: extend CallLog schema for Twilio browser voice"
```

---

### Task 3: Voice library — status mapper

**Files:**
- Create: `lib/voice/status.ts`
- Create: `lib/voice/status.test.ts`

- [ ] **Step 1: Write failing tests**

Create `lib/voice/status.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { mapTwilioCallStatus, isTerminalCallStatus } from "@/lib/voice/status";
import { CallStatus } from "@prisma/client";

describe("mapTwilioCallStatus", () => {
  it("maps ringing", () => {
    expect(mapTwilioCallStatus("ringing")).toBe(CallStatus.ringing);
  });

  it("maps in-progress", () => {
    expect(mapTwilioCallStatus("in-progress")).toBe(CallStatus.in_progress);
  });

  it("maps completed", () => {
    expect(mapTwilioCallStatus("completed")).toBe(CallStatus.completed);
  });

  it("maps no-answer", () => {
    expect(mapTwilioCallStatus("no-answer")).toBe(CallStatus.no_answer);
  });

  it("maps busy", () => {
    expect(mapTwilioCallStatus("busy")).toBe(CallStatus.busy);
  });

  it("maps failed", () => {
    expect(mapTwilioCallStatus("failed")).toBe(CallStatus.failed);
  });

  it("maps canceled", () => {
    expect(mapTwilioCallStatus("canceled")).toBe(CallStatus.canceled);
  });

  it("maps unknown to failed", () => {
    expect(mapTwilioCallStatus("unknown-value")).toBe(CallStatus.failed);
  });
});

describe("isTerminalCallStatus", () => {
  it("returns true for completed", () => {
    expect(isTerminalCallStatus(CallStatus.completed)).toBe(true);
  });

  it("returns false for in_progress", () => {
    expect(isTerminalCallStatus(CallStatus.in_progress)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- lib/voice/status.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement `lib/voice/status.ts`**

```typescript
import { CallStatus } from "@prisma/client";

const TWILIO_STATUS_MAP: Record<string, CallStatus> = {
  queued: CallStatus.initiating,
  initiated: CallStatus.initiating,
  ringing: CallStatus.ringing,
  "in-progress": CallStatus.in_progress,
  answered: CallStatus.in_progress,
  completed: CallStatus.completed,
  busy: CallStatus.busy,
  "no-answer": CallStatus.no_answer,
  failed: CallStatus.failed,
  canceled: CallStatus.canceled,
};

export function mapTwilioCallStatus(twilioStatus: string): CallStatus {
  return TWILIO_STATUS_MAP[twilioStatus] ?? CallStatus.failed;
}

const TERMINAL_STATUSES = new Set<CallStatus>([
  CallStatus.completed,
  CallStatus.failed,
  CallStatus.no_answer,
  CallStatus.busy,
  CallStatus.canceled,
]);

export function isTerminalCallStatus(status: CallStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- lib/voice/status.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/voice/status.ts lib/voice/status.test.ts
git commit -m "feat: add Twilio call status mapper"
```

---

### Task 4: Voice library — TwiML builder

**Files:**
- Create: `lib/voice/twiml.ts`
- Create: `lib/voice/twiml.test.ts`

- [ ] **Step 1: Write failing tests**

Create `lib/voice/twiml.test.ts`:

```typescript
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { buildOutboundDialTwiml } from "@/lib/voice/twiml";

describe("buildOutboundDialTwiml", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      TWILIO_PHONE_NUMBER: "+15551234567",
      NEXTAUTH_URL: "https://app.example.com",
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns Dial TwiML with caller ID and status callback", () => {
    const xml = buildOutboundDialTwiml("+15559876543");

    expect(xml).toContain("<Dial");
    expect(xml).toContain("callerId=\"+15551234567\"");
    expect(xml).toContain("+15559876543");
    expect(xml).toContain("https://app.example.com/api/webhooks/voice/status");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- lib/voice/twiml.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement `lib/voice/twiml.ts`**

```typescript
import twilio from "twilio";
import { getTwilioFromNumber } from "@/lib/twilio";

function getVoiceStatusCallbackUrl() {
  const baseUrl = process.env.NEXTAUTH_URL;
  if (!baseUrl) {
    throw new Error("NEXTAUTH_URL is not configured.");
  }
  return `${baseUrl.replace(/\/$/, "")}/api/webhooks/voice/status`;
}

export function buildOutboundDialTwiml(to: string): string {
  const response = new twilio.twiml.VoiceResponse();
  const dial = response.dial({
    callerId: getTwilioFromNumber(),
    answerOnBridge: true,
  });
  dial.number({}, to);

  // Attach status callback on the Dial verb via nested attributes
  // Twilio VoiceResponse sets action on dial for completion events
  const dialWithCallback = response.dial({
    callerId: getTwilioFromNumber(),
    answerOnBridge: true,
    action: getVoiceStatusCallbackUrl(),
    method: "POST",
  });
  dialWithCallback.number({}, to);

  return dialWithCallback.toString();
}
```

**Important:** The above creates two dial verbs — fix during implementation to use a single dial:

```typescript
export function buildOutboundDialTwiml(to: string): string {
  const response = new twilio.twiml.VoiceResponse();
  const dial = response.dial({
    callerId: getTwilioFromNumber(),
    answerOnBridge: true,
    action: getVoiceStatusCallbackUrl(),
    method: "POST",
  });
  dial.number({}, to);
  return response.toString();
}
```

Use the single-dial version above in the actual implementation.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- lib/voice/twiml.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/voice/twiml.ts lib/voice/twiml.test.ts
git commit -m "feat: add outbound Dial TwiML builder"
```

---

### Task 5: Voice library — token generation

**Files:**
- Create: `lib/voice/token.ts`
- Create: `lib/voice/token.test.ts`

- [ ] **Step 1: Write failing tests**

Create `lib/voice/token.test.ts`:

```typescript
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { createVoiceAccessToken } from "@/lib/voice/token";

describe("createVoiceAccessToken", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      TWILIO_ACCOUNT_SID: "ACtest123456789012345678901234567890",
      TWILIO_API_KEY_SID: "SKtest123456789012345678901234567890",
      TWILIO_API_KEY_SECRET: "test_api_key_secret_32chars_min",
      TWILIO_TWIML_APP_SID: "APtest123456789012345678901234567890",
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns a JWT string for the given identity", () => {
    const token = createVoiceAccessToken("user-uuid-123");
    expect(typeof token).toBe("string");
    expect(token.split(".")).toHaveLength(3);
  });

  it("throws when env vars missing", () => {
    delete process.env.TWILIO_API_KEY_SID;
    expect(() => createVoiceAccessToken("user-uuid-123")).toThrow(
      "TWILIO_API_KEY_SID",
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- lib/voice/token.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement `lib/voice/token.ts`**

```typescript
import twilio from "twilio";

const TOKEN_TTL_SECONDS = 3600;

function getVoiceEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not configured.`);
  }
  return value;
}

export function createVoiceAccessToken(identity: string): string {
  const accountSid = getVoiceEnv("TWILIO_ACCOUNT_SID");
  const apiKeySid = getVoiceEnv("TWILIO_API_KEY_SID");
  const apiKeySecret = getVoiceEnv("TWILIO_API_KEY_SECRET");
  const twimlAppSid = getVoiceEnv("TWILIO_TWIML_APP_SID");

  const { AccessToken } = twilio.jwt;
  const { VoiceGrant } = AccessToken;

  const token = new AccessToken(accountSid, apiKeySid, apiKeySecret, {
    identity,
    ttl: TOKEN_TTL_SECONDS,
  });

  const voiceGrant = new VoiceGrant({
    outgoingApplicationSid: twimlAppSid,
    incomingAllow: false,
  });

  token.addGrant(voiceGrant);
  return token.toJwt();
}

export const VOICE_TOKEN_TTL_SECONDS = TOKEN_TTL_SECONDS;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- lib/voice/token.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/voice/token.ts lib/voice/token.test.ts
git commit -m "feat: add Twilio Voice access token generator"
```

---

### Task 6: Voice library — webhook validation

**Files:**
- Create: `lib/voice/webhook.ts`
- Create: `lib/voice/webhook.test.ts`

- [ ] **Step 1: Write failing tests**

Create `lib/voice/webhook.test.ts`:

```typescript
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import twilio from "twilio";
import { validateTwilioWebhookRequest } from "@/lib/voice/webhook";

describe("validateTwilioWebhookRequest", () => {
  const originalEnv = process.env;
  const authToken = "test_auth_token_32_characters_xx";
  const url = "https://app.example.com/api/webhooks/voice/twiml";

  beforeEach(() => {
    process.env = { ...originalEnv, TWILIO_AUTH_TOKEN: authToken };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns true for a valid signature", () => {
    const params = { CallSid: "CA123", To: "+15559876543" };
    const signature = twilio.getExpectedTwilioSignature(authToken, url, params);

    expect(
      validateTwilioWebhookRequest({
        signature,
        url,
        params,
      }),
    ).toBe(true);
  });

  it("returns false for an invalid signature", () => {
    expect(
      validateTwilioWebhookRequest({
        signature: "invalid",
        url,
        params: { CallSid: "CA123" },
      }),
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- lib/voice/webhook.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement `lib/voice/webhook.ts`**

```typescript
import twilio from "twilio";

type ValidateWebhookParams = {
  signature: string | null;
  url: string;
  params: Record<string, string>;
};

export function validateTwilioWebhookRequest({
  signature,
  url,
  params,
}: ValidateWebhookParams): boolean {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken || !signature) {
    return false;
  }

  return twilio.validateRequest(authToken, signature, url, params);
}

export async function parseTwilioWebhookParams(
  request: Request,
): Promise<Record<string, string>> {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("application/x-www-form-urlencoded")) {
    const formData = await request.formData();
    return Object.fromEntries(
      [...formData.entries()].map(([key, value]) => [key, value.toString()]),
    );
  }

  const text = await request.text();
  if (!text) {
    return {};
  }

  return Object.fromEntries(new URLSearchParams(text));
}

export function getWebhookRequestUrl(request: Request): string {
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const forwardedHost = request.headers.get("x-forwarded-host");
  const host = forwardedHost ?? request.headers.get("host");
  const proto = forwardedProto ?? "https";

  if (host) {
    return `${proto}://${host}${new URL(request.url).pathname}`;
  }

  return request.url;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- lib/voice/webhook.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/voice/webhook.ts lib/voice/webhook.test.ts
git commit -m "feat: add Twilio webhook signature validation"
```

---

### Task 7: Validators and call API routes

**Files:**
- Modify: `lib/validators.ts`
- Create: `app/api/voice/token/route.ts`
- Create: `app/api/calls/initiate/route.ts`
- Create: `app/api/calls/[id]/route.ts`
- Modify: `middleware.ts`

- [ ] **Step 1: Add validators to `lib/validators.ts`**

```typescript
export const initiateCallSchema = z.object({
  conversationId: z.string().uuid(),
  phone: z.string().min(8).refine((value) => isValidPhoneNumber(value), "Invalid phone number."),
});

export const updateCallLogSchema = z.object({
  status: z.enum(["canceled", "failed"]),
});
```

- [ ] **Step 2: Create `app/api/voice/token/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-auth";
import { createVoiceAccessToken, VOICE_TOKEN_TTL_SECONDS } from "@/lib/voice/token";

export async function GET() {
  const authResult = await requireSession();
  if ("error" in authResult) {
    return authResult.error;
  }

  try {
    const token = createVoiceAccessToken(authResult.session.user.id);
    return NextResponse.json({ token, expiresIn: VOICE_TOKEN_TTL_SECONDS });
  } catch (error) {
    console.error("Failed to create voice token:", error);
    return NextResponse.json({ error: "Voice calling is not configured." }, { status: 503 });
  }
}
```

- [ ] **Step 3: Create `app/api/calls/initiate/route.ts`**

```typescript
import { CallDirection, CallMode, CallStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { normalizePhoneNumber } from "@/lib/phone";
import { initiateCallSchema } from "@/lib/validators";

export async function POST(request: Request) {
  const authResult = await requireSession();
  if ("error" in authResult) {
    return authResult.error;
  }

  const payload = await request.json();
  const parsed = initiateCallSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const normalizedPhone = normalizePhoneNumber(parsed.data.phone);

  const conversation = await prisma.conversation.findFirst({
    where: {
      id: parsed.data.conversationId,
      archivedAt: null,
      contact: { phone: normalizedPhone },
    },
    select: { id: true },
  });

  if (!conversation) {
    return NextResponse.json({ error: "Conversation not found for phone." }, { status: 404 });
  }

  const activeCall = await prisma.callLog.findFirst({
    where: {
      initiatedById: authResult.session.user.id,
      status: { in: [CallStatus.initiating, CallStatus.ringing, CallStatus.in_progress] },
    },
    select: { id: true },
  });

  if (activeCall) {
    return NextResponse.json({ error: "You already have an active call." }, { status: 409 });
  }

  const callLog = await prisma.callLog.create({
    data: {
      conversationId: conversation.id,
      phone: normalizedPhone,
      initiatedById: authResult.session.user.id,
      direction: CallDirection.outbound,
      mode: CallMode.browser,
      status: CallStatus.initiating,
      startedAt: new Date(),
    },
  });

  return NextResponse.json({ callLogId: callLog.id }, { status: 201 });
}
```

- [ ] **Step 4: Create `app/api/calls/[id]/route.ts`**

```typescript
import { CallStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { updateCallLogSchema } from "@/lib/validators";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireSession();
  if ("error" in authResult) {
    return authResult.error;
  }

  const { id } = await params;
  const payload = await request.json();
  const parsed = updateCallLogSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const callLog = await prisma.callLog.findUnique({
    where: { id },
    select: { id: true, initiatedById: true, status: true, endedAt: true },
  });

  if (!callLog || callLog.initiatedById !== authResult.session.user.id) {
    return NextResponse.json({ error: "Call log not found." }, { status: 404 });
  }

  if (callLog.endedAt) {
    return NextResponse.json({ callLog });
  }

  const updated = await prisma.callLog.update({
    where: { id },
    data: {
      status: parsed.data.status === "canceled" ? CallStatus.canceled : CallStatus.failed,
      endedAt: new Date(),
      outcome: parsed.data.status,
    },
  });

  return NextResponse.json({ callLog: updated });
}
```

- [ ] **Step 5: Add `/api/voice/:path*` to middleware matcher**

In `middleware.ts`, add to `config.matcher`:

```typescript
"/api/voice/:path*",
```

- [ ] **Step 6: Verify build**

Run: `npm run build`
Expected: Build succeeds (Prisma client must be generated with new enums).

- [ ] **Step 7: Commit**

```bash
git add lib/validators.ts app/api/voice/ app/api/calls/ middleware.ts
git commit -m "feat: add voice token and call initiate API routes"
```

---

### Task 8: Voice webhooks

**Files:**
- Create: `app/api/webhooks/voice/twiml/route.ts`
- Create: `app/api/webhooks/voice/status/route.ts`

- [ ] **Step 1: Create TwiML webhook `app/api/webhooks/voice/twiml/route.ts`**

```typescript
import { CallStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizePhoneNumber } from "@/lib/phone";
import { buildOutboundDialTwiml } from "@/lib/voice/twiml";
import {
  getWebhookRequestUrl,
  parseTwilioWebhookParams,
  validateTwilioWebhookRequest,
} from "@/lib/voice/webhook";

function extractClientIdentity(from: string | undefined): string | null {
  if (!from?.startsWith("client:")) {
    return null;
  }
  return from.slice("client:".length);
}

export async function POST(request: Request) {
  const params = await parseTwilioWebhookParams(request);
  const signature = request.headers.get("x-twilio-signature");
  const url = getWebhookRequestUrl(request);

  if (!validateTwilioWebhookRequest({ signature, url, params })) {
    return NextResponse.json({ error: "Invalid signature." }, { status: 403 });
  }

  const identity = extractClientIdentity(params.From);
  const callLogId = params.callLogId;
  const to = params.To;

  if (!identity || !callLogId || !to) {
    return new NextResponse("<Response><Say>Invalid call request.</Say></Response>", {
      status: 400,
      headers: { "Content-Type": "text/xml" },
    });
  }

  const callLog = await prisma.callLog.findUnique({
    where: { id: callLogId },
    select: { id: true, phone: true, initiatedById: true, status: true },
  });

  if (
    !callLog ||
    callLog.initiatedById !== identity ||
    callLog.status !== CallStatus.initiating ||
    callLog.phone !== normalizePhoneNumber(to)
  ) {
    return new NextResponse("<Response><Say>Unauthorized call request.</Say></Response>", {
      status: 403,
      headers: { "Content-Type": "text/xml" },
    });
  }

  const twiml = buildOutboundDialTwiml(callLog.phone);
  return new NextResponse(twiml, {
    status: 200,
    headers: { "Content-Type": "text/xml" },
  });
}
```

- [ ] **Step 2: Create status webhook `app/api/webhooks/voice/status/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isTerminalCallStatus, mapTwilioCallStatus } from "@/lib/voice/status";
import {
  getWebhookRequestUrl,
  parseTwilioWebhookParams,
  validateTwilioWebhookRequest,
} from "@/lib/voice/webhook";

export async function POST(request: Request) {
  const params = await parseTwilioWebhookParams(request);
  const signature = request.headers.get("x-twilio-signature");
  const url = getWebhookRequestUrl(request);

  if (!validateTwilioWebhookRequest({ signature, url, params })) {
    return NextResponse.json({ error: "Invalid signature." }, { status: 403 });
  }

  const callSid = params.CallSid;
  const callStatus = params.CallStatus;
  const callLogId = params.callLogId;
  const duration = params.CallDuration ? Number.parseInt(params.CallDuration, 10) : undefined;

  if (!callSid || !callStatus) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const mappedStatus = mapTwilioCallStatus(callStatus);

  const callLog = callLogId
    ? await prisma.callLog.findUnique({ where: { id: callLogId }, select: { id: true, endedAt: true } })
    : await prisma.callLog.findFirst({
        where: { twilioSid: callSid },
        select: { id: true, endedAt: true },
      });

  if (!callLog) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  await prisma.callLog.update({
    where: { id: callLog.id },
    data: {
      twilioSid: callSid,
      status: mappedStatus,
      outcome: callStatus,
      ...(isTerminalCallStatus(mappedStatus)
        ? {
            endedAt: callLog.endedAt ?? new Date(),
            durationSeconds: Number.isFinite(duration) ? duration : undefined,
          }
        : {}),
    },
  });

  return NextResponse.json({ ok: true });
}
```

**Note:** Twilio Dial `action` callback sends `DialCallStatus` not `CallStatus` — during implementation, handle both `CallStatus` (from parent call leg) and pass `callLogId` through Device.connect params so status webhook can correlate. Also register a `statusCallback` on the `<Number>` noun:

Update `buildOutboundDialTwiml` to accept optional `statusCallback` and set on the number:

```typescript
export function buildOutboundDialTwiml(to: string, statusCallback?: string): string {
  const response = new twilio.twiml.VoiceResponse();
  const dial = response.dial({
    callerId: getTwilioFromNumber(),
    answerOnBridge: true,
  });
  dial.number(
    {
      statusCallback: statusCallback ?? getVoiceStatusCallbackUrl(),
      statusCallbackMethod: "POST",
      statusCallbackEvent: ["initiated", "ringing", "answered", "completed"],
    },
    to,
  );
  return response.toString();
}
```

Pass `callLogId` as a custom param through status callbacks by appending to callback URL query string in TwiML handler:

```typescript
const statusUrl = `${getVoiceStatusCallbackUrl()}?callLogId=${encodeURIComponent(callLogId)}`;
const twiml = buildOutboundDialTwiml(callLog.phone, statusUrl);
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add app/api/webhooks/voice/ lib/voice/twiml.ts
git commit -m "feat: add Twilio voice TwiML and status webhooks"
```

---

### Task 9: Conversation API — include callLogs

**Files:**
- Modify: `app/api/conversations/[id]/route.ts`

- [ ] **Step 1: Add callLogs include to GET handler**

In the `findUnique` include block, add:

```typescript
      callLogs: {
        orderBy: { startedAt: "desc" },
        include: {
          initiatedBy: { select: { id: true, name: true } },
        },
      },
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add app/api/conversations/[id]/route.ts
git commit -m "feat: include call logs in conversation detail API"
```

---

### Task 10: VoiceCallProvider

**Files:**
- Create: `components/caretext/VoiceCallProvider.tsx`

- [ ] **Step 1: Create provider**

Create `components/caretext/VoiceCallProvider.tsx`:

```typescript
"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Device, Call } from "@twilio/voice-sdk";

type CallPhase = "idle" | "connecting" | "ringing" | "connected" | "disconnecting" | "error";

type ActiveCallInfo = {
  callLogId: string;
  conversationId: string;
  phone: string;
  contactName?: string | null;
};

type VoiceCallContextValue = {
  callPhase: CallPhase;
  isCallActive: boolean;
  isMuted: boolean;
  elapsedSeconds: number;
  activeCall: ActiveCallInfo | null;
  errorMessage: string | null;
  startCall: (input: {
    conversationId: string;
    phone: string;
    contactName?: string | null;
  }) => Promise<void>;
  endCall: () => void;
  toggleMute: () => void;
};

const VoiceCallContext = createContext<VoiceCallContextValue | null>(null);

export function useVoiceCall() {
  const context = useContext(VoiceCallContext);
  if (!context) {
    throw new Error("useVoiceCall must be used within VoiceCallProvider");
  }
  return context;
}

export function VoiceCallProvider({ children }: { children: ReactNode }) {
  const deviceRef = useRef<Device | null>(null);
  const activeCallRef = useRef<Call | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const connectedAtRef = useRef<number | null>(null);

  const [callPhase, setCallPhase] = useState<CallPhase>("idle");
  const [isMuted, setIsMuted] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [activeCall, setActiveCall] = useState<ActiveCallInfo | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const resetCallState = useCallback(() => {
    clearTimer();
    connectedAtRef.current = null;
    activeCallRef.current = null;
    setIsMuted(false);
    setElapsedSeconds(0);
    setActiveCall(null);
    setCallPhase("idle");
  }, [clearTimer]);

  const cancelCallLog = useCallback(async (callLogId: string) => {
    await fetch(`/api/calls/${callLogId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "canceled" }),
    });
  }, []);

  const setupDevice = useCallback(async () => {
    const response = await fetch("/api/voice/token");
    if (!response.ok) {
      throw new Error("Voice calling is not available.");
    }

    const data = await response.json();
    const device = new Device(data.token, {
      codecPreferences: [Device.Codec.Opus, Device.Codec.PCMU],
    });

    device.on("error", (error) => {
      console.error("Twilio Device error:", error);
      setErrorMessage(error.message);
      setCallPhase("error");
    });

    device.on("tokenWillExpire", async () => {
      const tokenResponse = await fetch("/api/voice/token");
      if (tokenResponse.ok) {
        const tokenData = await tokenResponse.json();
        device.updateToken(tokenData.token);
      }
    });

    await device.register();
    deviceRef.current = device;
  }, []);

  useEffect(() => {
    let cancelled = false;

    setupDevice().catch((error) => {
      if (!cancelled) {
        console.error("Failed to initialize voice device:", error);
        setErrorMessage("Voice calling is not available.");
      }
    });

    return () => {
      cancelled = true;
      clearTimer();
      deviceRef.current?.destroy();
      deviceRef.current = null;
    };
  }, [clearTimer, setupDevice]);

  const bindCallEvents = useCallback(
    (call: Call, callLogId: string) => {
      call.on("ringing", () => setCallPhase("ringing"));
      call.on("accept", () => {
        setCallPhase("connected");
        connectedAtRef.current = Date.now();
        clearTimer();
        timerRef.current = setInterval(() => {
          if (connectedAtRef.current) {
            setElapsedSeconds(Math.floor((Date.now() - connectedAtRef.current) / 1000));
          }
        }, 1000);
      });
      call.on("disconnect", () => {
        setCallPhase("disconnecting");
        resetCallState();
      });
      call.on("cancel", async () => {
        await cancelCallLog(callLogId);
        resetCallState();
      });
      call.on("error", async (error) => {
        console.error("Twilio Call error:", error);
        setErrorMessage(error.message);
        await cancelCallLog(callLogId);
        setCallPhase("error");
        resetCallState();
      });
    },
    [cancelCallLog, clearTimer, resetCallState],
  );

  const startCall = useCallback(
    async (input: { conversationId: string; phone: string; contactName?: string | null }) => {
      if (!deviceRef.current || callPhase !== "idle") {
        return;
      }

      setErrorMessage(null);
      setCallPhase("connecting");

      let callLogId: string | null = null;

      try {
        const initiateResponse = await fetch("/api/calls/initiate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            conversationId: input.conversationId,
            phone: input.phone,
          }),
        });

        if (!initiateResponse.ok) {
          const errorData = await initiateResponse.json();
          throw new Error(errorData.error ?? "Failed to start call.");
        }

        const initiateData = await initiateResponse.json();
        callLogId = initiateData.callLogId;

        setActiveCall({
          callLogId,
          conversationId: input.conversationId,
          phone: input.phone,
          contactName: input.contactName,
        });

        const call = await deviceRef.current.connect({
          params: {
            To: input.phone,
            callLogId,
            conversationId: input.conversationId,
          },
        });

        activeCallRef.current = call;
        bindCallEvents(call, callLogId);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to start call.";
        setErrorMessage(message);
        setCallPhase("error");
        if (callLogId) {
          await cancelCallLog(callLogId);
        }
        resetCallState();
      }
    },
    [bindCallEvents, callPhase, cancelCallLog, resetCallState],
  );

  const endCall = useCallback(() => {
    setCallPhase("disconnecting");
    deviceRef.current?.disconnectAll();
  }, []);

  const toggleMute = useCallback(() => {
    const call = activeCallRef.current;
    if (!call) return;
    const nextMuted = !call.isMuted();
    call.mute(nextMuted);
    setIsMuted(nextMuted);
  }, []);

  const value = useMemo(
    () => ({
      callPhase,
      isCallActive: callPhase !== "idle" && callPhase !== "error",
      isMuted,
      elapsedSeconds,
      activeCall,
      errorMessage,
      startCall,
      endCall,
      toggleMute,
    }),
    [activeCall, callPhase, elapsedSeconds, endCall, errorMessage, isMuted, startCall, toggleMute],
  );

  return <VoiceCallContext.Provider value={value}>{children}</VoiceCallContext.Provider>;
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add components/caretext/VoiceCallProvider.tsx
git commit -m "feat: add VoiceCallProvider for Twilio browser calling"
```

---

### Task 11: CallBar component

**Files:**
- Create: `components/caretext/CallBar.tsx`

- [ ] **Step 1: Create CallBar**

```typescript
"use client";

import { useVoiceCall } from "@/components/caretext/VoiceCallProvider";

function formatElapsed(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function statusLabel(phase: string): string {
  switch (phase) {
    case "connecting":
      return "Connecting";
    case "ringing":
      return "Ringing";
    case "connected":
      return "Connected";
    case "disconnecting":
      return "Ending call";
    default:
      return "Call";
  }
}

export function CallBar() {
  const { callPhase, isCallActive, isMuted, elapsedSeconds, activeCall, endCall, toggleMute } =
    useVoiceCall();

  if (!isCallActive || !activeCall) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-emerald-900">
          {activeCall.contactName || activeCall.phone}
        </p>
        <p className="text-xs text-emerald-700">
          {statusLabel(callPhase)}
          {callPhase === "connected" ? ` · ${formatElapsed(elapsedSeconds)}` : null}
        </p>
      </div>
      <button
        type="button"
        onClick={toggleMute}
        disabled={callPhase !== "connected"}
        className="rounded-lg border border-emerald-300 bg-white px-3 py-2 text-sm font-medium text-emerald-800 disabled:opacity-50"
      >
        {isMuted ? "Unmute" : "Mute"}
      </button>
      <button
        type="button"
        onClick={endCall}
        className="rounded-lg bg-rose-600 px-3 py-2 text-sm font-semibold text-white"
      >
        End Call
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add components/caretext/CallBar.tsx
git commit -m "feat: add in-call CallBar UI"
```

---

### Task 12: Wire UI — ConversationHeader and DashboardClient

**Files:**
- Modify: `components/caretext/ConversationHeader.tsx`
- Modify: `components/caretext/DashboardClient.tsx`
- Delete or keep unused: `app/api/calls/log/route.ts`

- [ ] **Step 1: Update ConversationHeader**

Replace the `<a href="tel:...">` block with:

```typescript
import { useVoiceCall } from "@/components/caretext/VoiceCallProvider";

// Inside component:
const { startCall, isCallActive, callPhase, errorMessage } = useVoiceCall();
const isStartingCall = callPhase === "connecting";

// Replace Call link with:
<button
  type="button"
  disabled={!conversationId || isCallActive || isStartingCall}
  className="ml-auto rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50 sm:ml-0"
  onClick={async () => {
    if (!conversationId || !phone) return;
    await startCall({ conversationId, phone, contactName });
  }}
>
  {isStartingCall ? "Calling..." : "Call"}
</button>
{errorMessage ? <p className="w-full text-xs text-rose-600">{errorMessage}</p> : null}
```

Remove the old `fetch("/api/calls/log")` onClick handler.

- [ ] **Step 2: Wrap DashboardClient with provider and add CallBar**

At top of `DashboardClient` return, wrap entire JSX in `<VoiceCallProvider>`.

After each `<ConversationHeader ... />` (both mobile and desktop layouts), add:

```typescript
<CallBar />
```

Import:

```typescript
import { VoiceCallProvider } from "@/components/caretext/VoiceCallProvider";
import { CallBar } from "@/components/caretext/CallBar";
```

Structure:

```typescript
return (
  <VoiceCallProvider>
    {/* existing dashboard JSX */}
  </VoiceCallProvider>
);
```

- [ ] **Step 3: Remove deprecated `app/api/calls/log/route.ts`**

Delete the file since nothing should reference it after header update.

- [ ] **Step 4: Verify build and lint**

Run: `npm run lint && npm run build`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add components/caretext/ConversationHeader.tsx components/caretext/DashboardClient.tsx
git rm app/api/calls/log/route.ts
git commit -m "feat: wire browser call button and CallBar into dashboard"
```

---

### Task 13: Documentation and manual verification

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update README Notes section**

Replace the MVP tel: note with:

```markdown
- Twilio Voice browser calling is enabled via the Call button in conversation threads.
- Requires Twilio API Key, TwiML App, and Voice SDK setup (see Twilio Voice Setup below).
- Call activity is logged to `CallLog`; recording and inbound voice are planned for future releases.
```

Add **Twilio Voice Setup** section:

```markdown
## Twilio Voice Setup

1. In Twilio Console, create an API Key (Account → API Keys).
2. Create a TwiML App with Voice Request URL:
   - `{NEXTAUTH_URL}/api/webhooks/voice/twiml`
3. Add to `.env`:
   - `TWILIO_API_KEY_SID`
   - `TWILIO_API_KEY_SECRET`
   - `TWILIO_TWIML_APP_SID`
4. For local development, expose your app via ngrok and set `NEXTAUTH_URL` to the ngrok URL.
5. Ensure your Twilio phone number has Voice capability enabled.
```

- [ ] **Step 2: Run all tests**

Run: `npm test`
Expected: All lib/voice tests PASS

- [ ] **Step 3: Manual smoke test** (requires Twilio credentials + ngrok)

Follow checklist from design spec:
- Login as nurse → open thread → click Call
- Verify CallBar states and End Call
- Verify `CallLog` row in database

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: add Twilio Voice setup instructions"
```

---

## Twilio Console Checklist (manual, not code)

- [ ] API Key created
- [ ] TwiML App created with Voice URL pointing to `/api/webhooks/voice/twiml`
- [ ] Env vars set in `.env`
- [ ] `NEXTAUTH_URL` matches publicly reachable URL (ngrok for local dev)
- [ ] Twilio phone number has Voice enabled

---

## Spec Coverage Check

| Spec requirement | Task |
|---|---|
| Browser softphone | Task 10, 12 |
| CallLog lifecycle | Task 2, 7, 8 |
| Standard call bar | Task 11, 12 |
| Activity log (no recording UI) | Task 2, 9 |
| Outbound only | Task 8 (no inbound handler) |
| Future: click-to-call | Task 2 (User.phoneNumber, CallMode.phone) |
| Future: inbound | Task 5 (incomingAllow: false, direction enum) |
| Future: recording | Task 2 (recordingSid/Url fields) |
| Webhook signature validation | Task 6, 8 |
| Error handling | Task 7, 10, 12 |
| Env vars + README | Task 1, 13 |
