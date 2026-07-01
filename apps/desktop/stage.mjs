// Stage everything the packaged app needs into apps/desktop/app-resources/:
//   web/            built web UI (apps/web/dist)
//   server/dist     compiled backend
//   server/node_modules + package.json   backend runtime deps (incl. @budgetsmart/shared)
import { cpSync, mkdirSync, rmSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "..", "..");
const res = path.join(here, "app-resources");

const must = (p, label) => {
  if (!existsSync(p)) {
    console.error(`Missing ${label}: ${p} — build it first.`);
    process.exit(1);
  }
};
must(path.join(repo, "apps", "web", "dist", "index.html"), "web build");
must(path.join(repo, "backend", "dist", "index.js"), "backend build");
must(path.join(repo, "backend", "node_modules", "@budgetsmart", "shared", "dist", "index.js"), "backend shared copy");

rmSync(res, { recursive: true, force: true });
mkdirSync(path.join(res, "server"), { recursive: true });

console.log("staging web…");
cpSync(path.join(repo, "apps", "web", "dist"), path.join(res, "web"), { recursive: true });
console.log("staging backend dist…");
cpSync(path.join(repo, "backend", "dist"), path.join(res, "server", "dist"), { recursive: true });
cpSync(path.join(repo, "backend", "package.json"), path.join(res, "server", "package.json"));
console.log("staging backend node_modules (this is the slow part)…");
cpSync(path.join(repo, "backend", "node_modules"), path.join(res, "server", "node_modules"), { recursive: true });

// Bundle the Node runtime so the installed app needs no system Node (Electron's
// own Node lacks node:sqlite). Copies the Node that's running this script.
console.log("staging node.exe runtime…");
cpSync(process.execPath, path.join(res, path.basename(process.execPath)));

console.log("✓ staged app-resources");
