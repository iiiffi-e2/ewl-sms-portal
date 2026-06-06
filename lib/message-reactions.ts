export type TapbackKind =
  | "liked"
  | "loved"
  | "disliked"
  | "laughed"
  | "emphasized"
  | "questioned";

export type ParsedTapback = {
  kind: TapbackKind;
  emoji: string;
  quotedText: string;
};

export type MessageReaction = {
  emoji: string;
  kind: TapbackKind;
};

type ReactionMessage = {
  id: string;
  body: string;
  createdAt: string;
};

const TAPBACK_PATTERN =
  /^(Liked|Loved|Disliked|Laughed at|Emphasized|Questioned)\s+(.+)$/i;

const SURROUNDING_QUOTES_PATTERN = /^["'\u201C\u201D\u2018\u2019]+|["'\u201C\u201D\u2018\u2019]+$/g;

function stripSurroundingQuotes(text: string): string {
  return text.replace(SURROUNDING_QUOTES_PATTERN, "").trim();
}

const TAPBACK_EMOJI: Record<TapbackKind, string> = {
  liked: "👍",
  loved: "❤️",
  disliked: "👎",
  laughed: "😂",
  emphasized: "‼️",
  questioned: "❓",
};

function normalizeTapbackKind(label: string): TapbackKind {
  switch (label.toLowerCase()) {
    case "liked":
      return "liked";
    case "loved":
      return "loved";
    case "disliked":
      return "disliked";
    case "laughed at":
      return "laughed";
    case "emphasized":
      return "emphasized";
    case "questioned":
      return "questioned";
    default:
      return "liked";
  }
}

export function parseTapbackReaction(body: string): ParsedTapback | null {
  const trimmed = body.trim();
  const match = trimmed.match(TAPBACK_PATTERN);
  if (!match) {
    return null;
  }

  const kind = normalizeTapbackKind(match[1]);
  const quotedText = stripSurroundingQuotes(match[2]);

  if (!quotedText || quotedText === match[2].trim()) {
    return null;
  }

  return {
    kind,
    emoji: TAPBACK_EMOJI[kind],
    quotedText,
  };
}

function bodiesMatch(messageBody: string, quotedText: string): boolean {
  if (messageBody === quotedText) {
    return true;
  }

  if (messageBody.startsWith(quotedText)) {
    return true;
  }

  if (quotedText.startsWith(messageBody)) {
    return true;
  }

  return false;
}

export function findReactionTarget<T extends ReactionMessage>(
  quotedText: string,
  messages: T[],
  reactionAt: string,
): T | null {
  const reactionTime = new Date(reactionAt).getTime();
  const candidates = messages.filter(
    (message) => new Date(message.createdAt).getTime() < reactionTime,
  );

  for (let index = candidates.length - 1; index >= 0; index -= 1) {
    if (bodiesMatch(candidates[index].body, quotedText)) {
      return candidates[index];
    }
  }

  return null;
}

export function attachReactionsToMessages<T extends ReactionMessage>(
  messages: T[],
): Array<T & { reactions: MessageReaction[] }> {
  const reactionsByMessageId = new Map<string, MessageReaction[]>();
  const hiddenMessageIds = new Set<string>();

  for (const message of messages) {
    const tapback = parseTapbackReaction(message.body);
    if (!tapback) {
      continue;
    }

    const target = findReactionTarget(tapback.quotedText, messages, message.createdAt);
    if (!target) {
      // Keep the tapback in the thread as normal reply text when we cannot find the original.
      continue;
    }

    hiddenMessageIds.add(message.id);
    const existing = reactionsByMessageId.get(target.id) ?? [];
    existing.push({ emoji: tapback.emoji, kind: tapback.kind });
    reactionsByMessageId.set(target.id, existing);
  }

  return messages
    .filter((message) => !hiddenMessageIds.has(message.id))
    .map((message) => ({
      ...message,
      reactions: reactionsByMessageId.get(message.id) ?? [],
    }));
}
