/** Re-check a disabled account about once per inbox poll, not once per overlapping request. */
export const ACCOUNT_FRESH_MS = 5_000;

type AccountFreshness = {
  disabledAt: Date | null;
  checkedAt: number;
};

const accounts = new Map<string, AccountFreshness>();

export function readFreshAccount(
  userId: string,
  now = Date.now(),
): { disabledAt: Date | null } | null {
  const hit = accounts.get(userId);
  if (!hit || now - hit.checkedAt >= ACCOUNT_FRESH_MS) {
    return null;
  }
  return { disabledAt: hit.disabledAt };
}

export function rememberAccount(
  userId: string,
  disabledAt: Date | null,
  now = Date.now(),
): void {
  if (accounts.size > 500) {
    accounts.clear();
  }
  accounts.set(userId, { disabledAt, checkedAt: now });
}

export function resetAccountFreshness(): void {
  accounts.clear();
}
