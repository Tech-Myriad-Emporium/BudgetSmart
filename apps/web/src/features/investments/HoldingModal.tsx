import { ASSET_CLASSES, ASSET_CLASS_LABELS, parseMoney, type AssetClass, type Holding } from "@budgetsmart/shared";
import { useState, type FormEvent } from "react";
import { ApiError, type HoldingInput } from "../../lib/api";
import { useHoldingMutations } from "../../lib/hooks";
import { ErrorText, Field, Modal } from "../../components/ui";

export function HoldingModal({ existing, onClose }: { existing?: Holding | null; onClose: () => void }) {
  const { create, update, remove } = useHoldingMutations();
  const editing = !!existing;

  const [name, setName] = useState(existing?.name ?? "");
  const [symbol, setSymbol] = useState(existing?.symbol ?? "");
  const [assetClass, setAssetClass] = useState<AssetClass>(existing?.assetClass ?? "stock");
  const [accountLabel, setAccountLabel] = useState(existing?.accountLabel ?? "Brokerage");
  const [quantity, setQuantity] = useState(existing ? String(existing.quantity) : "");
  const [cost, setCost] = useState(existing ? String(existing.costBasis / 100) : "");
  const [price, setPrice] = useState(existing ? String(existing.currentPrice / 100) : "");
  const [error, setError] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!name.trim()) return setError("Give the holding a name.");
    const qty = Number(quantity);
    if (Number.isNaN(qty) || qty <= 0) return setError("Quantity must be greater than zero.");

    const input: HoldingInput = {
      name: name.trim(),
      symbol: symbol.trim().toUpperCase(),
      assetClass,
      accountLabel: accountLabel.trim() || "Brokerage",
      quantity: qty,
      costBasis: parseMoney(cost) ?? 0,
      currentPrice: parseMoney(price) ?? 0,
    };

    try {
      if (editing && existing) await update.mutateAsync({ id: existing.id, input });
      else await create.mutateAsync(input);
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save holding.");
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
      title={editing ? "Edit holding" : "New holding"}
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
            <button type="submit" form="holding-form" className="btn btn-primary" disabled={busy}>
              {busy ? <span className="ring" /> : editing ? "Save" : "Add"}
            </button>
          </div>
        </>
      }
    >
      <form id="holding-form" className="col gap-lg" onSubmit={submit}>
        <div className="row gap-sm">
          <Field label="Symbol">
            <input className="input mono" style={{ width: 90, textTransform: "uppercase" }} value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder="AAPL" maxLength={12} />
          </Field>
          <div className="grow">
            <Field label="Name">
              <input className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Apple Inc." />
            </Field>
          </div>
        </div>

        <div className="grid grid-2" style={{ gap: 12 }}>
          <Field label="Asset class">
            <select className="select" value={assetClass} onChange={(e) => setAssetClass(e.target.value as AssetClass)}>
              {ASSET_CLASSES.map((a) => (
                <option key={a} value={a}>
                  {ASSET_CLASS_LABELS[a]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Account">
            <input className="input" value={accountLabel} onChange={(e) => setAccountLabel(e.target.value)} placeholder="Roth IRA" />
          </Field>
        </div>

        <div className="grid grid-3" style={{ gap: 12 }}>
          <Field label="Quantity">
            <input className="input mono" inputMode="decimal" value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="10" />
          </Field>
          <Field label="Cost basis" hint="total paid">
            <div className="input-prefix">
              <span>$</span>
              <input className="input mono" inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="0.00" />
            </div>
          </Field>
          <Field label="Price / unit">
            <div className="input-prefix">
              <span>$</span>
              <input className="input mono" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0.00" />
            </div>
          </Field>
        </div>

        <ErrorText>{error}</ErrorText>
      </form>
    </Modal>
  );
}
