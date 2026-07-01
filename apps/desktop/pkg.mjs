import { packager } from "@electron/packager";

try {
  const out = await packager({
    dir: ".",
    name: "BudgetSmart",
    platform: "win32",
    arch: "x64",
    out: "dist-exe",
    asar: false,
    overwrite: true,
    electronVersion: "33.4.11",
    prune: false,
    ignore: [/^\/node_modules($|\/)/, /^\/dist-exe($|\/)/, /^\/stage\.mjs$/, /^\/pkg\.mjs$/, /^\/README\.md$/],
  });
  console.log("WROTE:", out);
} catch (err) {
  console.error("PACKAGER ERROR:", err && err.stack ? err.stack : err);
  process.exit(1);
}
