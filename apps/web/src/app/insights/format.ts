/** Same telemetry formats the board uses, shared by the page and the table. */

export function fmtCostUsd(v: number): string {
  return `US$ ${v.toFixed(2)}`;
}

export function fmtTokens(n: number): string {
  if (n >= 1_000_000) {
    const v = (n / 1_000_000).toFixed(1).replace(".0", "");
    return `${v}M tok`;
  }
  if (n >= 1_000) return `${Math.round(n / 1_000)}k tok`;
  return `${n} tok`;
}

export function fmtDurationMs(ms: number): string {
  const m = Math.round(ms / 60000);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return `${h}h${String(m % 60).padStart(2, "0")}`;
}

export function fmtRate(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}
