import { CADENCE_LABELS, CADENCES, formatMoney, parseMoney, type Cadence, type RecurringItem, type UpcomingCharge } from "@budgetsmart/shared";
import { useState } from "react";
import { EmptyState, Money, Spinner } from "../../components/ui";
import { useRecurring, useRecurringOverrides } from "../../lib/hooks";
import { formatDateShort } from "../../lib/format";

/** Manually mark a merchant as recurring (for charges detection can't see yet). */
function AddRecurringForm() {
  const { set } = useRecurringOverrides();
  const [merchant, setMerchant] = useState("");
  const [amount, setAmount] = useState("");
  const [cadence, setCadence] = useState<Cadence>("monthly");

  function add() {
    const cents = parseMoney(amount);
    if (!merchant.trim() || !cents || cents <= 0) return;
    set.mutate(
      { merchant: merchant.trim(), mode: "always", cadence, amount: cents },
      { onSuccess: () => { setMerchant(""); setAmount(""); } },
    );
  }

  return (
    <div className="card">
      <span className="card-title">Didn't find one? Add it yourself</span>
      <div className="row gap-sm wrap" style={{ marginTop: 12 }}>
        <input className="input btn-sm" style={{ flex: 1, minWidth: 150 }} placeholder="Merchant (e.g. Gym membership)" value={merchant}
          onChange={(e) => setMerchant(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
        <div className="input-prefix" style={{ width: 100 }}>
          <span>$</span>
          <input className="input mono btn-sm" style={{ padding: "6px 8px 6px 22px", width: "100%" }} inputMode="decimal" placeholder="9.99" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <select className="select btn-sm" style={{ width: 120 }} value={cadence} onChange={(e) => setCadence(e.target.value as Cadence)}>
          {CADENCES.map((c) => <option key={c} value={c}>{CADENCE_LABELS[c]}</option>)}
        </select>
        <button className="btn btn-primary btn-sm" onClick={add} disabled={set.isPending || !merchant.trim()}>+ Track it</button>
      </div>
      <div className="faint text-xs" style={{ marginTop: 8 }}>
        Shows up in Recurring, the Calendar and your Forecast — even before there's transaction history.
      </div>
    </div>
  );
}

export function RecurringPage() {
  const recurringQ = useRecurring();
  const { set, remove } = useRecurringOverrides();
  const data = recurringQ.data?.summary;
  const ignored = (recurringQ.data?.overrides ?? []).filter((o) => o.mode === "never");

  return (
    <div className="page">
      {/* summary */}
      <div className="grid grid-3">
        <div className="card">
          <span className="card-title">Recurring · monthly</span>
          <div className="stat stat-xl danger" style={{ marginTop: 10 }}>
            <Money cents={data?.totalMonthly ?? 0} />
          </div>
          <div className="faint text-xs" style={{ marginTop: 8 }}>
            <Money cents={data?.totalAnnual ?? 0} className="text-xs" /> / year
          </div>
        </div>
        <div className="card">
          <span className="card-title">Subscriptions</span>
          <div className="stat stat-xl accent" style={{ marginTop: 10 }}>
            {data?.subscriptionCount ?? 0}
          </div>
          <div className="faint text-xs" style={{ marginTop: 8 }}>
            <Money cents={data?.subscriptionMonthly ?? 0} className="text-xs" />/mo on subscriptions
          </div>
        </div>
        <div className="card">
          <span className="card-title">Upcoming · 45 days</span>
          <div className="stat stat-xl" style={{ marginTop: 10 }}>
            {data?.upcoming.length ?? 0}
          </div>
          <div className="faint text-xs" style={{ marginTop: 8 }}>
            charges expected soon
          </div>
        </div>
      </div>

      {recurringQ.isLoading || !data ? (
        <Spinner label="Scanning for patterns…" />
      ) : data.items.length === 0 ? (
        <div className="card">
          <EmptyState icon="🔁" title="No recurring charges detected yet" hint="Add a few months of transactions and patterns will surface here." />
        </div>
      ) : (
        <div className="grid grid-dash">
          {/* detected recurring */}
          <div className="card" style={{ padding: 0 }}>
            <div className="row between" style={{ padding: "16px 20px" }}>
              <span className="card-title">Detected recurring</span>
              <span className="faint text-xs">{data.items.length} found</span>
            </div>
            <div className="divider" />
            <div className="ledger" style={{ padding: "4px 12px 12px" }}>
              {data.items.map((it) => (
                <RecurringRow key={it.key} item={it} onIgnore={() => set.mutate({ merchant: it.merchant, mode: "never" })} />
              ))}
            </div>
            {ignored.length > 0 && (
              <div style={{ padding: "0 20px 16px" }}>
                <span className="faint text-xs">Ignored: </span>
                {ignored.map((o) => (
                  <button key={o.key} className="chip" style={{ cursor: "pointer", marginRight: 6 }} title="Click to detect this merchant again"
                    onClick={() => remove.mutate(o.key)}>
                    {o.merchant ?? o.key} ↺
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* upcoming */}
          <div className="col gap-md">
            <div className="card">
              <span className="card-title">Upcoming charges</span>
              <div className="col" style={{ marginTop: 12 }}>
                {data.upcoming.length === 0 ? (
                  <span className="faint text-sm">Nothing due in the next 45 days.</span>
                ) : (
                  data.upcoming.map((u) => <UpcomingRow key={`${u.key}-${u.date}`} charge={u} />)
                )}
              </div>
            </div>
            <AddRecurringForm />
          </div>
        </div>
      )}
    </div>
  );
}

function RecurringRow({ item, onIgnore }: { item: RecurringItem; onIgnore: () => void }) {
  return (
    <div className="ledger-row" style={{ gridTemplateColumns: "34px 1fr auto auto" }}>
      <span className="cat-icon" style={{ borderColor: item.color }}>
        {item.icon}
      </span>
      <div className="col" style={{ minWidth: 0 }}>
        <div className="row gap-sm">
          <span className="text-sm truncate" style={{ maxWidth: 180 }}>{item.merchant}</span>
          {item.isSubscription && <span className="badge accent text-xs">subscription</span>}
        </div>
        <span className="faint text-xs">
          {CADENCE_LABELS[item.cadence]} · next {formatDateShort(item.nextDate)} · {item.occurrences}× seen ·{" "}
          {Math.round(item.confidence * 100)}% sure
        </span>
      </div>
      <div className="col" style={{ alignItems: "flex-end" }}>
        <Money cents={item.typicalAmount} className="text-sm" />
        <span className="faint text-xs">{formatMoney(item.monthlyCost)}/mo</span>
      </div>
      <button className="btn btn-ghost btn-sm" onClick={onIgnore} title="Not recurring — stop tracking this merchant">✕</button>
    </div>
  );
}

function UpcomingRow({ charge }: { charge: UpcomingCharge }) {
  const soon = charge.daysAway <= 3;
  return (
    <div className="row between" style={{ padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
      <div className="row gap-sm" style={{ minWidth: 0 }}>
        <span className="cat-icon" style={{ width: 30, height: 30, borderColor: charge.color, fontSize: 14 }}>
          {charge.icon}
        </span>
        <div className="col" style={{ minWidth: 0 }}>
          <span className="text-sm truncate" style={{ maxWidth: 150 }}>{charge.merchant}</span>
          <span className={`text-xs ${soon ? "warn" : "faint"}`}>
            {formatDateShort(charge.date)} · {charge.daysAway === 0 ? "today" : `in ${charge.daysAway}d`}
          </span>
        </div>
      </div>
      <Money cents={charge.amount} className="text-sm" />
    </div>
  );
}
