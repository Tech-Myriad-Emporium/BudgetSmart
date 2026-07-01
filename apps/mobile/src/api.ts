import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import type { DashboardData } from "./types";

// On Android emulators localhost is the device itself; 10.0.2.2 reaches the host.
export const API_BASE =
  process.env.EXPO_PUBLIC_API_URL ??
  (Platform.OS === "android" ? "http://10.0.2.2:4000" : "http://localhost:4000");

const TOKEN_KEY = "budgetsmart.token";

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = await AsyncStorage.getItem(TOKEN_KEY);
  const res = await fetch(`${API_BASE}/api${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
  return body as T;
}

export const api = {
  async login(email: string, password: string) {
    const res = await request<{ token: string }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    await AsyncStorage.setItem(TOKEN_KEY, res.token);
    return res;
  },
  dashboard: () => request<DashboardData>("/dashboard"),
  transactions: () =>
    request<{ transactions: Array<{ id: string; merchant: string; amount: number; type: string; date: string; categoryId: string | null }> }>(
      "/transactions?limit=50",
    ),
};
