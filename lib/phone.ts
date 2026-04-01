const E164_REGEX = /^\+[1-9]\d{7,14}$/;

export function normalizePhoneNumber(rawValue: string): string {
  const digits = rawValue.replace(/[^\d+]/g, "");

  if (digits.startsWith("+")) {
    if (!E164_REGEX.test(digits)) {
      throw new Error("Invalid phone number format.");
    }

    return digits;
  }

  const onlyDigits = digits.replace(/\D/g, "");

  if (onlyDigits.length === 10) {
    return `+1${onlyDigits}`;
  }

  if (onlyDigits.length === 11 && onlyDigits.startsWith("1")) {
    return `+${onlyDigits}`;
  }

  if (onlyDigits.length >= 8 && onlyDigits.length <= 15) {
    return `+${onlyDigits}`;
  }

  throw new Error("Invalid phone number format.");
}

export function isValidPhoneNumber(rawValue: string): boolean {
  try {
    return E164_REGEX.test(normalizePhoneNumber(rawValue));
  } catch {
    return false;
  }
}
