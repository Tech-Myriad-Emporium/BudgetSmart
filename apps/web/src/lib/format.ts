/** UI-only formatting helpers (money formatting lives in @budgetsmart/shared). */

/** "2026-06-29" -> "Jun 29". */
export function formatDateShort(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

/** "2026-06" -> "June 2026". */
export function formatMonthLong(month: string): string {
  const [y, m] = month.split("-").map(Number);
  if (!y || !m) return month;
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Relative-ish label: Today / Yesterday / Jun 29. */
export function formatDateRelative(iso: string): string {
  const today = new Date();
  const todayIso = today.toISOString().slice(0, 10);
  const yesterday = new Date(today.getTime() - 86400000).toISOString().slice(0, 10);
  if (iso === todayIso) return "Today";
  if (iso === yesterday) return "Yesterday";
  return formatDateShort(iso);
}

export const todayIso = (): string => new Date().toISOString().slice(0, 10);

/** "2026-06" -> "Jun". */
export function monthAbbr(month: string): string {
  const [y, m] = month.split("-").map(Number);
  if (!y || !m) return month;
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
}
