// On native (Android/iOS via Capacitor), serve the app's /api/* calls from the
// on-device SQLite backend so everything works fully offline. On web/desktop
// this is a no-op and the real HTTP backend is used.
import { Capacitor } from "@capacitor/core";
import { handleApi } from "./backend";
import { initDb, saveNow } from "./db";

export function isNative(): boolean {
  return Capacitor.isNativePlatform();
}

function readAuth(init: RequestInit | undefined, input: RequestInfo | URL): string | null {
  let raw: string | null = null;
  const h = init?.headers;
  if (h instanceof Headers) raw = h.get("Authorization");
  else if (Array.isArray(h)) raw = h.find(([k]) => k.toLowerCase() === "authorization")?.[1] ?? null;
  else if (h && typeof h === "object") raw = (h as Record<string, string>).Authorization ?? (h as Record<string, string>).authorization ?? null;
  if (!raw && input instanceof Request) raw = input.headers.get("Authorization");
  return raw ? raw.replace(/^Bearer\s+/i, "").trim() : null;
}

export async function installOfflineBackend(): Promise<void> {
  if (!isNative()) return;
  await initDb();

  const orig = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const match = url.match(/\/api(\/[^?]*)(\?.*)?$/);
    if (!match) return orig(input, init);

    const path = match[1]!;
    const query = new URLSearchParams(match[2] ? match[2].slice(1) : "");
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    const auth = readAuth(init, input);
    let body: any = {};
    const rawBody = init?.body ?? (input instanceof Request ? undefined : undefined);
    if (rawBody && typeof rawBody === "string") { try { body = JSON.parse(rawBody); } catch { body = {}; } }

    try {
      const r = await handleApi(method, path, query, body, auth);
      if (r.status === 204) return new Response(null, { status: 204 });
      return new Response(JSON.stringify(r.body ?? {}), { status: r.status, headers: { "Content-Type": "application/json" } });
    } catch (e) {
      return new Response(JSON.stringify({ error: (e as Error).message || "Internal error" }), { status: 500, headers: { "Content-Type": "application/json" } });
    }
  };

  // Flush the DB to disk when the app is backgrounded.
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") void saveNow(); });
}
