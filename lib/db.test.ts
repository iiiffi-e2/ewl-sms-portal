import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";

import { isRetryableDbError, isTransientDbError } from "@/lib/db";

function knownError(code: string, message: string) {
  return new Prisma.PrismaClientKnownRequestError(message, {
    code,
    clientVersion: "6.18.0",
  });
}

// Shape captured from production logs: Accelerate wraps its own error codes in
// a P5000 whose message carries the real code as JSON.
const acceleratePayload = (code: string) =>
  `Invalid \`prisma.message.updateMany()\` invocation:\n\n\nThis request could not be understood by the server: {"type":"UnknownJsonError","body":{"code":"${code}","message":"..."}} (The request id was: a406e24bfbf4af78)`;

describe("isTransientDbError", () => {
  it("treats an Accelerate query timeout wrapped in P5000 as transient", () => {
    expect(isTransientDbError(knownError("P5000", acceleratePayload("P6004")))).toBe(true);
  });

  it("treats an Accelerate engine start error wrapped in P5000 as transient", () => {
    expect(isTransientDbError(knownError("P5000", acceleratePayload("P6008")))).toBe(true);
  });

  it("does not treat a P5000 wrapping a non-transient code as transient", () => {
    expect(isTransientDbError(knownError("P5000", acceleratePayload("P6003")))).toBe(false);
  });

  it("does not treat an unrelated P5000 as transient", () => {
    expect(isTransientDbError(knownError("P5000", "something else"))).toBe(false);
  });

  it("still recognises top-level transient codes", () => {
    expect(isTransientDbError(knownError("P1001", "Can't reach database server"))).toBe(true);
    expect(isTransientDbError(knownError("P2002", "Unique constraint failed"))).toBe(false);
  });
});

describe("isRetryableDbError", () => {
  it("does not retry an Accelerate query timeout wrapped in P5000", () => {
    expect(isRetryableDbError(knownError("P5000", acceleratePayload("P6004")))).toBe(false);
  });

  it("retries an Accelerate engine start error wrapped in P5000", () => {
    expect(isRetryableDbError(knownError("P5000", acceleratePayload("P6008")))).toBe(true);
  });
});
