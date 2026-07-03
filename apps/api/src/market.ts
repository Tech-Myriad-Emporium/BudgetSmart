// Market data hub: one polling loop against Finnhub feeds every user, so the
// free tier (60 calls/min) never scales with user count and the key stays
// server-side. Quotes cache in D1; a cron refreshes tracked symbols.
import type { Env } from "./types.js";

export const CORE_SYMBOLS: Array<{ symbol: string; label: string }> = [
  { symbol: "SPY", label: "S&P 500" },
  { symbol: "QQQ", label: "Nasdaq 100" },
  { symbol: "DIA", label: "Dow 30" },
  { symbol: "BINANCE:BTCUSDT", label: "Bitcoin" },
  { symbol: "BINANCE:ETHUSDT", label: "Ethereum" },
];

const FRESH_MS = 120_000; // serve from cache when newer than this
const MAX_TRACKED = 40;

export interface Quote {
  symbol: string;
  price: number;
  prevClose: number | null;
  change: number | null;
  changePct: number | null;
  updatedAt: number;
}

/** Normalize app symbols → Finnhub symbols (crypto tickers get an exchange pair). */
export function toProviderSymbol(raw: string, assetClass?: string): string {
  const s = raw.trim().toUpperCase();
  if (!s) return s;
  if (s.includes(":")) return s;
  if (assetClass === "crypto" || ["BTC", "ETH", "SOL", "DOGE", "ADA", "XRP", "LTC", "BNB"].includes(s)) {
    return `BINANCE:${s}USDT`;
  }
  return s;
}

async function fetchFromFinnhub(env: Env, symbol: string): Promise<Quote | null> {
  if (!env.FINNHUB_KEY) return null;
  try {
    const res = await fetch(
      `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${env.FINNHUB_KEY}`,
      { signal: AbortSignal.timeout(8000) },
    );
    if (!res.ok) return null;
    const d = (await res.json()) as { c?: number; pc?: number; d?: number; dp?: number };
    if (!d || typeof d.c !== "number" || d.c <= 0) return null; // unknown symbol → c=0
    return {
      symbol,
      price: d.c,
      prevClose: typeof d.pc === "number" ? d.pc : null,
      change: typeof d.d === "number" ? d.d : null,
      changePct: typeof d.dp === "number" ? d.dp : null,
      updatedAt: Date.now(),
    };
  } catch {
    return null;
  }
}

async function readCache(env: Env, symbols: string[]): Promise<Map<string, Quote>> {
  if (symbols.length === 0) return new Map();
  const marks = symbols.map(() => "?").join(",");
  const rows = await env.DB.prepare(`SELECT * FROM market_quotes WHERE symbol IN (${marks})`)
    .bind(...symbols)
    .all<{ symbol: string; price: number; prev_close: number | null; change: number | null; change_pct: number | null; updated_at: number }>();
  return new Map(
    (rows.results ?? []).map((r) => [
      r.symbol,
      { symbol: r.symbol, price: r.price, prevClose: r.prev_close, change: r.change, changePct: r.change_pct, updatedAt: r.updated_at },
    ]),
  );
}

async function writeCache(env: Env, q: Quote): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO market_quotes (symbol, price, prev_close, change, change_pct, updated_at) VALUES (?,?,?,?,?,?)
     ON CONFLICT(symbol) DO UPDATE SET price=excluded.price, prev_close=excluded.prev_close,
       change=excluded.change, change_pct=excluded.change_pct, updated_at=excluded.updated_at`,
  ).bind(q.symbol, q.price, q.prevClose, q.change, q.changePct, q.updatedAt).run();
}

/** Get quotes for symbols: cache when fresh, Finnhub when stale/missing. */
export async function getQuotes(env: Env, symbols: string[], trackRequests = true): Promise<Quote[]> {
  const unique = [...new Set(symbols.filter(Boolean))].slice(0, 15);
  const cache = await readCache(env, unique);
  const now = Date.now();
  const out: Quote[] = [];
  for (const sym of unique) {
    const cached = cache.get(sym);
    if (cached && now - cached.updatedAt < FRESH_MS) {
      out.push(cached);
      continue;
    }
    const live = await fetchFromFinnhub(env, sym);
    if (live) {
      await writeCache(env, live);
      out.push(live);
    } else if (cached) {
      out.push(cached); // stale beats nothing (nights/weekends)
    }
    if (trackRequests) {
      await env.DB.prepare(
        "INSERT INTO market_symbols (symbol, last_requested_at) VALUES (?, ?) ON CONFLICT(symbol) DO UPDATE SET last_requested_at=excluded.last_requested_at",
      ).bind(sym, now).run();
    }
  }
  return out;
}

/** Rough US-market window (padded for DST): Mon–Fri 13:00–21:30 UTC. */
function usMarketLikelyOpen(d = new Date()): boolean {
  const day = d.getUTCDay();
  if (day === 0 || day === 6) return false;
  const mins = d.getUTCHours() * 60 + d.getUTCMinutes();
  return mins >= 13 * 60 && mins <= 21 * 60 + 30;
}

/** Cron: keep core + recently-requested symbols warm. */
export async function refreshMarket(env: Env): Promise<void> {
  const open = usMarketLikelyOpen();
  const core = CORE_SYMBOLS.map((c) => c.symbol);
  const requested = await env.DB.prepare(
    "SELECT symbol FROM market_symbols WHERE last_requested_at > ? ORDER BY last_requested_at DESC LIMIT ?",
  ).bind(Date.now() - 7 * 86_400_000, MAX_TRACKED).all<{ symbol: string }>();
  const all = [...new Set([...core, ...(requested.results ?? []).map((r) => r.symbol)])];
  for (const sym of all) {
    const isCrypto = sym.includes(":");
    if (!isCrypto && !open) continue; // stocks sleep when the market does
    const q = await fetchFromFinnhub(env, sym);
    if (q) await writeCache(env, q);
  }
}

/* ------------------------------------------------------------------ *
 * Monthly price history (for backtesting). Source: Yahoo's public chart
 * API, cached in D1 for 24h per symbol so upstream sees ~1 call/day/symbol.
 * ------------------------------------------------------------------ */
const HISTORY_TTL_MS = 24 * 60 * 60 * 1000;

export interface HistoryPoint {
  month: string; // YYYY-MM
  close: number;
}

/** Normalize app symbols → Yahoo symbols (crypto pairs → -USD). */
function toYahooSymbol(raw: string): string {
  const s = raw.trim().toUpperCase();
  const m = s.match(/^BINANCE:(\w+?)USDT$/);
  if (m) return `${m[1]}-USD`;
  if (["BTC", "ETH", "SOL", "DOGE", "ADA", "XRP", "LTC", "BNB"].includes(s)) return `${s}-USD`;
  return s;
}

export async function getHistory(env: Env, rawSymbol: string, years: number): Promise<HistoryPoint[]> {
  const symbol = toYahooSymbol(rawSymbol);
  const meta = await env.DB.prepare("SELECT fetched_at FROM market_history_meta WHERE symbol = ?")
    .bind(symbol)
    .first<{ fetched_at: number }>();

  if (!meta || Date.now() - meta.fetched_at > HISTORY_TTL_MS) {
    try {
      const res = await fetch(
        `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1mo&range=${Math.min(20, Math.max(1, years))}y`,
        { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(10000) },
      );
      if (res.ok) {
        const d = (await res.json()) as {
          chart?: { result?: Array<{ timestamp?: number[]; indicators?: { quote?: Array<{ close?: Array<number | null> }> } }> };
        };
        const r = d.chart?.result?.[0];
        const ts = r?.timestamp ?? [];
        const closes = r?.indicators?.quote?.[0]?.close ?? [];
        if (ts.length > 0) {
          for (let i = 0; i < ts.length; i++) {
            const close = closes[i];
            if (typeof close !== "number" || close <= 0) continue;
            const month = new Date(ts[i]! * 1000).toISOString().slice(0, 7);
            await env.DB.prepare(
              "INSERT INTO market_history (symbol, month, close) VALUES (?,?,?) ON CONFLICT(symbol, month) DO UPDATE SET close=excluded.close",
            ).bind(symbol, month, close).run();
          }
          await env.DB.prepare(
            "INSERT INTO market_history_meta (symbol, fetched_at) VALUES (?,?) ON CONFLICT(symbol) DO UPDATE SET fetched_at=excluded.fetched_at",
          ).bind(symbol, Date.now()).run();
        }
      }
    } catch {
      /* fall through to whatever is cached */
    }
  }

  const from = new Date();
  from.setUTCFullYear(from.getUTCFullYear() - years);
  const rows = await env.DB.prepare(
    "SELECT month, close FROM market_history WHERE symbol = ? AND month >= ? ORDER BY month ASC",
  ).bind(symbol, from.toISOString().slice(0, 7)).all<{ month: string; close: number }>();
  return (rows.results ?? []).map((r) => ({ month: r.month, close: r.close }));
}
