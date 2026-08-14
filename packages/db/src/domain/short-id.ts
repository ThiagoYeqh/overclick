const PREFIX = /^[A-Z0-9]{2,4}$/;

export function isValidPrefix(prefix: string): boolean {
  return PREFIX.test(prefix);
}

export function formatShortId(prefix: string, n: number): string {
  return `${prefix}-${n}`;
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
