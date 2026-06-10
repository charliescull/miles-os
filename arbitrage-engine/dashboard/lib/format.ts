// Shared formatters — mono/tabular money + percentages, terminal style.

export const usd = (n: number | null | undefined, dp = 0) =>
  n === null || n === undefined
    ? "—"
    : new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: dp,
        maximumFractionDigits: dp,
      }).format(n);

export const pct = (n: number | null | undefined, dp = 0) =>
  n === null || n === undefined ? "—" : `${n >= 0 ? "+" : ""}${(n * 100).toFixed(dp)}%`;

export function ago(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
