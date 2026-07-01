# BudgetSmart Mobile (Expo / React Native)

iOS + Android client, sharing the same backend API and (on a full build) the
same `@budgetsmart/shared` engines as the web app.

Aesthetic: black canvas, neon-green active tab, white inactive — a bottom tab bar
per the mobile spec.

## What's scaffolded

- `app.json` — Expo config (dark UI, black background, neon primary)
- `src/theme.ts` — neon design tokens for RN `StyleSheet`
- `src/api.ts` — typed API client (token in `AsyncStorage`; `10.0.2.2` host on Android emulators)
- `src/App.tsx` — bottom-tab navigator (Dashboard, Transactions) with the neon tab bar
- `src/screens/*` — Dashboard (safe-to-spend, net worth, cashflow, recent activity) and Transactions, both live off the backend

## Run (on a machine with the RN toolchain)

```bash
# from repo root, start the backend first
npm run dev:backend

cd apps/mobile
npm install
npm start            # then press a (Android) / i (iOS), or scan with Expo Go
```

The app auto-signs into the demo account (`demo@budgetsmart.app`) for convenience.

## ⚠️ Environment note

This was **scaffolded but not run** in the current environment: React Native needs
the Android SDK / Xcode + an emulator or device, and large toolchain downloads,
which aren't available on this headless FAT32 box (same constraint that blocked
the Electron binary and Prisma). The code is structured to run on a normal dev
machine. Next steps for a full build: port the remaining screens to RN primitives,
wire `@budgetsmart/shared` via the copy mechanism (`scripts/link-shared.mjs` already
lists a slot), and add biometric unlock + push notifications.
