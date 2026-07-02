// Bank-statement import: parse CSV / OFX / QFX / QIF exports into normalized
// rows, then "smart import" — suggest categories from the user's own history
// and flag duplicates against existing data. Pure functions; no file I/O.
import type { Cents } from "../money.js";
import { learnMerchantCategories, suggestCategory } from "../insights/engine.js";
import { normalizeMerchant } from "../recurring/engine.js";
import type { Category, Transaction } from "../types.js";

const DAY = 86_400_000;
const parseIsoMs = (iso: string): number => {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, d);
};

export type StatementFormat = "csv" | "ofx" | "qif";

export interface ParsedRow {
  /** ISO date YYYY-MM-DD. */
  date: string;
  /** Positive magnitude in cents. */
  amount: Cents;
  type: "income" | "expense";
  merchant: string;
  note: string | null;
}

export interface CsvMapping {
  dateCol: number;
  descCol: number;
  /** Single signed amount column… */
  amountCol?: number;
  /** …or separate debit/credit columns. */
  debitCol?: number;
  creditCol?: number;
}

export interface ParseResult {
  format: StatementFormat;
  rows: ParsedRow[];
  /** CSV only: the header row (for a manual-mapping UI). */
  headers: string[] | null;
  /** CSV only: the mapping that was used. */
  mapping: CsvMapping | null;
  /** Count of lines that couldn't be parsed and were skipped. */
  skipped: number;
}

/* ------------------------------------------------------------------ *
 * Small parsing utilities
 * ------------------------------------------------------------------ */

/** Parse "$1,234.56", "(12.34)", "-12.34", "12.34 CR" → signed cents (null if not a number). */
export function parseAmount(raw: string): Cents | null {
  let s = raw.trim();
  if (!s) return null;
  let sign = 1;
  if (/^\(.*\)$/.test(s)) {
    sign = -1;
    s = s.slice(1, -1);
  }
  if (/\bDR\b/i.test(s)) sign = -1;
  s = s.replace(/\bCR\b|\bDR\b/gi, "");
  s = s.replace(/[$€£¥,\s]/g, "");
  if (s.startsWith("-")) {
    sign *= -1;
    s = s.slice(1);
  } else if (s.startsWith("+")) {
    s = s.slice(1);
  }
  if (!/^\d*\.?\d+$/.test(s)) return null;
  return sign * Math.round(parseFloat(s) * 100);
}

/**
 * Parse a date string to ISO. `dayFirst` resolves DD/MM vs MM/DD ambiguity.
 * Handles YYYY-MM-DD, YYYYMMDD, MM/DD/YYYY, M/D/YY, and "Jan 5, 2026".
 */
export function parseDate(raw: string, dayFirst = false): string | null {
  const s = raw.trim().replace(/\[.*$/, ""); // OFX timezone suffix
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return iso(+m[1]!, +m[2]!, +m[3]!);
  m = s.match(/^(\d{4})(\d{2})(\d{2})/);
  if (m) return iso(+m[1]!, +m[2]!, +m[3]!);
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (m) {
    const a = +m[1]!;
    const b = +m[2]!;
    let y = +m[3]!;
    if (y < 100) y += y >= 70 ? 1900 : 2000;
    const [mo, d] = dayFirst || a > 12 ? [b, a] : b > 12 ? [a, b] : [a, b];
    return iso(y, mo!, d!);
  }
  const t = Date.parse(s);
  if (!Number.isNaN(t)) {
    const dt = new Date(t);
    return iso(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
  }
  return null;
}

function iso(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1970 || y > 2100) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** RFC-4180-ish CSV line splitter (quoted fields, escaped quotes). */
export function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQuotes = false;
      } else cur += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

/* ------------------------------------------------------------------ *
 * Format detection + parsers
 * ------------------------------------------------------------------ */

export function detectFormat(content: string): StatementFormat {
  const head = content.slice(0, 600).toUpperCase();
  if (head.includes("<OFX") || head.includes("OFXHEADER") || head.includes("<STMTTRN")) return "ofx";
  if (/^!TYPE:/m.test(content.slice(0, 200).toUpperCase())) return "qif";
  return "csv";
}

function parseOfx(content: string): ParseResult {
  const rows: ParsedRow[] = [];
  let skipped = 0;
  const blocks = content.match(/<STMTTRN>[\s\S]*?(?=<STMTTRN>|<\/BANKTRANLIST|<\/STMTTRN>[\s\S]*?$)/gi) ?? [];
  const field = (block: string, tag: string): string => {
    const m = block.match(new RegExp(`<${tag}>([^<\\r\\n]*)`, "i"));
    return m ? m[1]!.trim() : "";
  };
  for (const b of blocks) {
    const date = parseDate(field(b, "DTPOSTED"));
    const amt = parseAmount(field(b, "TRNAMT"));
    if (!date || amt === null || amt === 0) {
      skipped++;
      continue;
    }
    const name = field(b, "NAME");
    const memo = field(b, "MEMO");
    rows.push({
      date,
      amount: Math.abs(amt),
      type: amt < 0 ? "expense" : "income",
      merchant: (name || memo).slice(0, 120),
      note: name && memo && memo !== name ? memo.slice(0, 500) : null,
    });
  }
  return { format: "ofx", rows, headers: null, mapping: null, skipped };
}

function parseQif(content: string): ParseResult {
  const rows: ParsedRow[] = [];
  let skipped = 0;
  let cur: { date?: string | null; amount?: Cents | null; payee?: string; memo?: string } = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("!")) continue;
    const code = line[0]!.toUpperCase();
    const val = line.slice(1);
    if (code === "^") {
      if (cur.date && cur.amount !== undefined && cur.amount !== null && cur.amount !== 0) {
        rows.push({
          date: cur.date,
          amount: Math.abs(cur.amount),
          type: cur.amount < 0 ? "expense" : "income",
          merchant: (cur.payee ?? "").slice(0, 120),
          note: cur.memo ? cur.memo.slice(0, 500) : null,
        });
      } else if (Object.keys(cur).length > 0) skipped++;
      cur = {};
    } else if (code === "D") cur.date = parseDate(val);
    else if (code === "T" || code === "U") cur.amount = parseAmount(val);
    else if (code === "P") cur.payee = val;
    else if (code === "M") cur.memo = val;
  }
  return { format: "qif", rows, headers: null, mapping: null, skipped };
}

/** Guess which CSV columns hold the date / description / amount(s). */
export function guessCsvMapping(headers: string[]): CsvMapping | null {
  const find = (re: RegExp) => headers.findIndex((h) => re.test(h));
  const dateCol = find(/^(post(ed|ing)?[ _-]?date|transaction[ _-]?date|date)/i);
  const descCol = (() => {
    const exact = find(/^(description|payee|merchant|name|details|memo)/i);
    return exact >= 0 ? exact : find(/description|payee|merchant|narrative/i);
  })();
  const debitCol = find(/^(debit|withdrawals?|money[ _-]?out|paid[ _-]?out)/i);
  const creditCol = find(/^(credit|deposits?|money[ _-]?in|paid[ _-]?in)/i);
  const amountCol = find(/^amount|^transaction[ _-]?amount|amount/i);
  if (dateCol < 0 || descCol < 0) return null;
  if (debitCol >= 0 && creditCol >= 0) return { dateCol, descCol, debitCol, creditCol };
  if (amountCol >= 0) return { dateCol, descCol, amountCol };
  return null;
}

function parseCsv(content: string, forced?: CsvMapping): ParseResult {
  const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { format: "csv", rows: [], headers: null, mapping: null, skipped: 0 };

  const first = splitCsvLine(lines[0]!);
  const firstLooksLikeHeader = first.every((c) => parseAmount(c) === null || /[a-z]{3,}/i.test(c)) && !parseDate(first[0] ?? "");
  const headers = firstLooksLikeHeader ? first : null;
  const dataLines = firstLooksLikeHeader ? lines.slice(1) : lines;

  let mapping = forced ?? (headers ? guessCsvMapping(headers) : null);
  if (!mapping && !headers) {
    // headerless: infer by sampling the first data row
    const sample = splitCsvLine(dataLines[0] ?? "");
    const dateCol = sample.findIndex((c) => parseDate(c) !== null);
    const amountCol = sample.findIndex((c, i) => i !== dateCol && parseAmount(c) !== null && /\d/.test(c));
    const descCol = sample.findIndex((c, i) => i !== dateCol && i !== amountCol && /[a-z]/i.test(c));
    if (dateCol >= 0 && amountCol >= 0 && descCol >= 0) mapping = { dateCol, descCol, amountCol };
  }
  if (!mapping) return { format: "csv", rows: [], headers, mapping: null, skipped: dataLines.length };

  // Detect day-first dates: any row whose first date part exceeds 12.
  const dayFirst = dataLines.some((l) => {
    const c = splitCsvLine(l)[mapping!.dateCol] ?? "";
    const m = c.match(/^(\d{1,2})[/.-](\d{1,2})[/.-]\d{2,4}$/);
    return m ? +m[1]! > 12 : false;
  });

  const rows: ParsedRow[] = [];
  let skipped = 0;
  for (const line of dataLines) {
    const cols = splitCsvLine(line);
    const date = parseDate(cols[mapping.dateCol] ?? "", dayFirst);
    const merchant = (cols[mapping.descCol] ?? "").slice(0, 120);
    let signed: Cents | null = null;
    if (mapping.amountCol !== undefined) {
      signed = parseAmount(cols[mapping.amountCol] ?? "");
    } else {
      const debit = parseAmount(cols[mapping.debitCol!] ?? "");
      const credit = parseAmount(cols[mapping.creditCol!] ?? "");
      if (debit !== null && debit !== 0) signed = -Math.abs(debit);
      else if (credit !== null && credit !== 0) signed = Math.abs(credit);
    }
    if (!date || signed === null || signed === 0 || !merchant) {
      skipped++;
      continue;
    }
    rows.push({
      date,
      amount: Math.abs(signed),
      type: signed < 0 ? "expense" : "income",
      merchant,
      note: null,
    });
  }
  return { format: "csv", rows, headers, mapping, skipped };
}

export function parseStatement(content: string, opts: { mapping?: CsvMapping } = {}): ParseResult {
  const format = detectFormat(content);
  if (format === "ofx") return parseOfx(content);
  if (format === "qif") return parseQif(content);
  return parseCsv(content, opts.mapping);
}

/* ------------------------------------------------------------------ *
 * Smart import: categorize + dedupe against existing data
 * ------------------------------------------------------------------ */

export interface ImportCandidate extends ParsedRow {
  /** Stable index into the parsed rows (used to select rows for commit). */
  index: number;
  suggestedCategoryId: string | null;
  suggestedCategoryName: string | null;
  suggestedIcon: string | null;
  suggestedSource: "history" | "keyword" | null;
  duplicate: boolean;
  duplicateReason: string | null;
}

export interface ImportAnalysis {
  format: StatementFormat;
  headers: string[] | null;
  mapping: CsvMapping | null;
  skipped: number;
  candidates: ImportCandidate[];
  newCount: number;
  duplicateCount: number;
  categorizedCount: number;
  dateFrom: string | null;
  dateTo: string | null;
}

export function analyzeImport(parsed: ParseResult, existing: Transaction[], categories: Category[]): ImportAnalysis {
  const model = learnMerchantCategories(existing);

  // Existing-transaction lookup: type|amount → txns (then date/merchant checked).
  const byAmount = new Map<string, Transaction[]>();
  for (const t of existing) {
    if (t.type === "transfer") continue;
    const key = `${t.type}|${t.amount}`;
    (byAmount.get(key) ?? byAmount.set(key, []).get(key)!).push(t);
  }

  const seenInFile = new Set<string>();
  const candidates: ImportCandidate[] = parsed.rows.map((row, index) => {
    let duplicate = false;
    let duplicateReason: string | null = null;

    const fileKey = `${row.date}|${row.type}|${row.amount}|${normalizeMerchant(row.merchant)}`;
    if (seenInFile.has(fileKey)) {
      duplicate = true;
      duplicateReason = "repeated in this file";
    }
    seenInFile.add(fileKey);

    if (!duplicate) {
      const rowKey = normalizeMerchant(row.merchant);
      const rowMs = parseIsoMs(row.date);
      const match = (byAmount.get(`${row.type}|${row.amount}`) ?? []).find((t) => {
        if (Math.abs(parseIsoMs(t.date) - rowMs) > 2 * DAY) return false;
        const tKey = normalizeMerchant(t.merchant);
        return tKey === rowKey || (!!tKey && !!rowKey && (tKey.includes(rowKey) || rowKey.includes(tKey)));
      });
      if (match) {
        duplicate = true;
        duplicateReason = "already in your transactions";
      }
    }

    const suggestion = row.type === "expense" ? suggestCategory(row.merchant, model, categories) : null;
    return {
      ...row,
      index,
      suggestedCategoryId: suggestion?.category.id ?? null,
      suggestedCategoryName: suggestion?.category.name ?? null,
      suggestedIcon: suggestion?.category.icon ?? null,
      suggestedSource: suggestion?.source ?? null,
      duplicate,
      duplicateReason,
    };
  });

  const dates = candidates.map((c) => c.date).sort();
  return {
    format: parsed.format,
    headers: parsed.headers,
    mapping: parsed.mapping,
    skipped: parsed.skipped,
    candidates,
    newCount: candidates.filter((c) => !c.duplicate).length,
    duplicateCount: candidates.filter((c) => c.duplicate).length,
    categorizedCount: candidates.filter((c) => c.suggestedCategoryId).length,
    dateFrom: dates[0] ?? null,
    dateTo: dates[dates.length - 1] ?? null,
  };
}
