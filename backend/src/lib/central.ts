import { env } from "../env.js";

// Thin server-side client for the central BudgetSmart account API (Cloudflare
// Worker). Runs from the local backend, so there are no CORS constraints and
// the central JWT never touches the browser.

export interface CentralAccount {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
  tier: string;
  subscriptionStatus: string | null;
  currentPeriodEnd: number | null;
}

export interface CentralEntitlement {
  tier: string;
  subscriptionStatus: string | null;
  currentPeriodEnd: number | null;
  emailVerified: boolean;
  /** Signed entitlement token (RS256) proving the tier. */
  token: string;
}

export type CentralResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; error: string; code?: string };

async function call<T>(path: string, init: RequestInit): Promise<CentralResult<T>> {
  try {
    const res = await fetch(`${env.centralApiUrl}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
    });
    const data = (await res.json().catch(() => ({}))) as any;
    if (!res.ok) return { ok: false, status: res.status, error: data?.error ?? `HTTP ${res.status}`, code: data?.code };
    return { ok: true, data: data as T };
  } catch (err) {
    return { ok: false, status: 0, error: `Can't reach the account server. ${(err as Error).message}` };
  }
}

export const central = {
  login(email: string, password: string) {
    return call<{ token: string; account: CentralAccount }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
  },
  entitlement(token: string) {
    return call<CentralEntitlement>("/entitlement", { method: "GET", headers: { Authorization: `Bearer ${token}` } });
  },
};
