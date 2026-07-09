// Stage everything the packaged app needs into apps/desktop/app-resources/:
//   web/            built web UI (apps/web/dist)
//   server/dist     compiled backend
//   server/node_modules + package.json   backend runtime deps (incl. @budgetsmart/shared)
import { cpSync, mkdirSync, rmSync, existsSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import os from "node:os";
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
// own Node lacks node:sqlite). Normally we copy the Node running this script.
// When CROSS-building (e.g. a macOS x64 dmg on an Apple-Silicon runner), the
// bundled runtime must match the TARGET arch — so we fetch the exact Node for
// it. This removes any dependency on the retiring macos-13 Intel CI runners.
const nodeName = path.basename(process.execPath); // "node" (posix) | "node.exe" (win)
const targetArch = process.env.STAGE_NODE_ARCH;
if (targetArch && targetArch !== process.arch && process.platform === "darwin") {
  const ver = process.version; // e.g. v24.3.0
  const base = `node-${ver}-darwin-${targetArch}`;
  const url = `https://nodejs.org/dist/${ver}/${base}.tar.gz`;
  console.log(`staging cross-arch Node runtime (${base})…`);
  const tmp = path.join(os.tmpdir(), `stage-node-${targetArch}`);
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  const tgz = path.join(tmp, "node.tar.gz");
  const resp = await fetch(url);
  if (!resp.ok) {
    console.error(`Failed to download ${url}: HTTP ${resp.status}`);
    process.exit(1);
  }
  writeFileSync(tgz, Buffer.from(await resp.arrayBuffer()));
  execSync(`tar -xzf "${tgz}" -C "${tmp}"`, { stdio: "inherit" });
  cpSync(path.join(tmp, base, "bin", "node"), path.join(res, nodeName));
} else {
  console.log("staging node runtime…");
  cpSync(process.execPath, path.join(res, nodeName));
}

console.log("✓ staged app-resources");
