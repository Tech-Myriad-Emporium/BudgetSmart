// Adversarial test suite against the LIVE hardened Worker. Read-mostly, but it
// deliberately trips defenses (lockout, honeypot). Cleanup runs afterward.
const API = "https://budgetsmart-api.budgetsmart.workers.dev";
const results = [];
const ok = (name, cond, extra = "") => { results.push({ name, pass: !!cond, extra }); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function j(path, opts = {}) {
  const res = await fetch(`${API}${path}`, opts);
  let body = null;
  try { body = await res.json(); } catch { /* non-json */ }
  return { status: res.status, headers: res.headers, body };
}

// ---- 0. Legit flows still work (must not have broken anything) ----
{
  const h = await j("/health");
  ok("legit: /health 200", h.status === 200 && h.body?.status === "ok");
  const v = await j("/version");
  ok("legit: /version 200", v.status === 200 && !!v.body?.version);
  const m = await j("/market/summary");
  ok("legit: /market/summary 200 (site ticker)", m.status === 200 && Array.isArray(m.body?.quotes));
  const login = await j("/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "trialtest@example.com", password: "testpass1234" }) });
  ok("legit: valid login returns token", login.status === 200 && typeof login.body?.token === "string", `status ${login.status}`);
}

// ---- 1. Security headers ----
{
  const r = await j("/");
  const H = r.headers;
  ok("headers: HSTS present", (H.get("strict-transport-security") || "").includes("max-age=63072000"));
  ok("headers: X-Content-Type-Options nosniff", H.get("x-content-type-options") === "nosniff");
  ok("headers: X-Frame-Options DENY", H.get("x-frame-options") === "DENY");
  ok("headers: CSP locked", (H.get("content-security-policy") || "").includes("default-src 'none'"));
  ok("headers: Referrer-Policy no-referrer", H.get("referrer-policy") === "no-referrer");
  ok("headers: no x-powered-by leak", !H.get("x-powered-by"));
}

// ---- 2. AuthN bypass attempts ----
{
  ok("authz: /me no token -> 401", (await j("/me")).status === 401);
  ok("authz: /me garbage token -> 401", (await j("/me", { headers: { Authorization: "Bearer not.a.jwt" } })).status === 401);
  // structurally valid JWT signed with the wrong key
  const forged = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9." + btoa(JSON.stringify({ sub: "hacker", exp: 9999999999 })).replace(/=/g, "") + ".AAAA";
  ok("authz: forged JWT -> 401", (await j("/me", { headers: { Authorization: `Bearer ${forged}` } })).status === 401);
  ok("authz: /entitlement no token -> 401", (await j("/entitlement")).status === 401);
}

// ---- 3. Admin surface must be gated ----
{
  ok("admin: /admin/security/events no token -> 401", (await j("/admin/security/events")).status === 401);
  ok("admin: /admin/security/status no token -> 401", (await j("/admin/security/status")).status === 401);
  ok("admin: /admin/orders no token -> 401", (await j("/admin/orders")).status === 401);
  ok("admin: lockdown toggle no token -> 401", (await j("/admin/security/lockdown", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{\"on\":true}" })).status === 401);
  ok("admin: wrong token -> 401", (await j("/admin/security/events", { headers: { "x-upload-token": "wrong" } })).status === 401);
}

// ---- 4. Injection & malformed input ----
{
  const sqli = await j("/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "' OR '1'='1' --", password: "x" }) });
  ok("inject: SQLi login -> 401 (not bypassed/500)", sqli.status === 401, `status ${sqli.status}`);
  const notjson = await j("/auth/login", { method: "POST", headers: { "Content-Type": "text/plain" }, body: "this is not json <script>alert(1)</script>" });
  ok("malformed: non-JSON body handled (400/401, not 500)", notjson.status === 400 || notjson.status === 401, `status ${notjson.status}`);
  const big = "A".repeat(2_000_000);
  const oversized = await j("/orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "x@y.com", name: big, seats: 6, items: ["core"] }) });
  ok("oversized: 2MB body not a 500", oversized.status !== 500, `status ${oversized.status}`);
}

// ---- 5. CORS: disallowed origin gets no ACAO ----
{
  const r = await fetch(`${API}/health`, { headers: { Origin: "https://evil.example.com" } });
  const acao = r.headers.get("access-control-allow-origin");
  ok("cors: evil origin not allowed", !acao || acao === "" || acao === "https://budgetsmarttme.com", `acao=${acao}`);
}

// ---- 6. Brute-force lockout (same email, escalating) ----
{
  let locked = false;
  let firstLockAt = 0;
  for (let i = 1; i <= 8; i++) {
    const r = await j("/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "attacker@test.invalid", password: `wrong${i}` }) });
    if (r.status === 429) { locked = true; firstLockAt = firstLockAt || i; }
  }
  ok("bruteforce: account locks out (429) after repeated fails", locked, `firstLockAt=${firstLockAt}`);
}

// ---- 7. Honeypot -> IP block enforcement (LAST: blocks our own IP) ----
{
  const hp = await j("/.env");
  ok("honeypot: /.env -> 404 bland", hp.status === 404);
  await wait(400); // let the block write land
  const after = await j("/orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "x@y.com", seats: 6, items: ["core"] }) });
  ok("honeypot: subsequent mutating request from tripped IP -> 403", after.status === 403, `status ${after.status}`);
}

// ---- report ----
const passed = results.filter((r) => r.pass).length;
for (const r of results) console.log(`${r.pass ? "PASS" : "FAIL"}  ${r.name}${r.extra ? "  (" + r.extra + ")" : ""}`);
console.log(`\n${passed}/${results.length} checks passed`);
process.exit(passed === results.length ? 0 : 1);
