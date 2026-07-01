# BudgetSmart Desktop (Electron)

A self-contained Windows desktop build of BudgetSmart. The packaged app bundles
the built web UI **and** the backend; on launch the Electron shell starts the
backend (Express + `node:sqlite`) on a local port and opens the window to it.
Black window chrome with neon-green caption controls, a tray, and single-instance lock.

## The built app

```
apps/desktop/dist-exe/BudgetSmart-win32-x64/BudgetSmart.exe
```

Double-click to run. The local database lives in `%APPDATA%\budgetsmart\app.db`
(created on first launch — register an account in the app to start).

> **Requires Node.js 22.5+ on PATH.** Electron 33 bundles Node 20, which lacks
> `node:sqlite`, so the backend is spawned with your *system* Node. A fully
> embedded runtime needs a newer Electron (its ~150 MB binary download was blocked
> on the FAT32 build box; see below).

## Rebuilding the .exe

From the repo root:

```bash
npm run build:desktop
```

That builds shared + backend + web, stages them into `apps/desktop/app-resources/`,
and assembles `dist-exe/BudgetSmart-win32-x64/BudgetSmart.exe`.

### How the build works (and why it's hand-rolled)

This repo lives on a **FAT32 drive on a locked-down box** where large GitHub
downloads stall (same reason Prisma was dropped for `node:sqlite`):

1. **Electron binary** — its post-install download never completed, but the full
   `electron-v33.4.11-win32-x64.zip` *was* cached at
   `%LOCALAPPDATA%\electron\Cache\…`. We extracted it into
   `node_modules/electron/dist` (one-time; `node node_modules/electron/install.js`
   didn't, so it was unzipped manually).
2. **electron-packager hangs** in its internal extract/copy step on this filesystem
   (prints "Packaging app…" then never settles → exit 13). So packaging is done by
   **`pack-manual.mjs`**, which just copies the already-extracted Electron runtime,
   renames `electron.exe` → `BudgetSmart.exe`, and drops the app into
   `resources/app` (exactly what packager does, minus the step that hangs).

### Dev mode (no packaging)

```bash
npm run dev            # from repo root — backend + web on :4000/:5173
# then, with BUDGETSMART_URL set so Electron loads the running app:
BUDGETSMART_URL=http://localhost:5173 npm --prefix apps/desktop start
```

## TODO for a polished installer
- App icon (`.ico`) — currently the default Electron icon.
- A proper NSIS installer (electron-builder) — needs a machine/network that allows
  the winCodeSign / NSIS downloads.
- Bundle a Node runtime (or move to an Electron whose Node has `node:sqlite`) so it
  doesn't depend on system Node.
