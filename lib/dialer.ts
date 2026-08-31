import { isValidPhoneNumber } from "@/lib/phone";

const KEYPAD = /^[0-9*#]$/;

export function appendDialerDigit(current: string, digit: string): string {
  if (!KEYPAD.test(digit)) {
    return current;
  }
  return `${current}${digit}`;
}

export function backspaceDialerInput(current: string): string {
  return current.slice(0, -1);
}

export function canPlaceDialerCall(raw: string): boolean {
  return isValidPhoneNumber(raw);
}

export function formatDialerDisplay(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) {
    const rest = digits.slice(1);
    return `+1 (${rest.slice(0, 3)}) ${rest.slice(3, 6)}-${rest.slice(6)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return raw;
}
