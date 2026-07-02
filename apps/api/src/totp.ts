// RFC 6238 TOTP (authenticator-app 2FA) using Web Crypto — no dependencies.
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function generateSecret(bytes = 20): string {
  const buf = crypto.getRandomValues(new Uint8Array(bytes));
  let bits = "";
  for (const b of buf) bits += b.toString(2).padStart(8, "0");
  let out = "";
  for (let i = 0; i + 5 <= bits.length; i += 5) out += B32[parseInt(bits.slice(i, i + 5), 2)];
  return out;
}

function base32Decode(s: string): Uint8Array {
  const clean = s.replace(/=+$/, "").replace(/\s+/g, "").toUpperCase();
  let bits = "";
  for (const c of clean) {
    const v = B32.indexOf(c);
    if (v < 0) continue;
    bits += v.toString(2).padStart(5, "0");
  }
  const out: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8), 2));
  return new Uint8Array(out);
}

async function hotp(secret: Uint8Array, counter: number): Promise<string> {
  const buf = new ArrayBuffer(8);
  new DataView(buf).setUint32(4, counter); // low 32 bits (ample until year ~4000)
  const key = await crypto.subtle.importKey("raw", secret as BufferSource, { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, buf));
  const offset = sig[sig.length - 1]! & 0xf;
  const code = (((sig[offset]! & 0x7f) << 24) | (sig[offset + 1]! << 16) | (sig[offset + 2]! << 8) | sig[offset + 3]!) % 1_000_000;
  return code.toString().padStart(6, "0");
}

/** Verify a 6-digit token, allowing ±`window` 30s steps for clock drift. */
export async function verifyTotp(secretB32: string, token: string, window = 1): Promise<boolean> {
  const cleaned = (token || "").replace(/\s+/g, "");
  if (!/^\d{6}$/.test(cleaned)) return false;
  const secret = base32Decode(secretB32);
  const step = Math.floor(Date.now() / 1000 / 30);
  for (let w = -window; w <= window; w++) {
    if ((await hotp(secret, step + w)) === cleaned) return true;
  }
  return false;
}

export function otpauthUri(email: string, secret: string): string {
  const label = encodeURIComponent(`BudgetSmart:${email}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=BudgetSmart&period=30&digits=6&algorithm=SHA1`;
}
