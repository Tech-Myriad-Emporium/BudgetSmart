import { formatMoney, parseMoney, type GoalStatus, type GoalWithProgress } from "@budgetsmart/shared";
import { useState } from "react";
import { EmptyState, Money, Spinner } from "../../components/ui";
import { useGoalMutations, useGoals } from "../../lib/hooks";
import { formatDateShort } from "../../lib/format";
import { GoalModal } from "./GoalModal";

const STATUS_META: Record<GoalStatus, { label: string; cls: string }> = {
  complete: { label: "✓ Reached", cls: "accent" },
  ahead: { label: "Ahead", cls: "accent" },
  "on-track": { label: "On track", cls: "accent" },
  behind: { label: "Behind", cls: "warn" },
  overdue: { label: "Overdue", cls: "danger" },
  "no-target-date": { label: "No deadline", cls: "" },
};

export function GoalsPage() {
  const goalsQ = useGoals();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<GoalWithProgress | null>(null);

  const summary = goalsQ.data;

  function openNew() {
    setEditing(null);
    setModalOpen(true);
  }
  function openEdit(g: GoalWithProgress) {
    setEditing(g);
    setModalOpen(true);
  }

  return (
    <div className="page">
      {/* summary */}
      <div className="card">
        <div className="row between wrap" style={{ gap: 16 }}>
          <div className="row" style={{ gap: 28 }}>
            <Stat label="Saved" value={formatMoney(summary?.totalSaved ?? 0)} tone="accent" />
            <Stat label="Target" value={formatMoney(summary?.totalTarget ?? 0)} />
            <Stat label="Remaining" value={formatMoney(summary?.totalRemaining ?? 0)} />
            <Stat label="Active" value={String(summary?.activeCount ?? 0)} />
            <Stat label="Reached" value={String(summary?.completedCount ?? 0)} tone="accent" />
          </div>
          <button className="btn btn-primary" onClick={openNew}>
            + New goal
          </button>
        </div>
      </div>

      {goalsQ.isLoading ? (
        <Spinner label="Loading goals…" />
      ) : !summary || summary.goals.length === 0 ? (
        <div className="card">
          <EmptyState icon="🎯" title="No goals yet" hint="Create your first goal to start tracking progress." />
        </div>
      ) : (
        <div className="grid grid-2">
          {summary.goals.map((g) => (
            <GoalCard key={g.id} goal={g} onEdit={() => openEdit(g)} />
          ))}
        </div>
      )}

      {modalOpen && <GoalModal existing={editing} onClose={() => setModalOpen(false)} />}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "accent" }) {
  return (
    <div className="col">
      <span className="label">{label}</span>
      <span className={`stat stat-lg ${tone ?? ""}`}>{value}</span>
    </div>
  );
}

function GoalCard({ goal, onEdit }: { goal: GoalWithProgress; onEdit: () => void }) {
  const { contribute } = useGoalMutations();
  const [amount, setAmount] = useState("");
  const c = goal.computed;
  const status = STATUS_META[c.status];
  const pct = Math.round(c.progress * 100);

  function addContribution() {
    const cents = parseMoney(amount);
    if (!cents || cents === 0) return;
    contribute.mutate({ id: goal.id, amount: cents });
    setAmount("");
  }

  return (
    <div className={`card ${c.complete ? "flash" : ""}`} style={c.complete ? { borderColor: goal.color, boxShadow: `0 0 16px ${goal.color}55` } : undefined}>
      <div className="row" style={{ gap: 16, alignItems: "flex-start" }}>
        <Ring progress={c.progress} color={goal.color} icon={goal.icon} />

        <div className="col grow" style={{ gap: 6, minWidth: 0 }}>
          <div className="row between">
            <span className="text-sm truncate" style={{ fontWeight: 600 }}>
              {goal.name}
            </span>
            <span className={`badge ${status.cls}`}>{status.label}</span>
          </div>

          <div className="row gap-sm" style={{ alignItems: "baseline" }}>
            <Money cents={goal.currentAmount} className="stat-lg" />
            <span className="faint text-xs">/ {formatMoney(goal.targetAmount)}</span>
          </div>

          <div className="faint text-xs">
            {c.complete ? (
              <span className="accent">Goal reached — nice work.</span>
            ) : c.requiredMonthly != null ? (
              <>
                {formatMoney(c.requiredMonthly)}/mo to hit {goal.targetDate ? formatDateShort(goal.targetDate) : "target"}
                {c.monthsRemaining != null && c.monthsRemaining >= 0 ? ` · ${c.monthsRemaining} mo left` : ""}
              </>
            ) : c.projectedDate ? (
              <>On pace for {formatDateShort(c.projectedDate)} at {formatMoney(goal.monthlyContribution)}/mo</>
            ) : (
              <>{formatMoney(c.remaining)} to go</>
            )}
          </div>
        </div>
      </div>

      <div className="divider" style={{ margin: "14px 0" }} />

      <div className="row between gap-sm">
        {c.complete ? (
          <span className="badge accent">{pct}% · {formatMoney(c.remaining)} remaining</span>
        ) : (
          <div className="row gap-sm grow">
            <div className="input-prefix" style={{ width: 110 }}>
              <span>$</span>
              <input
                className="input mono btn-sm"
                style={{ padding: "6px 10px 6px 22px" }}
                inputMode="decimal"
                placeholder="add"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addContribution()}
              />
            </div>
            <button className="btn btn-primary btn-sm" onClick={addContribution} disabled={contribute.isPending}>
              {contribute.isPending ? <span className="ring" /> : "Contribute"}
            </button>
          </div>
        )}
        <button className="btn btn-ghost btn-sm" onClick={onEdit}>
          Edit
        </button>
      </div>
    </div>
  );
}

/** Radial progress ring with the goal icon in the center. */
function Ring({ progress, color, icon }: { progress: number; color: string; icon: string }) {
  const size = 72;
  const stroke = 7;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const dash = Math.min(progress, 1) * circ;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flex: "none" }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#161616" strokeWidth={stroke} />
      <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circ - dash}`}
          style={{ filter: `drop-shadow(0 0 4px ${color}aa)`, transition: "stroke-dasharray .4s cubic-bezier(.4,0,.2,1)" }}
        />
      </g>
      <text x="50%" y="46%" textAnchor="middle" dominantBaseline="central" fontSize="20">
        {icon}
      </text>
      <text x="50%" y="72%" textAnchor="middle" dominantBaseline="central" fontSize="11" fontWeight="600" fill="#fff" className="num">
        {Math.round(progress * 100)}%
      </text>
    </svg>
  );
}
