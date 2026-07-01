// Generate social + favicon PNGs from the app logo (raster — social scrapers
// don't render SVG). Outputs into public/. Run: node make-og.mjs
import Jimp from "jimp";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const logoPath = path.resolve(here, "..", "desktop", "build", "icon.png");
const pub = path.join(here, "public");

const logo = await Jimp.read(logoPath);

// --- Open Graph / Twitter card: 1200x630 ---
const og = new Jimp(1200, 630, 0x000000ff);
og.composite(logo.clone().resize(400, 400), 90, 115);
const f64 = await Jimp.loadFont(Jimp.FONT_SANS_64_WHITE);
const f32 = await Jimp.loadFont(Jimp.FONT_SANS_32_WHITE);
og.print(f64, 560, 175, "BudgetSmart");
og.print(f32, 565, 275, "Money, leveled up.");
og.print(f32, 565, 345, "Budgets, goals, debt payoff, investing");
og.print(f32, 565, 470, "budgetsmarttme.com");
await og.writeAsync(path.join(pub, "og.png"));
console.log("✓ og.png (1200x630)");

// --- Favicons / touch icons ---
for (const [name, size] of [
  ["favicon-16.png", 16],
  ["favicon-32.png", 32],
  ["apple-touch-icon.png", 180],
  ["icon-512.png", 512],
]) {
  await logo.clone().resize(size, size).writeAsync(path.join(pub, name));
  console.log(`✓ ${name} (${size}x${size})`);
}
