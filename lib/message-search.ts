export const MIN_MESSAGE_SEARCH_LENGTH = 3;

export function shouldSearchMessageBodies(query: string | null | undefined): boolean {
  return typeof query === "string" && query.trim().length >= MIN_MESSAGE_SEARCH_LENGTH;
}

export type SnippetSegment = { text: string; match: boolean };

export function buildSnippetSegments(
  body: string,
  query: string,
  contextRadius = 30,
): SnippetSegment[] {
  const trimmedQuery = query.trim();
  const matchIndex = trimmedQuery
    ? body.toLowerCase().indexOf(trimmedQuery.toLowerCase())
    : -1;

  if (matchIndex === -1) {
    const maxLength = contextRadius * 2;
    // Only truncate when appending an ellipsis actually shortens the body;
    // slicing to maxLength and adding "…" yields maxLength + 1 chars, so a
    // body of length maxLength + 1 would not benefit from truncation.
    const text =
      body.length > maxLength + 1 ? `${body.slice(0, maxLength)}…` : body;
    return [{ text, match: false }];
  }

  const matchEnd = matchIndex + trimmedQuery.length;
  const start = Math.max(0, matchIndex - contextRadius);
  const end = Math.min(body.length, matchEnd + contextRadius);

  const before = (start > 0 ? "…" : "") + body.slice(start, matchIndex);
  const matchText = body.slice(matchIndex, matchEnd);
  const after = body.slice(matchEnd, end) + (end < body.length ? "…" : "");

  const segments: SnippetSegment[] = [];
  if (before) segments.push({ text: before, match: false });
  segments.push({ text: matchText, match: true });
  if (after) segments.push({ text: after, match: false });
  return segments;
}
