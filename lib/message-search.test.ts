import { describe, expect, it } from "vitest";
import {
  MIN_MESSAGE_SEARCH_LENGTH,
  shouldSearchMessageBodies,
  buildSnippetSegments,
} from "@/lib/message-search";

describe("shouldSearchMessageBodies", () => {
  it("is false for empty, null, or short queries", () => {
    expect(shouldSearchMessageBodies(null)).toBe(false);
    expect(shouldSearchMessageBodies(undefined)).toBe(false);
    expect(shouldSearchMessageBodies("")).toBe(false);
    expect(shouldSearchMessageBodies("ab")).toBe(false);
    expect(shouldSearchMessageBodies("  a ")).toBe(false);
  });

  it("is true once the trimmed query reaches the minimum length", () => {
    expect(MIN_MESSAGE_SEARCH_LENGTH).toBe(3);
    expect(shouldSearchMessageBodies("abc")).toBe(true);
    expect(shouldSearchMessageBodies("  balance  ")).toBe(true);
  });
});

describe("buildSnippetSegments", () => {
  it("centers the snippet on the first case-insensitive match and marks it", () => {
    const body =
      "Hello there, you currently owe a balance on your account from last month.";
    const segments = buildSnippetSegments(body, "balance", 10);
    const matched = segments.filter((s) => s.match);
    expect(matched).toHaveLength(1);
    expect(matched[0].text).toBe("balance");
    // Reassembling the segments reproduces a substring of the original body
    // (plus ellipses) and contains the matched term.
    const joined = segments.map((s) => s.text).join("");
    expect(joined).toContain("balance");
    expect(joined.startsWith("…")).toBe(true);
    expect(joined.endsWith("…")).toBe(true);
  });

  it("matches case-insensitively but preserves original casing in output", () => {
    const segments = buildSnippetSegments("Please CALL back today", "call", 5);
    const matched = segments.find((s) => s.match);
    expect(matched?.text).toBe("CALL");
  });

  it("omits leading ellipsis when the match is near the start", () => {
    const segments = buildSnippetSegments("Balance is due", "balance", 10);
    expect(segments[0].match).toBe(true);
    expect(segments[0].text).toBe("Balance");
  });

  it("returns a single non-match segment when there is no match", () => {
    const segments = buildSnippetSegments("no relevant text here", "xyz", 10);
    expect(segments).toEqual([{ text: "no relevant text here", match: false }]);
  });

  it("truncates a long non-matching body with a trailing ellipsis", () => {
    const body = "a".repeat(100);
    const segments = buildSnippetSegments(body, "xyz", 10);
    expect(segments).toHaveLength(1);
    expect(segments[0].match).toBe(false);
    expect(segments[0].text.endsWith("…")).toBe(true);
    expect(segments[0].text.length).toBeLessThan(body.length);
  });

  it("does not truncate a non-matching body at the maxLength+1 boundary", () => {
    // contextRadius 10 -> maxLength 20; slicing + "…" would yield 21 chars, so a
    // 21-char body must be returned unchanged rather than swapping its last char.
    const body = "a".repeat(21);
    const segments = buildSnippetSegments(body, "xyz", 10);
    expect(segments).toEqual([{ text: body, match: false }]);
  });

  it("truncates a non-matching body one char past the boundary", () => {
    const body = "a".repeat(22);
    const segments = buildSnippetSegments(body, "xyz", 10);
    expect(segments).toHaveLength(1);
    expect(segments[0].match).toBe(false);
    expect(segments[0].text).toBe(`${"a".repeat(20)}…`);
    expect(segments[0].text.length).toBeLessThan(body.length);
  });
});
