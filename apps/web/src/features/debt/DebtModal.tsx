import {
  DEBT_KINDS,
  DEBT_KIND_LABELS,
  categoryPalette,
  parseMoney,
  type Debt,
  type DebtKind,
} from "@budgetsmart/shared";
import { useState, type FormEvent } from "react";
import { ApiError, type DebtInput } from "../../lib/api";
import { useDebtMutations } from "../../lib/hooks";
import { ErrorText, Field, Modal } from "../../components/ui";

const KIND_ICON: Record<DebtKind, string> = {
  credit_card: "💳",
  student_loan: "🎓",
  auto: "🚗",
  personal: "💵",
  medical: "🩺",
  mortgage: "🏠",
  other: "📄",
};

export function DebtModal({ existing, onClose }: { existing?: Debt | null; onClose: () => void }) {
  const { create, update, remove } = useDebtMutations();
  const editing = !!existing;

  const [name, setName] = useState(existing?.name ?? "");
  const [kind, setKind] = useState<DebtKind>(existing?.kind ?? "credit_card");
  const [icon, setIcon] = useState(existing?.icon ?? "💳");
  const [color, setColor] = useState(existing?.color ?? "#FF0033");
  const [balance, setBalance] = useState(existing ? String(existing.balance / 100) : "");
  const [apr, setApr] = useState(existing ? String(existing.aprBps / 100) : "");
  const [minimum, setMinimum] = useState(existing ? String(existing.minimumPayment / 100) : "");
  const [error, setError] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!name.trim()) return setError("Give the debt a name.");
    const balanceCents = parseMoney(balance);
    if (balanceCents == null || balanceCents < 0) return setError("Enter a valid balance.");
    const aprNum = Number(apr);
    if (Number.isNaN(aprNum) || aprNum < 0) return setError("Enter a valid APR.");

    const input: DebtInput = {
      name: name.trim(),
      kind,
      icon: icon.trim() || KIND_ICON[kind],
      color,
      balance: balanceCents,
      aprBps: Math.round(aprNum * 100),
      minimumPayment: parseMoney(minimum) ?? 0,
    };

    try {
      if (editing && existing) await update.mutateAsync({ id: existing.id, input });
      else await create.mutateAsync(input);
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save debt.");
    }
  }

  async function onDelete() {
    if (!existing || !confirm(`Delete "${existing.name}"?`)) return;
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
      title={editing ? "Edit debt" : "New debt"}
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
            <button type="submit" form="debt-form" className="btn btn-primary" disabled={busy}>
              {busy ? <span className="ring" /> : editing ? "Save" : "Add"}
            </button>
          </div>
        </>
      }
    >
      <form id="debt-form" className="col gap-lg" onSubmit={submit}>
        <div className="row gap-sm">
          <Field label="Icon">
            <input className="input" style={{ width: 64, textAlign: "center" }} value={icon} onChange={(e) => setIcon(e.target.value)} maxLength={4} />
          </Field>
          <div className="grow">
            <Field label="Name">
              <input className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Visa Card" />
            </Field>
          </div>
        </div>

        <Field label="Type">
          <select
            className="select"
            value={kind}
            onChange={(e) => {
              const k = e.target.value as DebtKind;
              setKind(k);
              if (!editing) setIcon(KIND_ICON[k]);
            }}
          >
            {DEBT_KINDS.map((k) => (
              <option key={k} value={k}>
                {DEBT_KIND_LABELS[k]}
              </option>
            ))}
          </select>
        </Field>

        <div className="grid grid-2" style={{ gap: 12 }}>
          <Field label="Balance owed">
            <div className="input-prefix">
              <span>$</span>
              <input className="input mono" inputMode="decimal" placeholder="0.00" value={balance} onChange={(e) => setBalance(e.target.value)} />
            </div>
          </Field>
          <Field label="APR %" hint="annual rate">
            <input className="input mono" inputMode="decimal" placeholder="19.99" value={apr} onChange={(e) => setApr(e.target.value)} />
          </Field>
        </div>

        <Field label="Minimum payment" hint="per month">
          <div className="input-prefix">
            <span>$</span>
            <input className="input mono" inputMode="decimal" placeholder="0.00" value={minimum} onChange={(e) => setMinimum(e.target.value)} />
          </div>
        </Field>

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

        <ErrorText>{error}</ErrorText>
      </form>
    </Modal>
  );
}
