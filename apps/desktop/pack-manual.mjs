// Manual Electron packaging — assembles the distributable without electron-packager
// (which hangs in its extract step on this FAT32 box). Electron is already extracted
// in node_modules/electron/dist, so we just copy the runtime, rename the exe, and
// drop our app into resources/app.
import { cpSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as ResEdit from "resedit";

const here = path.dirname(fileURLToPath(import.meta.url));
const electronDist = path.join(here, "node_modules", "electron", "dist");
const outDir = path.join(here, "dist-exe", "BudgetSmart-win32-x64");
const appDir = path.join(outDir, "resources", "app");

if (!existsSync(path.join(electronDist, "electron.exe"))) {
  console.error("electron.exe not found in", electronDist);
  process.exit(1);
}
if (!existsSync(path.join(here, "app-resources", "server", "dist", "index.js"))) {
  console.error("app-resources not staged — run `node stage.mjs` first.");
  process.exit(1);
}

console.log("1/5 cleaning output…");
rmSync(path.join(here, "dist-exe"), { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

console.log("2/5 copying Electron runtime (~180MB)…");
cpSync(electronDist, outDir, { recursive: true });

console.log("3/6 renaming electron.exe → BudgetSmart.exe…");
const exePath = path.join(outDir, "BudgetSmart.exe");
renameSync(path.join(outDir, "electron.exe"), exePath);

console.log("4/6 embedding app icon into the exe…");
const icoPath = path.join(here, "build", "icon.ico");
if (existsSync(icoPath)) {
  const exe = ResEdit.NtExecutable.from(readFileSync(exePath));
  const res = ResEdit.NtExecutableResource.from(exe);
  const iconFile = ResEdit.Data.IconFile.from(readFileSync(icoPath));
  ResEdit.Resource.IconGroupEntry.replaceIconsForResource(res.entries, 1, 1033, iconFile.icons.map((i) => i.data));
  res.outputResource(exe);
  writeFileSync(exePath, Buffer.from(exe.generate()));
} else {
  console.warn("  build/icon.ico missing — run `node make-icon.mjs` first. Using default icon.");
}

console.log("5/6 dropping app into resources/app…");
rmSync(path.join(outDir, "resources", "default_app.asar"), { force: true });
mkdirSync(appDir, { recursive: true });
for (const f of ["electron.js", "preload.js", "package.json"]) {
  cpSync(path.join(here, f), path.join(appDir, f));
}
// Runtime icon for the window / tray.
if (existsSync(path.join(here, "build", "icon.png"))) {
  cpSync(path.join(here, "build", "icon.png"), path.join(appDir, "icon.png"));
}

console.log("6/6 copying app-resources (web + backend, ~156MB)…");
cpSync(path.join(here, "app-resources"), path.join(appDir, "app-resources"), { recursive: true });

console.log("✓ packaged:", exePath);
