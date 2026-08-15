const PREFIX = /^[A-Z0-9]{2,4}$/;
/** Parent (`AGB-5`) or nested child (`OVK-5.4`, `OC-1.2.3`). */
const SHORT_ID = /^[A-Z0-9]{2,4}-\d+(?:\.\d+)*$/i;

export function isValidPrefix(prefix: string): boolean {
  return PREFIX.test(prefix);
}

export function formatShortId(prefix: string, n: number): string {
  return `${prefix}-${n}`;
}

export function normalizeShortId(value: string): string {
  return value.trim().toUpperCase();
}

export function isShortId(value: string): boolean {
  return SHORT_ID.test(value.trim());
}

export function nextShortId(
  prefix: string,
  currentNumber: number,
): { shortId: string; nextNumber: number } {
  return {
    shortId: formatShortId(prefix, currentNumber),
    nextNumber: currentNumber + 1,
  };
}
