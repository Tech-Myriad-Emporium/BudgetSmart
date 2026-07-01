import {
  GOAL_TYPES,
  GOAL_TYPE_LABELS,
  categoryPalette,
  parseMoney,
  type GoalType,
  type GoalWithProgress,
} from "@budgetsmart/shared";
import { useState, type FormEvent } from "react";
import { ApiError, type GoalInput } from "../../lib/api";
import { useGoalMutations } from "../../lib/hooks";
import { ErrorText, Field, Modal } from "../../components/ui";

const TYPE_ICON: Record<GoalType, string> = {
  savings: "🎯",
  debt: "💳",
  investment: "📈",
  custom: "⭐",
};

export function GoalModal({ existing, onClose }: { existing?: GoalWithProgress | null; onClose: () => void }) {
  const { create, update, remove } = useGoalMutations();
  const editing = !!existing;

  const [name, setName] = useState(existing?.name ?? "");
  const [type, setType] = useState<GoalType>(existing?.type ?? "savings");
  const [icon, setIcon] = useState(existing?.icon ?? "🎯");
  const [color, setColor] = useState(existing?.color ?? categoryPalette[0]);
  const [target, setTarget] = useState(existing ? String(existing.targetAmount / 100) : "");
  const [current, setCurrent] = useState(existing ? String(existing.currentAmount / 100) : "0");
  const [targetDate, setTargetDate] = useState(existing?.targetDate ?? "");
  const [monthly, setMonthly] = useState(existing ? String(existing.monthlyContribution / 100) : "");
  const [note, setNote] = useState(existing?.note ?? "");
  const [error, setError] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!name.trim()) return setError("Give your goal a name.");
    const targetCents = parseMoney(target);
    if (!targetCents || targetCents <= 0) return setError("Target must be greater than zero.");

    const input: GoalInput = {
      name: name.trim(),
      type,
      icon: icon.trim() || TYPE_ICON[type],
      color,
      targetAmount: targetCents,
      currentAmount: parseMoney(current) ?? 0,
      targetDate: targetDate || null,
      monthlyContribution: parseMoney(monthly) ?? 0,
      note: note.trim() || null,
    };

    try {
      if (editing && existing) await update.mutateAsync({ id: existing.id, input });
      else await create.mutateAsync(input);
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save goal.");
    }
  }

  async function onDelete() {
    if (!existing) return;
    if (!confirm(`Delete "${existing.name}"?`)) return;
    try {
      await remove.mutateAsync(existing.id);
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not delete.");
    }
  }

  const busy = create.isPending || update.isPending || remove.isPending;

  return (
    <Modal
      title={editing ? "Edit goal" : "New goal"}
      onClose={onClose}
      footer={
        <>
          {editing ? (
            <button type="button" className="btn btn-ghost btn-danger" onClick={onDelete} disabled={busy}>
              Delete
            </button>
          ) : (
            <span />
          )}
          <div className="row gap-sm">
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button type="submit" form="goal-form" className="btn btn-primary" disabled={busy}>
              {busy ? <span className="ring" /> : editing ? "Save" : "Create"}
            </button>
          </div>
        </>
      }
    >
      <form id="goal-form" className="col gap-lg" onSubmit={submit}>
        <div className="row gap-sm">
          {GOAL_TYPES.map((t) => (
            <button
              type="button"
              key={t}
              className={`btn btn-sm grow ${type === t ? "btn-primary" : ""}`}
              onClick={() => {
                setType(t);
                if (!editing) setIcon(TYPE_ICON[t]);
              }}
            >
              {GOAL_TYPE_LABELS[t]}
            </button>
          ))}
        </div>

        <div className="row gap-sm">
          <Field label="Icon">
            <input
              className="input"
              style={{ width: 64, textAlign: "center" }}
              value={icon}
              onChange={(e) => setIcon(e.target.value)}
              maxLength={4}
            />
          </Field>
          <div className="grow">
            <Field label="Name">
              <input className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Emergency Fund" />
            </Field>
          </div>
        </div>

        <Field label="Color">
          <div className="row gap-sm" style={{ flexWrap: "wrap" }}>
            {categoryPalette.map((c) => (
              <button
                type="button"
                key={c}
                onClick={() => setColor(c)}
                aria-label={`color ${c}`}
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 8,
                  background: c,
                  border: color === c ? "2px solid #fff" : "2px solid transparent",
                  boxShadow: color === c ? `0 0 10px ${c}` : "none",
                  cursor: "pointer",
                }}
              />
            ))}
          </div>
        </Field>

        <div className="grid grid-2" style={{ gap: 12 }}>
          <Field label="Target amount">
            <div className="input-prefix">
              <span>$</span>
              <input className="input mono" inputMode="decimal" placeholder="0.00" value={target} onChange={(e) => setTarget(e.target.value)} />
            </div>
          </Field>
          <Field label="Saved so far">
            <div className="input-prefix">
              <span>$</span>
              <input className="input mono" inputMode="decimal" placeholder="0.00" value={current} onChange={(e) => setCurrent(e.target.value)} />
            </div>
          </Field>
        </div>

        <div className="grid grid-2" style={{ gap: 12 }}>
          <Field label="Target date" hint="optional">
            <input type="date" className="input mono" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
          </Field>
          <Field label="Planned / month" hint="optional">
            <div className="input-prefix">
              <span>$</span>
              <input className="input mono" inputMode="decimal" placeholder="0.00" value={monthly} onChange={(e) => setMonthly(e.target.value)} />
            </div>
          </Field>
        </div>

        <Field label="Note" hint="optional">
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>

        <ErrorText>{error}</ErrorText>
      </form>
    </Modal>
  );
}
