import { FEATURES, TIERS, type Feature } from "@budgetsmart/shared";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useEntitlements } from "../lib/hooks";
import { Spinner } from "./ui";

/** The lowest-priced tier that unlocks a given feature (for the upgrade prompt). */
function minTierForFeature(feature: Feature) {
  const eligible = TIERS.filter((t) => (feature.familyOnly ? t.group === "family" : true) && t.level >= feature.level);
  return eligible.sort((a, b) => a.priceCents - b.priceCents)[0] ?? TIERS[0]!;
}

/**
 * Renders `children` only when the current plan grants `feature`; otherwise
 * shows an upgrade prompt pointing at the required tier. The backend enforces
 * the same rule, so this is UX, not the security boundary.
 */
export function FeatureGate({ feature, children }: { feature: string; children: ReactNode }) {
  const { has, loading, tier } = useEntitlements();

  if (loading) {
    return (
      <div className="page">
        <Spinner label="Checking your plan…" />
      </div>
    );
  }
  if (has(feature)) return <>{children}</>;

  const def = FEATURES.find((f) => f.key === feature);
  const required = def ? minTierForFeature(def) : TIERS[0]!;

  return (
    <div className="page">
      <div className="card" style={{ borderColor: "var(--border-accent)", boxShadow: "var(--shadow-glow)", textAlign: "center", padding: "48px 24px" }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>🔒</div>
        <h2 style={{ margin: "0 0 6px" }}>{def?.label ?? "This feature"} is locked</h2>
        <p className="faint" style={{ maxWidth: 460, margin: "0 auto 4px" }}>
          {def?.description ?? "This feature isn't part of your current plan."}
        </p>
        <p className="faint text-sm" style={{ marginBottom: 20 }}>
          You're on <span className="accent">{tier?.name ?? "your plan"}</span>. Unlock it with{" "}
          <span className="accent">{required.name}</span> and up.
        </p>
        <Link className="btn btn-primary" to="/plans">
          ⤒ View plans
        </Link>
      </div>
    </div>
  );
}
