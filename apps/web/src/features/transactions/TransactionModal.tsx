import {
  TRANSACTION_TYPES,
  formatMoney,
  parseMoney,
  type Account,
  type Category,
  type Transaction,
  type TransactionType,
} from "@budgetsmart/shared";
import { useState, type FormEvent } from "react";
import { ApiError, type TransactionInput } from "../../lib/api";
import { useTransactionMutations } from "../../lib/hooks";
import { todayIso } from "../../lib/format";
import { ErrorText, Field, Modal } from "../../components/ui";

const TYPE_LABEL: Record<TransactionType, string> = {
  expense: "Expense",
  income: "Income",
  transfer: "Transfer",
};

export interface TransactionDraft {
  merchant?: string;
  amount?: number; // cents
  date?: string;
  tags?: string[];
}

export function TransactionModal({
  accounts,
  categories,
  existing,
  draft,
  onClose,
}: {
  accounts: Account[];
  categories: Category[];
  existing?: Transaction | null;
  draft?: TransactionDraft | null;
  onClose: () => void;
}) {
  const { create, update, remove } = useTransactionMutations();
  const editing = !!existing;

  const [type, setType] = useState<TransactionType>(existing?.type ?? "expense");
  const [amount, setAmount] = useState(existing ? String(existing.amount / 100) : draft?.amount ? String(draft.amount / 100) : "");
  const [merchant, setMerchant] = useState(existing?.merchant ?? draft?.merchant ?? "");
  const [accountId, setAccountId] = useState(existing?.accountId ?? accounts[0]?.id ?? "");
  const [transferAccountId, setTransferAccountId] = useState(
    existing?.transferAccountId ?? accounts[1]?.id ?? "",
  );
  const [categoryId, setCategoryId] = useState<string>(existing?.categoryId ?? "");
  const [date, setDate] = useState(existing?.date ?? draft?.date ?? todayIso());
  const [note, setNote] = useState(existing?.note ?? "");
  const [tags, setTags] = useState((existing?.tags ?? draft?.tags ?? []).join(", "));
  const [error, setError] = useState("");

  const relevantCategories = categories.filter((c) =>
    type === "income" ? c.kind === "income" : c.kind === "expense",
  );

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    const cents = parseMoney(amount);
    if (!cents || cents <= 0) return setError("Enter an amount greater than zero.");
    if (type === "transfer" && transferAccountId === accountId) {
      return setError("Transfer needs a different destination account.");
    }

    const input: TransactionInput = {
      accountId,
      transferAccountId: type === "transfer" ? transferAccountId : null,
      categoryId: type === "transfer" ? null : categoryId || null,
      type,
      amount: cents,
      merchant: merchant.trim(),
      note: note.trim() || null,
      date,
      tags: tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
    };

    try {
      if (editing && existing) await update.mutateAsync({ id: existing.id, input });
      else await create.mutateAsync(input);
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save transaction.");
    }
  }

  async function onDelete() {
    if (!existing) return;
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
      title={editing ? "Edit transaction" : "New transaction"}
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
            <button type="submit" form="tx-form" className="btn btn-primary" disabled={busy}>
              {busy ? <span className="ring" /> : editing ? "Save" : "Add"}
            </button>
          </div>
        </>
      }
    >
      <form id="tx-form" className="col gap-lg" onSubmit={submit}>
        {/* type selector */}
        <div className="row gap-sm">
          {TRANSACTION_TYPES.map((t) => (
            <button
              type="button"
              key={t}
              className={`btn btn-sm grow ${type === t ? "btn-primary" : ""}`}
              onClick={() => setType(t)}
            >
              {TYPE_LABEL[t]}
            </button>
          ))}
        </div>

        <div className="grid grid-2" style={{ gap: 12 }}>
          <Field label="Amount">
            <div className="input-prefix">
              <span>$</span>
              <input
                className="input mono"
                inputMode="decimal"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                autoFocus
              />
            </div>
          </Field>
          <Field label="Date">
            <input type="date" className="input mono" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
        </div>

        <Field label="Merchant / description">
          <input
            className="input"
            placeholder="e.g. Whole Foods"
            value={merchant}
            onChange={(e) => setMerchant(e.target.value)}
          />
        </Field>

        <Field label={type === "transfer" ? "From account" : "Account"}>
          <select className="select" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} · {formatMoney(a.balance)}
              </option>
            ))}
          </select>
        </Field>

        {type === "transfer" ? (
          <Field label="To account">
            <select
              className="select"
              value={transferAccountId}
              onChange={(e) => setTransferAccountId(e.target.value)}
            >
              {accounts
                .filter((a) => a.id !== accountId)
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
            </select>
          </Field>
        ) : (
          <Field label="Category">
            <select className="select" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">— Uncategorized —</option>
              {relevantCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.icon} {c.name}
                </option>
              ))}
            </select>
          </Field>
        )}

        <div className="grid grid-2" style={{ gap: 12 }}>
          <Field label="Note">
            <input className="input" value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
          <Field label="Tags" hint="comma separated">
            <input className="input" placeholder="date-night, online" value={tags} onChange={(e) => setTags(e.target.value)} />
          </Field>
        </div>

        <ErrorText>{error}</ErrorText>
      </form>
    </Modal>
  );
}
