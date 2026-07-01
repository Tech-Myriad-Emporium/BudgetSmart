# BudgetSmart

Cross-platform personal finance app. This repo currently contains the **first full-stack vertical slice**: a real, interconnected frontend + backend with deep implementations of the core money-management features.

> Aesthetic: pure black `#000000`, white `#FFFFFF`, neon green `#00FF41` — cyber-terminal meets modern fintech.

## What's built (this slice)

| Area | Status |
|---|---|
| Auth (register / login / JWT) | ✅ |
| Accounts (cash, checking, savings, credit, loan) | ✅ |
| Categories (icon, color, type) | ✅ |
| Transactions (CRUD, multi-account, filters) | ✅ |
| Budgets (monthly limits, rollover, safe-to-spend) | ✅ |
| Dashboard (safe-to-spend, recent activity, spend-by-category) | ✅ |

Everything the UI shows is fetched from the backend over a typed API. Shared types & money math live in one package consumed by both sides.

## Architecture

```
budgetsmart/
├── shared/        @budgetsmart/shared — types, design tokens, money/budget engines (used by BOTH sides)
├── backend/       Express 5 + node:sqlite + JWT  (the API + data brain)
└── apps/
    └── web/       Vite + React + TS  (the app UI — later wraps into Electron/desktop)
```

Why this stack: **zero native compilation and zero engine downloads.** The database is
Node's built-in `node:sqlite` writing to a local file — no Prisma, no Docker, no Postgres,
no `node-gyp`. Each package installs independently and `@budgetsmart/shared` is linked into
the others via a directory junction (`scripts/link-shared.mjs`), which sidesteps npm's
unreliable workspace symlinking on Windows.

## Quick start

> PowerShell note: run these as separate lines — PowerShell 5.1 does not support
> `&&` between commands. (The chaining *inside* each npm script is fine — npm runs
> those via cmd, not PowerShell.)

```powershell
# First time only — install everything + create & seed the database:
npm run bootstrap

# Every time after — start the API + app together:
npm start            # alias for `npm run dev`  → API :4000, app :5173

# Optional: also run the marketing site (:5174)
npm run dev:all
```

`npm run bootstrap` = `setup` (install all packages + link shared) then `db:setup`
(create the SQLite DB) then `db:seed` (load the demo account).

- API → http://localhost:4000  (health check at `/health`)
- App → http://localhost:5173

Demo login (after seeding):

```
email:    demo@budgetsmart.app
password: demo1234
```

## Useful scripts

| Command | Does |
|---|---|
| `npm run dev` | Build shared, then run API + web concurrently |
| `npm run dev:backend` | API only |
| `npm run dev:web` | Web only |
| `npm run db:setup` | Create the SQLite database + tables |
| `npm run db:seed` | Load demo user + sample data |
| `npm run build` | Production build of all packages |
| `npm run typecheck` | Type-check every workspace |

## Roadmap (not in this slice)

Goals, debt, investments, tax engine, family, gamification, AI features, mobile (React Native) & desktop (Electron) shells, advisor portal, and the marketing/download website. The shared package + API are structured so these layer on without rework.
