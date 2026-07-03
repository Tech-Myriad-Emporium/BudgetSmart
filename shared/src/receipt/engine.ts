// Receipt parsing: turn raw OCR text into a transaction draft (merchant,
// date, total). Pure heuristics — testable without any OCR engine.
import type { Cents } from "../money.js";

export interface ReceiptDraft {
  merchant: string | null;
  /** ISO date (YYYY-MM-DD) or null. */
  date: string | null;
  /** Best-guess total in cents, or null. */
  total: Cents | null;
  /** All money amounts seen (for the UI to offer alternatives). */
  amounts: Cents[];
}

const MONEY = /(?:\$|USD\s?)?(\d{1,3}(?:[.,]\d{3})*|\d+)[.,](\d{2})\b/g;
const TOTAL_HINT = /\b(total|amount\s*due|balance\s*due|grand\s*total|to\s*pay)\b/i;
const NOT_TOTAL = /\b(sub\s*total|subtotal|tax|tip|change|cash|tend|credit|debit|auth|account|card|visa|master)\b/i;
const DATE_PATTERNS: Array<{ re: RegExp; build: (m: RegExpMatchArray) => string | null }> = [
  { re: /\b(\d{4})[-/](\d{1,2})[-/](\d{1,2})\b/, build: (m) => iso(+m[1]!, +m[2]!, +m[3]!) },
  { re: /\b(\d{1,2})[-/](\d{1,2})[-/](\d{4})\b/, build: (m) => iso(+m[3]!, +m[1]!, +m[2]!) },
  { re: /\b(\d{1,2})[-/](\d{1,2})[-/](\d{2})\b/, build: (m) => iso(2000 + +m[3]!, +m[1]!, +m[2]!) },
  {
    re: /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})\b/i,
    build: (m) => iso(+m[3]!, "janfebmaraprmayjunjulaugsepoctnovdec".indexOf(m[1]!.slice(0, 3).toLowerCase()) / 3 + 1, +m[2]!),
  },
];

function iso(y: number, mo: number, d: number): string | null {
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || y < 2000 || y > 2100) return null;
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function centsFrom(m: RegExpMatchArray): Cents {
  const whole = m[1]!.replace(/[.,]/g, "");
  return parseInt(whole, 10) * 100 + parseInt(m[2]!, 10);
}

export function parseReceipt(text: string): ReceiptDraft {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);

  // merchant: first line with letters that isn't a date/number/address-ish noise
  let merchant: string | null = null;
  for (const l of lines.slice(0, 6)) {
    const letters = (l.match(/[a-z]/gi) ?? []).length;
    if (letters >= 3 && !/receipt|invoice|welcome|thank/i.test(l) && !DATE_PATTERNS.some((p) => p.re.test(l))) {
      merchant = l.replace(/\s{2,}/g, " ").slice(0, 60);
      break;
    }
  }

  // date: first parseable date anywhere
  let date: string | null = null;
  for (const l of lines) {
    for (const p of DATE_PATTERNS) {
      const m = l.match(p.re);
      if (m) {
        date = p.build(m);
        if (date) break;
      }
    }
    if (date) break;
  }

  // amounts + total: prefer a line with a TOTAL hint (that isn't subtotal/tax);
  // otherwise the largest amount on the receipt.
  const amounts: Cents[] = [];
  let total: Cents | null = null;
  for (const l of lines) {
    const found = [...l.matchAll(MONEY)].map(centsFrom);
    amounts.push(...found);
    if (found.length > 0 && TOTAL_HINT.test(l) && !NOT_TOTAL.test(l)) {
      total = Math.max(...found); // "TOTAL $23.45" — take the line's biggest number
    }
  }
  if (total === null && amounts.length > 0) total = Math.max(...amounts);

  return { merchant, date, total, amounts: [...new Set(amounts)].sort((a, b) => b - a).slice(0, 6) };
}
