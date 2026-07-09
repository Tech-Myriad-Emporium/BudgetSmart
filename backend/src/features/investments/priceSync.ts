import { holdings, users } from "../../db/repo.js";
import { env } from "../../env.js";

/** Map an app symbol to the market hub's provider symbol (crypto pairs). */
export function providerSymbol(symbol: string, assetClass: string): string {
  const s = symbol.trim().toUpperCase();
  if (!s || s.includes(":")) return s;
  if (assetClass === "crypto") return `BINANCE:${s}USDT`;
  return s;
}

interface Quote {
  symbol: string;
  price: number;
}

async function fetchQuotes(symbols: string[]): Promise<Quote[]> {
  if (symbols.length === 0) return [];
  const r = await fetch(`${env.centralApiUrl}/market/quote?symbols=${encodeURIComponent(symbols.join(","))}`, {
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) return [];
  return ((await r.json()) as { quotes?: Quote[] }).quotes ?? [];
}

/** Refresh one user's holdings from the market hub. Throws on network failure
 *  so the API route can surface "are you online?" to the user. */
export async function refreshUserPrices(userId: string): Promise<{ updated: number; skipped: number }> {
  const list = holdings.listByUser(userId).filter((h) => h.symbol.trim().length > 0);
  if (list.length === 0) return { updated: 0, skipped: 0 };
  const bySymbol = new Map<string, typeof list>();
  for (const h of list) {
    const key = providerSymbol(h.symbol, h.assetClass);
    (bySymbol.get(key) ?? bySymbol.set(key, [] as typeof list).get(key)!).push(h);
  }
  const quotes = await fetchQuotes([...bySymbol.keys()].slice(0, 15));
  let updated = 0;
  for (const q of quotes) {
    for (const h of bySymbol.get(q.symbol) ?? []) {
      holdings.update(h.id, { currentPrice: Math.round(q.price * 100) });
      updated++;
    }
  }
  return { updated, skipped: list.length - updated };
}

/**
 * Background pass: keep EVERY user's holding prices current while the app is
 * running, so the dashboard / net worth / investments all show live values
 * without anyone opening the Investments page or clicking Sync.
 * One central request per pass — all users' unique symbols batched together.
 */
async function refreshAllPrices(): Promise<void> {
  try {
    const all = users.listAll().flatMap((u) => holdings.listByUser(u.id)).filter((h) => h.symbol.trim().length > 0);
    if (all.length === 0) return;
    const bySymbol = new Map<string, typeof all>();
    for (const h of all) {
      const key = providerSymbol(h.symbol, h.assetClass);
      (bySymbol.get(key) ?? bySymbol.set(key, [] as typeof all).get(key)!).push(h);
    }
    const quotes = await fetchQuotes([...bySymbol.keys()].slice(0, 15));
    for (const q of quotes) {
      for (const h of bySymbol.get(q.symbol) ?? []) {
        holdings.update(h.id, { currentPrice: Math.round(q.price * 100) });
      }
    }
  } catch {
    /* offline — try again next pass */
  }
}

/** Prices sync 20s after boot, then every 3 minutes (hub cron runs every 2). */
export function startMarketScheduler(): void {
  setTimeout(() => void refreshAllPrices(), 20_000);
  setInterval(() => void refreshAllPrices(), 3 * 60 * 1000);
}
