// Upload a file to the BudgetSmart download bucket via the Worker's binding
// (multipart). Used by CI to publish installers and the APT repo.
// Usage: UPLOAD_TOKEN=... node scripts/r2-upload.mjs <file> <r2-key>
import { readFileSync } from "node:fs";

const API = process.env.API_BASE || "https://budgetsmart-api.budgetsmart.workers.dev";
const TOKEN = process.env.UPLOAD_TOKEN;
const [file, key] = process.argv.slice(2);
if (!file || !key || !TOKEN) {
  console.error("usage: UPLOAD_TOKEN=... node scripts/r2-upload.mjs <file> <r2-key>");
  process.exit(1);
}

const PART = 40 * 1024 * 1024;
const H = { "x-upload-token": TOKEN };
const buf = readFileSync(file);

const start = await (await fetch(`${API}/admin/mpu/start?key=${encodeURIComponent(key)}`, { method: "POST", headers: H })).json();
const parts = [];
let n = 1;
for (let off = 0; off < buf.length; off += PART, n++) {
  const chunk = buf.subarray(off, Math.min(off + PART, buf.length));
  const res = await fetch(`${API}/admin/mpu/part?key=${encodeURIComponent(key)}&uploadId=${encodeURIComponent(start.uploadId)}&part=${n}`, { method: "PUT", headers: H, body: chunk });
  const j = await res.json();
  if (!res.ok) { console.error("part failed", n, j); process.exit(1); }
  parts.push({ partNumber: j.partNumber, etag: j.etag });
}
const done = await (await fetch(`${API}/admin/mpu/complete`, { method: "POST", headers: { ...H, "Content-Type": "application/json" }, body: JSON.stringify({ key, uploadId: start.uploadId, parts }) })).json();
if (!done.ok) { console.error("complete failed", done); process.exit(1); }
console.log(`uploaded ${key} (${done.size} bytes)`);
