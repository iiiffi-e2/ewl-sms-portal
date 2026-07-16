import { NextResponse } from "next/server";
import { isTransientDbError } from "@/lib/db";

/**
 * Turn a database error into a JSON response. This guarantees the client always
 * receives a valid JSON body (never a bare 500 with an empty body, which makes
 * `response.json()` throw "Unexpected end of JSON input" on the frontend).
 *
 * Transient infrastructure blips return 503 + Retry-After so callers and
 * monitoring treat them as retryable rather than a hard failure.
 */
export function dbErrorResponse(error: unknown): NextResponse {
  if (isTransientDbError(error)) {
    console.error("Transient database error:", error);
    return NextResponse.json(
      { error: "The database is temporarily unavailable. Please try again in a moment." },
      { status: 503, headers: { "Retry-After": "5" } },
    );
  }

  console.error("Unexpected database error:", error);
  return NextResponse.json({ error: "Internal server error." }, { status: 500 });
}
