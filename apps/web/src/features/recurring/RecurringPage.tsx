import { CADENCE_LABELS, formatMoney, type RecurringItem, type UpcomingCharge } from "@budgetsmart/shared";
import { EmptyState, Money, Spinner } from "../../components/ui";
import { useRecurring } from "../../lib/hooks";
import { formatDateShort } from "../../lib/format";

export function RecurringPage() {
  const recurringQ = useRecurring();
  const data = recurringQ.data;

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
                <RecurringRow key={it.key} item={it} />
              ))}
            </div>
          </div>

          {/* upcoming */}
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
        </div>
      )}
    </div>
  );
}

function RecurringRow({ item }: { item: RecurringItem }) {
  return (
    <div className="ledger-row" style={{ gridTemplateColumns: "34px 1fr auto" }}>
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
