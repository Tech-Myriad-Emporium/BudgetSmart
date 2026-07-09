import { formatMoney, type ScheduledCharge, type ScheduledChargeInput } from "@budgetsmart/shared";
import { useState } from "react";
import { useAccounts, useCategories, useSchedule, useScheduleMutations } from "../../lib/hooks";

const todayIso = () => new Date().toISOString().slice(0, 10);

const TYPE_LABEL: Record<ScheduledCharge["type"], string> = {
  recurring: "Repeats",
  once: "One-time",
  custom: "Custom",
};

function describe(c: ScheduledCharge): string {
  if (c.type === "once") return `on ${c.nextDate}`;
  if (c.type === "custom") return `every ${c.intervalDays} days · next ${c.nextDate}`;
  return `${c.cadence} · next ${c.nextDate}`;
}

/** Add / edit / remove scheduled charges: recurring, one-time or custom
 *  interval, pinned to exact dates. Auto-post makes them real transactions. */
export function ScheduleManager() {
  const chargesQ = useSchedule();
  const { create, update, remove } = useScheduleMutations();
  const [editing, setEditing] = useState<ScheduledCharge | "new" | null>(null);

  const charges = chargesQ.data ?? [];

  return (
    <div className="card">
      <div className="row between wrap" style={{ marginBottom: charges.length > 0 ? 12 : 0 }}>
        <div>
          <div className="card-title">Scheduled charges</div>
          <div className="faint text-xs" style={{ marginTop: 4 }}>
            Bills, income and one-offs on the dates you choose. Auto-post adds them to your transactions automatically.
          </div>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => setEditing("new")}>+ Schedule a charge</button>
      </div>

      {charges.length > 0 && (
        <div className="ledger">
          {charges.map((c) => (
            <div className="ledger-row clickable" key={c.id} onClick={() => setEditing(c)}>
              <span className="cat-icon">{c.icon}</span>
              <div className="col" style={{ minWidth: 0 }}>
                <span className="text-sm truncate">
                  {c.name} {!c.active && <span className="badge" style={{ marginLeft: 6 }}>done</span>}
                </span>
                <span className="faint text-xs">
                  {TYPE_LABEL[c.type]} · {describe(c)}
                  {c.autoPost ? " · auto-posts" : ""}
                </span>
              </div>
              <span className={`num text-sm ${c.direction === "income" ? "amount-pos" : ""}`}>
                {c.direction === "income" ? "+" : "−"}{formatMoney(c.amount)}
              </span>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <ChargeModal
          charge={editing === "new" ? null : editing}
          busy={create.isPending || update.isPending || remove.isPending}
          onSave={(input) => {
            const done = { onSuccess: () => setEditing(null) };
            if (editing === "new") create.mutate(input, done);
            else update.mutate({ id: editing.id, input }, done);
          }}
          onDelete={editing === "new" ? undefined : () => remove.mutate(editing.id, { onSuccess: () => setEditing(null) })}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function ChargeModal({
  charge,
  busy,
  onSave,
  onDelete,
  onClose,
}: {
  charge: ScheduledCharge | null;
  busy: boolean;
  onSave: (input: ScheduledChargeInput) => void;
  onDelete?: () => void;
  onClose: () => void;
}) {
  const accountsQ = useAccounts();
  const categoriesQ = useCategories();
  const [name, setName] = useState(charge?.name ?? "");
  const [amount, setAmount] = useState(charge ? (charge.amount / 100).toFixed(2) : "");
  const [type, setType] = useState<ScheduledCharge["type"]>(charge?.type ?? "recurring");
  const [cadence, setCadence] = useState<NonNullable<ScheduledCharge["cadence"]>>(charge?.cadence ?? "monthly");
  const [intervalDays, setIntervalDays] = useState(String(charge?.intervalDays ?? 30));
  const [nextDate, setNextDate] = useState(charge?.nextDate ?? todayIso());
  const [endDate, setEndDate] = useState(charge?.endDate ?? "");
  const [direction, setDirection] = useState<"expense" | "income">(charge?.direction ?? "expense");
  const [autoPost, setAutoPost] = useState(charge?.autoPost ?? true);
  const [categoryId, setCategoryId] = useState(charge?.categoryId ?? "");
  const [accountId, setAccountId] = useState(charge?.accountId ?? "");
  const [err, setErr] = useState<string | null>(null);

  function submit() {
    const cents = Math.round((parseFloat(amount) || 0) * 100);
    if (!name.trim()) { setErr("Give it a name."); return; }
    if (cents <= 0) { setErr("Enter an amount above zero."); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(nextDate)) { setErr("Pick a date."); return; }
    setErr(null);
    onSave({
      name: name.trim(),
      icon: direction === "income" ? "💵" : "🧾",
      amount: cents,
      direction,
      type,
      cadence: type === "recurring" ? cadence : null,
      intervalDays: type === "custom" ? Math.max(1, parseInt(intervalDays, 10) || 30) : null,
      nextDate,
      endDate: endDate || null,
      categoryId: categoryId || null,
      accountId: accountId || null,
      autoPost,
    });
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">{charge ? "Edit scheduled charge" : "Schedule a charge"}</span>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>

        <div className="col" style={{ gap: 14 }}>
          <div className="seg" role="radiogroup" aria-label="Charge type" style={{ alignSelf: "flex-start" }}>
            {(["recurring", "once", "custom"] as const).map((t) => (
              <button key={t} className={`seg-btn ${type === t ? "on" : ""}`} onClick={() => setType(t)}>
                {t === "recurring" ? "Recurring" : t === "once" ? "One-time" : "Custom"}
              </button>
            ))}
          </div>

          <div className="field">
            <span className="label">Name</span>
            <input className="input" placeholder="e.g. Rent, Gym, Paycheck" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>

          <div className="row gap-sm">
            <div className="field grow">
              <span className="label">Amount</span>
              <div className="input-prefix">
                <span>$</span>
                <input className="input mono" inputMode="decimal" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </div>
            </div>
            <div className="field">
              <span className="label">Direction</span>
              <div className="seg">
                <button className={`seg-btn ${direction === "expense" ? "on" : ""}`} onClick={() => setDirection("expense")}>Charge</button>
                <button className={`seg-btn ${direction === "income" ? "on" : ""}`} onClick={() => setDirection("income")}>Income</button>
              </div>
            </div>
          </div>

          <div className="row gap-sm wrap">
            <div className="field grow">
              <span className="label">{type === "once" ? "Date" : "First / next date"}</span>
              <input className="input" type="date" value={nextDate} onChange={(e) => setNextDate(e.target.value)} />
            </div>
            {type === "recurring" && (
              <div className="field grow">
                <span className="label">Repeats</span>
                <select className="select" value={cadence} onChange={(e) => setCadence(e.target.value as typeof cadence)}>
                  <option value="weekly">Weekly</option>
                  <option value="biweekly">Every 2 weeks</option>
                  <option value="monthly">Monthly</option>
                  <option value="yearly">Yearly</option>
                </select>
              </div>
            )}
            {type === "custom" && (
              <div className="field grow">
                <span className="label">Every N days</span>
                <input className="input mono" inputMode="numeric" value={intervalDays} onChange={(e) => setIntervalDays(e.target.value)} />
              </div>
            )}
            {type !== "once" && (
              <div className="field grow">
                <span className="label">Ends (optional)</span>
                <input className="input" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </div>
            )}
          </div>

          <div className="row gap-sm wrap">
            <div className="field grow">
              <span className="label">Category (optional)</span>
              <select className="select" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                <option value="">—</option>
                {(categoriesQ.data ?? []).map((c) => (
                  <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
                ))}
              </select>
            </div>
            <div className="field grow">
              <span className="label">Account (optional)</span>
              <select className="select" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                <option value="">First active account</option>
                {(accountsQ.data ?? []).map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>
          </div>

          <label className="row gap-sm text-sm" style={{ cursor: "pointer" }}>
            <input type="checkbox" checked={autoPost} onChange={(e) => setAutoPost(e.target.checked)} />
            Auto-post — add it to my transactions when the date arrives
          </label>

          {err && <span className="danger text-sm">{err}</span>}

          <div className="row between" style={{ marginTop: 4 }}>
            {onDelete ? (
              <button className="btn btn-ghost btn-danger btn-sm" onClick={onDelete} disabled={busy}>Delete</button>
            ) : <span />}
            <div className="row gap-sm">
              <button className="btn" onClick={onClose} disabled={busy}>Cancel</button>
              <button className="btn btn-primary" onClick={submit} disabled={busy}>{busy ? "Saving…" : "Save"}</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
