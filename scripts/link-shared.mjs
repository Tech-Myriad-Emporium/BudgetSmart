// Make @budgetsmart/shared available to backend & web.
//
// NOTE: this repo lives on a FAT32 volume (the E: drive), which cannot create
// symlinks, junctions, or reparse points — so npm workspaces and fs.symlink all
// fail with EISDIR/EPERM here. The only reliable option is to COPY the built
// shared package into each consumer's node_modules. Re-run after changing shared
// (the `build:shared` and `setup` scripts do this for you).
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(root, "..");
const sharedDir = path.join(repo, "shared");
const sharedDist = path.join(sharedDir, "dist");

if (!existsSync(sharedDist)) {
  console.error("shared/dist not found — run `npm run build:shared` first.");
  process.exit(1);
}

const targets = [
  path.join(repo, "backend", "node_modules", "@budgetsmart", "shared"),
  path.join(repo, "apps", "web", "node_modules", "@budgetsmart", "shared"),
  path.join(repo, "apps", "marketing", "node_modules", "@budgetsmart", "shared"),
];

for (const dest of targets) {
  mkdirSync(path.dirname(dest), { recursive: true });
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dest, { recursive: true });
  // Only the files needed for resolution: package manifest + compiled output.
  cpSync(path.join(sharedDir, "package.json"), path.join(dest, "package.json"));
  cpSync(sharedDist, path.join(dest, "dist"), { recursive: true });
  console.log(`copied shared -> ${path.relative(repo, dest)}`);
}
