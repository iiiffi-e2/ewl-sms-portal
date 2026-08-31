export type IncomingInviteParams = {
  customParameters?: Map<string, string> | Record<string, string>;
  parameters?: Map<string, string> | Record<string, string>;
};

export type IncomingInviteInfo = {
  callLogId?: string;
  conversationId?: string;
  phone?: string;
  contactName: string | null;
};

function readParam(
  source: Map<string, string> | Record<string, string> | undefined,
  key: string,
): string | undefined {
  if (!source) {
    return undefined;
  }
  const value = source instanceof Map ? source.get(key) : source[key];
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function firstParam(input: IncomingInviteParams, key: string): string | undefined {
  return readParam(input.customParameters, key) ?? readParam(input.parameters, key);
}

function callerPhone(input: IncomingInviteParams): string | undefined {
  const phone = firstParam(input, "phone");
  if (phone) {
    return phone;
  }

  const from = firstParam(input, "From") ?? firstParam(input, "from");
  if (!from || from.startsWith("client:")) {
    return undefined;
  }
  return from;
}

export function parseIncomingInvite(input: IncomingInviteParams): IncomingInviteInfo {
  return {
    callLogId: firstParam(input, "callLogId"),
    conversationId: firstParam(input, "conversationId"),
    phone: callerPhone(input),
    contactName: firstParam(input, "contactName") ?? null,
  };
}

export type CompletedIncomingInvite = {
  callLogId: string;
  conversationId: string | null;
  phone: string;
  contactName: string | null;
};

export function completeIncomingInvite(
  parsed: IncomingInviteInfo,
  ringing?: {
    callLogId?: string;
    conversationId?: string | null;
    phone?: string;
    contactName?: string | null;
  } | null,
): CompletedIncomingInvite | null {
  const callLogId = parsed.callLogId ?? ringing?.callLogId;
  const phone = parsed.phone ?? ringing?.phone;
  if (!callLogId || !phone) {
    return null;
  }

  return {
    callLogId,
    conversationId: parsed.conversationId ?? ringing?.conversationId ?? null,
    phone,
    contactName: parsed.contactName ?? ringing?.contactName ?? null,
  };
}

