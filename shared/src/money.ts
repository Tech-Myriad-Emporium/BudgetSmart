/**
 * Money is represented everywhere as an integer number of **minor units** (cents).
 * Never use floats for money. Convert at the UI boundary only.
 */

export type Cents = number;

/** Convert a major-unit amount (e.g. dollars `12.34`) to cents (`1234`). */
export function toCents(amount: number): Cents {
  return Math.round(amount * 100);
}

/** Convert cents (`1234`) to major units (`12.34`). */
export function toMajor(cents: Cents): number {
  return cents / 100;
}

/** Parse a free-form money string like "$1,234.50" or "-12" into cents. Returns null if unparseable. */
export function parseMoney(input: string): Cents | null {
  if (input == null) return null;
  const cleaned = input.replace(/[^0-9.\-]/g, "").trim();
  if (cleaned === "" || cleaned === "-" || cleaned === ".") return null;
  const value = Number(cleaned);
  if (Number.isNaN(value)) return null;
  return toCents(value);
}

export interface FormatMoneyOptions {
  currency?: string;
  locale?: string;
  /** Show a leading +/- sign explicitly. */
  signed?: boolean;
}

/** Format cents as a localized currency string. */
export function formatMoney(cents: Cents, opts: FormatMoneyOptions = {}): string {
  const { currency = "USD", locale = "en-US", signed = false } = opts;
  const formatter = new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    signDisplay: signed ? "exceptZero" : "auto",
  });
  return formatter.format(toMajor(cents));
}

/** Compact format for charts/badges, e.g. 1_234_500 cents -> "$12.3k". */
export function formatMoneyCompact(cents: Cents, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(toMajor(cents));
}

export const sumCents = (values: Cents[]): Cents => values.reduce((a, b) => a + b, 0);

/** Clamp a value into [min, max]. */
export const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);
