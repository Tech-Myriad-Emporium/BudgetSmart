// Embed build/icon.ico into a Windows exe's resources (pure JS via resedit).
// Usage: node embed-icon.mjs <path-to-exe>
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as ResEdit from "resedit";

const here = path.dirname(fileURLToPath(import.meta.url));
const exePath = process.argv[2];
if (!exePath) {
  console.error("usage: node embed-icon.mjs <exe>");
  process.exit(1);
}
const icoPath = path.join(here, "build", "icon.ico");

const exe = ResEdit.NtExecutable.from(readFileSync(exePath));
const res = ResEdit.NtExecutableResource.from(exe);
const iconFile = ResEdit.Data.IconFile.from(readFileSync(icoPath));

ResEdit.Resource.IconGroupEntry.replaceIconsForResource(
  res.entries,
  1, // icon group id (the app's primary icon)
  1033, // en-US
  iconFile.icons.map((item) => item.data),
);

res.outputResource(exe);
writeFileSync(exePath, Buffer.from(exe.generate()));
console.log(`✓ embedded icon into ${path.basename(exePath)}`);
