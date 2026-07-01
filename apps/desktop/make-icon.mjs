// Generate a multi-resolution Windows icon (build/icon.ico) from build/icon.png.
// Pure JS (jimp + to-ico) — no native binaries.
import Jimp from "jimp";
import { writeFileSync } from "node:fs";
import path from "node:path";
import toIco from "to-ico";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const src = path.join(here, "build", "icon.png");
const out = path.join(here, "build", "icon.ico");
const sizes = [256, 128, 64, 48, 32, 24, 16];

const base = await Jimp.read(src);
const buffers = [];
for (const s of sizes) {
  const img = base.clone().resize(s, s);
  buffers.push(await img.getBufferAsync(Jimp.MIME_PNG));
}
const ico = await toIco(buffers);
writeFileSync(out, ico);
console.log(`✓ wrote build/icon.ico (${sizes.join(",")}) — ${ico.length} bytes`);
