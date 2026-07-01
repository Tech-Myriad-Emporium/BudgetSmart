import { normalizeTierId } from "@budgetsmart/shared";
import jwt from "jsonwebtoken";
import { centralLink } from "../db/repo.js";

// Public half of the entitlement signing key. The central server signs tier
// tokens with the matching private key; we can only VERIFY here, never forge —
// so editing the local database can't grant a premium tier.
const ENTITLEMENT_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAqF1QmEp18T/SeSOUTMZw
jlPqsnT+yt5UsnJuADLwEYqQSpS9U9vShOjmyCcv96IYC1aZTIiWUepoYYY8XSny
peDMspsM4qj8KsGutuOa68S4LzqgPy86VTdkL0SNkcOcU2oEYKYg5etNFBuGf0lN
rRn9lIHGjeshMWzdF9twIHjKePzUUzJthkgUxk7NWs0T3X1oLxW+/184orulnmK6
bLJrK19aGQExapgsYiaOkoqO7ezlIEd6IArCVHoRoCcsHnLScpuVyUlP7N9eJLTB
bRBkuhLtxniavpAW7ge7QCa+pfb86MO06Z1IfJqMYzs9DLv4TkBrvIXfeyx2Stgz
ywIDAQAB
-----END PUBLIC KEY-----`;

export interface VerifiedEntitlement {
  tier: string;
  sub: string;
}

/** Verify a signed entitlement token. Returns null if invalid/expired/forged. */
export function verifyEntitlement(token: string, expectedSub?: string | null): VerifiedEntitlement | null {
  try {
    const d = jwt.verify(token, ENTITLEMENT_PUBLIC_KEY, { algorithms: ["RS256"] });
    if (typeof d === "string" || (d as jwt.JwtPayload).typ !== "entitlement" || !(d as jwt.JwtPayload).tier) return null;
    const payload = d as jwt.JwtPayload;
    if (expectedSub && payload.sub !== expectedSub) return null;
    return { tier: String(payload.tier), sub: String(payload.sub) };
  } catch {
    return null;
  }
}

/**
 * The tier this device is actually entitled to. Derived ONLY from a valid,
 * unexpired, signature-verified token bound to the linked account — never from
 * a raw DB column. Falls back to free `base` when there's no valid proof.
 */
export function effectiveTier(userId: string): string {
  const link = centralLink.get(userId);
  if (!link?.entToken) return "base";
  const v = verifyEntitlement(link.entToken, link.centralUserId);
  return v ? normalizeTierId(v.tier) : "base";
}
