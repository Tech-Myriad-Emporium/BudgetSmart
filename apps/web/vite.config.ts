import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  // "." = the app's root (where Vite runs); avoids needing @types/node for process.cwd()
  const env = loadEnv(mode, ".", "");
  const apiUrl = env.VITE_API_URL ?? "http://localhost:4000";

  return {
    plugins: [react()],
    // @budgetsmart/shared is dependency-free local ESM. Don't pre-bundle it, so
    // newly added exports are picked up live without clearing Vite's dep cache.
    optimizeDeps: { exclude: ["@budgetsmart/shared"] },
    server: {
      port: 5173,
      // Proxy /api to the backend so the app can use same-origin relative URLs.
      proxy: {
        "/api": { target: apiUrl, changeOrigin: true },
        "/health": { target: apiUrl, changeOrigin: true },
      },
    },
    preview: { port: 5173 },
  };
});
