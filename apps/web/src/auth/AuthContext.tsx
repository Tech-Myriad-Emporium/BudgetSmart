import { useQueryClient } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, tokenStore, type AuthPayload } from "../lib/api";

type User = AuthPayload["user"];

interface AuthState {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (input: { email: string; password: string; name: string }) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const queryClient = useQueryClient();

  // Restore session from a stored token on first load.
  useEffect(() => {
    if (!tokenStore.get()) {
      setLoading(false);
      return;
    }
    api
      .me()
      .then((res) => setUser(res.user))
      .catch(() => tokenStore.clear())
      .finally(() => setLoading(false));
  }, []);

  function adopt(payload: AuthPayload) {
    tokenStore.set(payload.token);
    setUser(payload.user);
  }

  const value = useMemo<AuthState>(
    () => ({
      user,
      loading,
      login: async (email, password) => adopt(await api.login(email, password)),
      register: async (input) => adopt(await api.register(input)),
      logout: () => {
        tokenStore.clear();
        setUser(null);
        queryClient.clear();
      },
    }),
    [user, loading, queryClient],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
