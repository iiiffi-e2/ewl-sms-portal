import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

// How long a password reset link stays valid after it is issued.
export const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Generate a URL-safe reset token plus the SHA-256 hash we persist. The raw
 * token is emailed to the user and never stored; only its hash lives in the DB,
 * so a database leak can't be replayed to reset passwords.
 */
export function generateResetToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashResetToken(token) };
}

export function hashResetToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Constant-time comparison of two hex token hashes. */
export function tokenHashesMatch(a: string, b: string): boolean {
  const bufferA = Buffer.from(a, "hex");
  const bufferB = Buffer.from(b, "hex");
  if (bufferA.length !== bufferB.length) {
    return false;
  }
  return timingSafeEqual(bufferA, bufferB);
}

/**
 * Generate a readable temporary password for admin-issued resets. Uses a
 * base64url slice (no ambiguous separators) so it survives copy/paste and meets
 * the 8-char minimum.
 */
export function generateTemporaryPassword(): string {
  return randomBytes(12).toString("base64url");
}
