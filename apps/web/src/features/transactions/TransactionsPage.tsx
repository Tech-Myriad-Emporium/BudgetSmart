import { TRANSACTION_TYPES, type Transaction, type TransactionType } from "@budgetsmart/shared";
import { useMemo, useState } from "react";
import { EmptyState, Money, Spinner } from "../../components/ui";
import { useAccounts, useCategories, useTransactions } from "../../lib/hooks";
import type { TransactionFilters } from "../../lib/api";
import { formatDateShort } from "../../lib/format";
import { TransactionModal } from "./TransactionModal";

export function TransactionsPage() {
  const [filters, setFilters] = useState<TransactionFilters>({ limit: 100, offset: 0 });
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Transaction | null>(null);

  const accountsQ = useAccounts();
  const categoriesQ = useCategories();
  const txQ = useTransactions({ ...filters, search: search.trim() || undefined });

  const accountName = useMemo(
    () => new Map((accountsQ.data ?? []).map((a) => [a.id, a.name])),
    [accountsQ.data],
  );
  const categoryById = useMemo(
    () => new Map((categoriesQ.data ?? []).map((c) => [c.id, c])),
    [categoriesQ.data],
  );

  function patch(p: Partial<TransactionFilters>) {
    setFilters((f) => ({ ...f, ...p, offset: 0 }));
  }

  const txns = txQ.data?.transactions ?? [];
  const accounts = accountsQ.data ?? [];
  const categories = categoriesQ.data ?? [];

  function openNew() {
    setEditing(null);
    setModalOpen(true);
  }
  function openEdit(t: Transaction) {
    setEditing(t);
    setModalOpen(true);
  }

  return (
    <div className="page">
      {/* toolbar */}
      <div className="card">
        <div className="row between wrap" style={{ gap: 12 }}>
          <div className="row wrap" style={{ gap: 10 }}>
            <input
              className="input"
              style={{ width: 220 }}
              placeholder="Search merchant or note…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select
              className="select"
              value={filters.type ?? ""}
              onChange={(e) => patch({ type: (e.target.value || undefined) as TransactionType | undefined })}
            >
              <option value="">All types</option>
              {TRANSACTION_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t[0]!.toUpperCase() + t.slice(1)}
                </option>
              ))}
            </select>
            <select
              className="select"
              value={filters.accountId ?? ""}
              onChange={(e) => patch({ accountId: e.target.value || undefined })}
            >
              <option value="">All accounts</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
            <select
              className="select"
              value={filters.categoryId ?? ""}
              onChange={(e) => patch({ categoryId: e.target.value || undefined })}
            >
              <option value="">All categories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.icon} {c.name}
                </option>
              ))}
            </select>
          </div>
          <button className="btn btn-primary" onClick={openNew} disabled={accounts.length === 0}>
            + Add
          </button>
        </div>
      </div>

      {/* ledger */}
      <div className="card" style={{ padding: 0 }}>
        {txQ.isLoading ? (
          <Spinner label="Loading transactions…" />
        ) : txns.length === 0 ? (
          <EmptyState
            title="No transactions match"
            hint={accounts.length === 0 ? "Add an account first." : "Try clearing filters or add one."}
          />
        ) : (
          <>
            <div className="row between" style={{ padding: "14px 20px" }}>
              <span className="card-title">
                {txQ.data?.total ?? txns.length} transaction{(txQ.data?.total ?? 0) === 1 ? "" : "s"}
              </span>
              <span className="faint text-xs">Click a row to edit</span>
            </div>
            <div className="divider" />
            <div className="ledger" style={{ padding: "4px 12px 12px" }}>
              {txns.map((t) => {
                const cat = t.categoryId ? categoryById.get(t.categoryId) : undefined;
                const sign = t.type === "income" ? "+" : t.type === "transfer" ? "" : "−";
                return (
                  <div className="ledger-row clickable" key={t.id} onClick={() => openEdit(t)}>
                    <span className="cat-icon" style={cat ? { borderColor: cat.color } : undefined}>
                      {t.type === "transfer" ? "⇄" : cat?.icon ?? "•"}
                    </span>
                    <div className="col" style={{ minWidth: 0 }}>
                      <div className="row gap-sm">
                        <span className="text-sm truncate" style={{ maxWidth: 280 }}>
                          {t.merchant || "(no merchant)"}
                        </span>
                        {t.pending && <span className="badge warn text-xs">pending</span>}
                        {t.excluded && <span className="badge text-xs">hidden</span>}
                      </div>
                      <span className="faint text-xs">
                        {formatDateShort(t.date)} · {accountName.get(t.accountId) ?? "—"}
                        {t.type === "transfer" && t.transferAccountId
                          ? ` → ${accountName.get(t.transferAccountId) ?? "—"}`
                          : cat
                            ? ` · ${cat.name}`
                            : ""}
                        {t.tags.length > 0 ? ` · ${t.tags.map((x) => `#${x}`).join(" ")}` : ""}
                      </span>
                    </div>
                    <span className={`stat ${sign === "+" ? "amount-pos" : ""}`}>
                      {sign}
                      <Money cents={t.amount} />
                    </span>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {modalOpen && (
        <TransactionModal
          accounts={accounts}
          categories={categories}
          existing={editing}
          onClose={() => setModalOpen(false)}
        />
      )}
    </div>
  );
}
