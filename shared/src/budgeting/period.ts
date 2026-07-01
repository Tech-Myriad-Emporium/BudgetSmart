/** Helpers for working with budget periods, expressed as `YYYY-MM`. */

export type Month = string; // "YYYY-MM"

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export function isMonth(value: string): value is Month {
  return MONTH_RE.test(value);
}

/** Current month in `YYYY-MM` for a given date (defaults to now). */
export function currentMonth(date: Date = new Date()): Month {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

/** The month immediately before `month`. */
export function previousMonth(month: Month): Month {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1, 1));
  d.setUTCMonth(d.getUTCMonth() - 1);
  return currentMonth(d);
}

/** The month immediately after `month`. */
export function nextMonth(month: Month): Month {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1, 1));
  d.setUTCMonth(d.getUTCMonth() + 1);
  return currentMonth(d);
}

/** The `YYYY-MM` a given ISO date string (YYYY-MM-DD...) falls in. */
export function monthOf(isoDate: string): Month {
  return isoDate.slice(0, 7);
}

/** Inclusive [start, end) ISO date bounds for a month, useful for queries. */
export function monthBounds(month: Month): { start: string; end: string } {
  return { start: `${month}-01`, end: `${nextMonth(month)}-01` };
}
