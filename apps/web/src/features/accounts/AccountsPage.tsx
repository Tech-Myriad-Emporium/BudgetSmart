import {
  ACCOUNT_TYPES,
  ACCOUNT_TYPE_LABELS,
  LIABILITY_ACCOUNT_TYPES,
  parseMoney,
  sumCents,
  type AccountType,
} from "@budgetsmart/shared";
import { useState, type FormEvent } from "react";
import { EmptyState, ErrorText, Field, Modal, Money, Spinner } from "../../components/ui";
import { useAccountMutations, useAccounts } from "../../lib/hooks";
import { ApiError } from "../../lib/api";

export function AccountsPage() {
  const accountsQ = useAccounts();
  const { remove } = useAccountMutations();
  const [adding, setAdding] = useState(false);

  const accounts = accountsQ.data ?? [];
  const assets = sumCents(accounts.filter((a) => !LIABILITY_ACCOUNT_TYPES.has(a.type)).map((a) => a.balance));
  const liabilities = sumCents(accounts.filter((a) => LIABILITY_ACCOUNT_TYPES.has(a.type)).map((a) => a.balance));

  return (
    <div className="page">
      <div className="grid grid-3">
        <div className="card">
          <span className="card-title">Assets</span>
          <div className="stat stat-lg accent" style={{ marginTop: 8 }}>
            <Money cents={assets} />
          </div>
        </div>
        <div className="card">
          <span className="card-title">Liabilities</span>
          <div className="stat stat-lg danger" style={{ marginTop: 8 }}>
            <Money cents={liabilities} />
          </div>
        </div>
        <div className="card">
          <span className="card-title">Net worth</span>
          <div className="stat stat-lg" style={{ marginTop: 8 }}>
            <Money cents={assets - liabilities} colorize />
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <div className="row between" style={{ padding: "16px 20px" }}>
          <span className="card-title">All accounts</span>
          <button className="btn btn-primary btn-sm" onClick={() => setAdding(true)}>
            + Add account
          </button>
        </div>
        <div className="divider" />

        {accountsQ.isLoading ? (
          <Spinner label="Loading accounts…" />
        ) : accounts.length === 0 ? (
          <EmptyState title="No accounts yet" hint="Add your first account to start tracking." />
        ) : (
          <div className="ledger" style={{ padding: "4px 12px 12px" }}>
            {accounts.map((a) => {
              const isLiability = LIABILITY_ACCOUNT_TYPES.has(a.type);
              return (
                <div className="ledger-row" key={a.id}>
                  <span className="cat-icon">{ICONS[a.type]}</span>
                  <div className="col" style={{ minWidth: 0 }}>
                    <span className="text-sm">{a.name}</span>
                    <span className="faint text-xs">
                      {ACCOUNT_TYPE_LABELS[a.type]}
                      {isLiability ? " · owed" : ""}
                    </span>
                  </div>
                  <div className="row gap-sm">
                    <Money cents={a.balance} colorize={!isLiability} className={isLiability ? "danger" : ""} />
                    <button
                      className="btn btn-ghost btn-sm btn-danger"
                      onClick={() => {
                        if (confirm(`Delete "${a.name}"? Its transactions are removed too.`)) remove.mutate(a.id);
                      }}
                      title="Delete account"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {adding && <AddAccountModal onClose={() => setAdding(false)} />}
    </div>
  );
}

const ICONS: Record<AccountType, string> = {
  cash: "💵",
  checking: "🏦",
  savings: "🐷",
  credit: "💳",
  loan: "📉",
};

function AddAccountModal({ onClose }: { onClose: () => void }) {
  const { create } = useAccountMutations();
  const [name, setName] = useState("");
  const [type, setType] = useState<AccountType>("checking");
  const [opening, setOpening] = useState("");
  const [error, setError] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!name.trim()) return setError("Give the account a name.");
    try {
      await create.mutateAsync({
        name: name.trim(),
        type,
        openingBalance: parseMoney(opening) ?? 0,
      });
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create account.");
    }
  }

  return (
    <Modal
      title="New account"
      onClose={onClose}
      footer={
        <>
          <span />
          <div className="row gap-sm">
            <button className="btn btn-ghost" onClick={onClose} disabled={create.isPending}>
              Cancel
            </button>
            <button type="submit" form="acct-form" className="btn btn-primary" disabled={create.isPending}>
              {create.isPending ? <span className="ring" /> : "Create"}
            </button>
          </div>
        </>
      }
    >
      <form id="acct-form" className="col gap-lg" onSubmit={submit}>
        <Field label="Name">
          <input className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Everyday Checking" />
        </Field>
        <Field label="Type">
          <select className="select" value={type} onChange={(e) => setType(e.target.value as AccountType)}>
            {ACCOUNT_TYPES.map((t) => (
              <option key={t} value={t}>
                {ACCOUNT_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </Field>
        <Field
          label={LIABILITY_ACCOUNT_TYPES.has(type) ? "Amount owed" : "Opening balance"}
          hint={LIABILITY_ACCOUNT_TYPES.has(type) ? "Current balance owed on this account." : "Balance when you start tracking."}
        >
          <div className="input-prefix">
            <span>$</span>
            <input className="input mono" inputMode="decimal" placeholder="0.00" value={opening} onChange={(e) => setOpening(e.target.value)} />
          </div>
        </Field>
        <ErrorText>{error}</ErrorText>
      </form>
    </Modal>
  );
}
