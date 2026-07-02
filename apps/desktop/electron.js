// BudgetSmart desktop shell (Electron).
//
// On launch it starts the bundled backend (Express + node:sqlite) using the
// Node runtime bundled with the app (Electron's own Node lacks node:sqlite, so
// the backend runs as a child process). The backend serves both the built web
// UI and the API on one local port; the window then loads that origin. Fully
// self-contained — no system Node required.
//
// This shell is built to be diagnosable on machines we can't see:
//   • everything is written to a log file in userData/logs/desktop.log
//   • the backend's stdout/stderr, exit code, and spawn errors are captured
//   • a free port is chosen automatically (so a port conflict can't break it)
//   • if the backend never comes up, the window shows a readable error page and
//     a dialog offers to open the log folder — instead of a blank window.
//
// Override for development: set BUDGETSMART_URL to load an already-running app
// (e.g. http://localhost:5173) and skip spawning the backend.
const { app, BrowserWindow, Menu, Tray, shell, nativeImage, dialog } = require("electron");
const { spawn } = require("node:child_process");
const { existsSync, mkdirSync, appendFileSync } = require("node:fs");
const net = require("node:net");
const path = require("node:path");
const os = require("node:os");

const ACCENT = "#00FF41";
const BLACK = "#000000";
const PREFERRED_PORT = Number(process.env.BUDGETSMART_PORT || 47615);
const DEV_URL = process.env.BUDGETSMART_URL || null;

/** @type {BrowserWindow | null} */ let mainWindow = null;
/** @type {Tray | null} */ let tray = null;
/** @type {import('node:child_process').ChildProcess | null} */ let backend = null;

let port = PREFERRED_PORT;
let appUrl = DEV_URL || `http://localhost:${port}/`;
let stderrTail = ""; // last chunk of backend stderr, surfaced in the error dialog
let backendExit = null; // { code, signal } once the child exits
let spawnError = null; // populated if spawn itself failed

// app-resources lives next to electron.js in the manual Windows pack
// (resources/app/app-resources) but under process.resourcesPath when packaged
// with electron-builder (Linux). Support both.
const resourcesBase = [path.join(__dirname, "app-resources"), path.join(process.resourcesPath || "", "app-resources")].find((p) => existsSync(p)) || path.join(__dirname, "app-resources");
const backendEntry = path.join(resourcesBase, "server", "dist", "index.js");
const webDist = path.join(resourcesBase, "web");

/* ------------------------------------------------------------------ *
 * Logging — to a file we can ask the user to send us.
 * ------------------------------------------------------------------ */
let logPath = null;
function logFilePath() {
  if (logPath) return logPath;
  try {
    const dir = path.join(app.getPath("userData"), "logs");
    mkdirSync(dir, { recursive: true });
    logPath = path.join(dir, "desktop.log");
  } catch {
    logPath = path.join(os.tmpdir(), "budgetsmart-desktop.log");
  }
  return logPath;
}
function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  try {
    appendFileSync(logFilePath(), line);
  } catch {
    /* ignore logging failures */
  }
  process.stdout.write(line);
}

/* ------------------------------------------------------------------ *
 * Pick a usable local port. Try the preferred one; if it's taken, ask
 * the OS for any free ephemeral port so a conflict can't block launch.
 * ------------------------------------------------------------------ */
function portIsFree(p) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once("error", () => resolve(false));
    srv.once("listening", () => srv.close(() => resolve(true)));
    srv.listen(p, "127.0.0.1");
  });
}
function ephemeralPort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const p = srv.address().port;
      srv.close(() => resolve(p));
    });
  });
}
async function choosePort() {
  if (await portIsFree(PREFERRED_PORT)) return PREFERRED_PORT;
  log(`port ${PREFERRED_PORT} is in use — falling back to an ephemeral port`);
  return ephemeralPort();
}

async function startBackend() {
  if (DEV_URL) {
    log(`dev mode: loading ${DEV_URL}, not spawning backend`);
    return;
  }

  // Sanity-check the bundle so a missing file is reported clearly, not as a
  // mystery timeout.
  if (!existsSync(backendEntry)) {
    spawnError = new Error(`Backend entry missing: ${backendEntry}`);
    log(`FATAL: ${spawnError.message}`);
    return;
  }
  const bundledNode = path.join(resourcesBase, process.platform === "win32" ? "node.exe" : "node");
  const haveBundledNode = existsSync(bundledNode);
  const nodeBin = haveBundledNode ? bundledNode : process.platform === "win32" ? "node.exe" : "node";
  if (!haveBundledNode) {
    log(`WARN: bundled node not found at ${bundledNode} — falling back to system 'node' on PATH`);
  }

  port = await choosePort();
  appUrl = `http://localhost:${port}/`;
  const dbFile = path.join(app.getPath("userData"), "app.db");

  log(`node:      ${nodeBin} (bundled=${haveBundledNode})`);
  log(`backend:   ${backendEntry}`);
  log(`web:       ${webDist}`);
  log(`db:        ${dbFile}`);
  log(`port:      ${port}`);
  log(`platform:  ${process.platform} ${process.arch} / electron ${process.versions.electron}`);

  try {
    backend = spawn(nodeBin, [backendEntry], {
      env: {
        ...process.env,
        PORT: String(port),
        WEB_DIST: webDist,
        DATABASE_FILE: dbFile,
        CORS_ORIGIN: `http://localhost:${port}`,
        JWT_SECRET: process.env.JWT_SECRET || "budgetsmart-desktop-local-secret",
        NODE_ENV: "production",
      },
      stdio: "pipe",
      windowsHide: true,
    });
  } catch (err) {
    spawnError = err;
    log(`FATAL: spawn threw: ${err && err.message}`);
    return;
  }

  backend.stdout?.on("data", (d) => log(`[api] ${String(d).trimEnd()}`));
  backend.stderr?.on("data", (d) => {
    const s = String(d);
    stderrTail = (stderrTail + s).slice(-4000);
    log(`[api:err] ${s.trimEnd()}`);
  });
  backend.on("error", (err) => {
    spawnError = err;
    log(`backend spawn error: ${err.message}`);
  });
  backend.on("exit", (code, signal) => {
    backendExit = { code, signal };
    log(`backend exited: code=${code} signal=${signal}`);
  });
}

const delay = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitForBackend() {
  if (DEV_URL) return true;
  for (let i = 0; i < 80; i++) {
    if (backendExit) return false; // it already crashed — stop waiting
    try {
      const res = await fetch(`http://localhost:${port}/health`);
      if (res.ok) {
        log(`backend healthy after ~${(i * 0.5).toFixed(1)}s`);
        return true;
      }
    } catch {
      /* not up yet */
    }
    await delay(500);
  }
  return false;
}

/* ------------------------------------------------------------------ *
 * Inline pages (no network needed): a splash while we wait, and an
 * error screen if the backend won't come up.
 * ------------------------------------------------------------------ */
function pageShell(body) {
  return (
    "data:text/html;charset=utf-8," +
    encodeURIComponent(
      `<!doctype html><html><head><meta charset="utf-8">
       <style>
         html,body{height:100%;margin:0;background:${BLACK};color:#e6e6e6;
           font-family:Consolas,"Cascadia Code",ui-monospace,monospace}
         .wrap{height:100%;display:flex;flex-direction:column;align-items:center;
           justify-content:center;text-align:center;padding:32px;box-sizing:border-box}
         h1{color:${ACCENT};font-size:20px;letter-spacing:.04em;margin:0 0 12px}
         p{max-width:620px;line-height:1.5;color:#b9b9b9}
         pre{max-width:640px;width:100%;text-align:left;background:#0c0c0c;border:1px solid #1f1f1f;
           border-radius:8px;padding:12px;overflow:auto;color:#ff7b7b;font-size:12px}
         .dot{display:inline-block;width:9px;height:9px;border-radius:50%;background:${ACCENT};
           margin-right:8px;animation:p 1s infinite alternate}
         @keyframes p{from{opacity:.25}to{opacity:1}}
       </style></head><body><div class="wrap">${body}</div></body></html>`,
    )
  );
}
function errorPage(detail) {
  const safe = String(detail || "").replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]));
  return pageShell(
    `<h1>BudgetSmart couldn't start its local server</h1>
     <p>The app installed correctly, but its background service didn't come up on this PC.
        The most common cause is security software blocking the bundled runtime. A full log
        was saved to:</p>
     <pre>${String(logFilePath()).replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]))}</pre>
     ${safe ? `<p>Details:</p><pre>${safe}</pre>` : ""}`,
  );
}

function diagnosis() {
  if (spawnError) return `Couldn't launch the runtime: ${spawnError.message}`;
  if (backendExit) return `The server process exited early (code ${backendExit.code}, signal ${backendExit.signal}).` + (stderrTail ? `\n\n${stderrTail.trim()}` : "");
  return "The server didn't respond in time." + (stderrTail ? `\n\n${stderrTail.trim()}` : "");
}

function showStartupError() {
  const detail = diagnosis();
  log(`startup failed — ${detail.replace(/\n+/g, " | ")}`);
  if (mainWindow) mainWindow.loadURL(errorPage(detail));
  const choice = dialog.showMessageBoxSync(mainWindow || undefined, {
    type: "error",
    title: "BudgetSmart",
    message: "BudgetSmart couldn't start its local server.",
    detail:
      `${detail}\n\n` +
      `This usually means antivirus/security software blocked the app's bundled runtime, ` +
      `or it was quarantined during install.\n\nA detailed log was saved at:\n${logFilePath()}`,
    buttons: ["Open log folder", "Close"],
    defaultId: 0,
    cancelId: 1,
    noLink: true,
  });
  if (choice === 0) shell.showItemInFolder(logFilePath());
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: BLACK,
    icon: path.join(__dirname, "icon.png"),
    show: false,
    titleBarStyle: "hidden",
    titleBarOverlay: { color: BLACK, symbolColor: ACCENT, height: 36 },
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.once("ready-to-show", () => mainWindow && mainWindow.show());
  if (DEV_URL) mainWindow.loadURL(appUrl);
  else mainWindow.loadFile(path.join(__dirname, "splash.html"));

  // If the real app origin fails to load (backend died mid-session), show the
  // error page rather than Chromium's blank "can't reach this site".
  mainWindow.webContents.on("did-fail-load", (_e, code, desc, url) => {
    if (url && url.startsWith("http://localhost") && code !== -3 /* not an abort */) {
      log(`did-fail-load ${code} ${desc} ${url}`);
      mainWindow && mainWindow.loadURL(errorPage(`${desc} (${code}) while loading ${url}\n\n${diagnosis()}`));
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(appUrl)) {
      shell.openExternal(url);
      return { action: "deny" };
    }
    return { action: "allow" };
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function focusApp() {
  if (!mainWindow) return createWindow();
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function buildMenu() {
  const isMac = process.platform === "darwin";
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      ...(isMac ? [{ role: "appMenu" }] : []),
      { label: "File", submenu: [isMac ? { role: "close" } : { role: "quit" }] },
      { role: "editMenu" },
      {
        label: "View",
        submenu: [{ role: "reload" }, { role: "togglefullscreen" }, { role: "toggleDevTools" }, { role: "resetZoom" }, { role: "zoomIn" }, { role: "zoomOut" }],
      },
      {
        label: "Help",
        submenu: [{ label: "Open log folder", click: () => shell.showItemInFolder(logFilePath()) }],
      },
      { role: "windowMenu" },
    ]),
  );
}

function buildTray() {
  const iconPath = path.join(__dirname, "icon.png");
  const icon = existsSync(iconPath)
    ? nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 })
    : nativeImage.createFromDataURL(
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      );
  tray = new Tray(icon);
  tray.setToolTip("BudgetSmart");
  tray.setContextMenu(Menu.buildFromTemplate([{ label: "Open BudgetSmart", click: focusApp }, { type: "separator" }, { label: "Quit", role: "quit" }]));
  tray.on("click", focusApp);
}

function stopBackend() {
  if (backend && !backend.killed) {
    backend.kill();
    backend = null;
  }
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", focusApp);

  app.whenReady().then(async () => {
    log(`=== BudgetSmart starting (v${app.getVersion()}) ===`);
    buildMenu();
    buildTray();
    await startBackend();
    createWindow();

    const ok = await waitForBackend();
    if (DEV_URL) return;
    if (ok) {
      log(`loading app at ${appUrl}`);
      mainWindow && mainWindow.loadURL(appUrl);
    } else {
      showStartupError();
    }

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on("window-all-closed", () => {
    stopBackend();
    if (process.platform !== "darwin") app.quit();
  });
  app.on("before-quit", stopBackend);
}
