import { formatMoney, type ForecastSummary, type GoalsSummary, type RecurringSummary, type ScheduledCharge } from "@budgetsmart/shared";
import { useState } from "react";
import { EmptyState, Money, Spinner } from "../../components/ui";
import { useEntitlements, useForecast, useGoals, useRecurring, useSchedule } from "../../lib/hooks";
import { ScheduleManager } from "./ScheduleManager";

interface CalEvent {
  kind: "bill" | "income" | "goal";
  icon: string;
  label: string;
  amount: number | null;
}

const DAY = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Collect events per ISO date for the visible month. */
function collectEvents(
  monthStart: Date,
  recurring: RecurringSummary | undefined,
  forecast: ForecastSummary | undefined,
  goals: GoalsSummary | undefined,
  scheduled: ScheduledCharge[] | undefined,
): Map<string, CalEvent[]> {
  const events = new Map<string, CalEvent[]>();
  const push = (date: string, e: CalEvent) => (events.get(date) ?? events.set(date, []).get(date)!).push(e);
  const y = monthStart.getUTCFullYear();
  const m = monthStart.getUTCMonth();
  const first = Date.UTC(y, m, 1);
  const nextMonth = Date.UTC(y, m + 1, 1);

  // bills: roll every recurring item's schedule across the visible month
  for (const item of recurring?.items ?? []) {
    let ms = Date.parse(item.nextDate + "T00:00:00Z");
    // walk backward slightly so bills earlier in the visible month still show
    const stepDays = item.cadence === "weekly" ? 7 : item.cadence === "biweekly" ? 14 : item.cadence === "monthly" ? 30 : 365;
    while (ms - stepDays * DAY >= first) ms -= stepDays * DAY;
    while (ms < nextMonth) {
      if (ms >= first) push(iso(ms), { kind: "bill", icon: item.icon, label: item.merchant, amount: item.typicalAmount });
      if (item.cadence === "monthly") {
        const d = new Date(ms);
        ms = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
      } else if (item.cadence === "yearly") {
        const d = new Date(ms);
        ms = Date.UTC(d.getUTCFullYear() + 1, d.getUTCMonth(), d.getUTCDate());
      } else {
        ms += stepDays * DAY;
      }
    }
  }

  // paychecks (needs forecast tier)
  for (const s of forecast?.incomeStreams ?? []) {
    let ms = Date.parse(s.nextDate + "T00:00:00Z");
    while (ms - s.intervalDays * DAY >= first) ms -= s.intervalDays * DAY;
    for (; ms < nextMonth; ms += s.intervalDays * DAY) {
      if (ms >= first) push(iso(ms), { kind: "income", icon: "💵", label: s.merchant, amount: s.typicalAmount });
    }
  }

  // user-scheduled charges: roll each schedule across the visible month
  for (const s of scheduled ?? []) {
    if (!s.active) continue;
    const kind = s.direction === "income" ? ("income" as const) : ("bill" as const);
    const push2 = (dateIso: string) => {
      if (s.endDate && dateIso > s.endDate) return;
      push(dateIso, { kind, icon: s.icon, label: s.name, amount: s.amount });
    };
    if (s.type === "once") {
      const ms = Date.parse(s.nextDate + "T00:00:00Z");
      if (ms >= first && ms < nextMonth) push2(s.nextDate);
      continue;
    }
    const stepDays = s.type === "custom"
      ? Math.max(1, s.intervalDays ?? 30)
      : s.cadence === "weekly" ? 7 : s.cadence === "biweekly" ? 14 : s.cadence === "monthly" ? 30 : 365;
    let ms = Date.parse(s.nextDate + "T00:00:00Z");
    while (ms - stepDays * DAY >= first) ms -= stepDays * DAY;
    let guard = 0;
    while (ms < nextMonth && guard++ < 62) {
      if (ms >= first) push2(iso(ms));
      if (s.type === "recurring" && s.cadence === "monthly") {
        const d = new Date(ms);
        ms = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
      } else if (s.type === "recurring" && s.cadence === "yearly") {
        const d = new Date(ms);
        ms = Date.UTC(d.getUTCFullYear() + 1, d.getUTCMonth(), d.getUTCDate());
      } else {
        ms += stepDays * DAY;
      }
    }
  }

  // goal completion dates
  for (const g of goals?.goals ?? []) {
    const d = g.computed.projectedDate;
    if (!d) continue;
    const ms = Date.parse(d + "T00:00:00Z");
    if (ms >= first && ms < nextMonth) push(d, { kind: "goal", icon: "🎯", label: `${g.name} complete`, amount: null });
  }

  for (const list of events.values()) list.sort((a, b) => (a.kind < b.kind ? -1 : 1));
  return events;
}

export function CalendarPage() {
  const { has } = useEntitlements();
  const recurringQ = useRecurring();
  const forecastQ = useForecast();
  const goalsQ = useGoals();
  const scheduleQ = useSchedule();
  const [offset, setOffset] = useState(0);

  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1));
  const y = monthStart.getUTCFullYear();
  const m = monthStart.getUTCMonth();
  const daysInMonth = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const firstWeekday = new Date(Date.UTC(y, m, 1)).getUTCDay(); // 0 = Sunday
  const todayIso = now.toISOString().slice(0, 10);
  const monthLabel = monthStart.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

  if (recurringQ.isLoading) {
    return <div className="page"><Spinner label="Building your calendar…" /></div>;
  }

  const events = collectEvents(monthStart, recurringQ.data?.summary, has("forecast") ? forecastQ.data : undefined, goalsQ.data, scheduleQ.data);
  const monthTotal = [...events.values()].flat().filter((e) => e.kind === "bill").reduce((s, e) => s + (e.amount ?? 0), 0);
  const monthIncome = [...events.values()].flat().filter((e) => e.kind === "income").reduce((s, e) => s + (e.amount ?? 0), 0);

  const cells: Array<{ day: number | null; date: string | null }> = [];
  for (let i = 0; i < firstWeekday; i++) cells.push({ day: null, date: null });
  for (let d = 1; d <= daysInMonth; d++) cells.push({ day: d, date: iso(Date.UTC(y, m, d)) });

  return (
    <div className="page">
      <div className="card">
        <div className="row between wrap" style={{ gap: 12 }}>
          <div className="row gap-sm" style={{ alignItems: "center" }}>
            <button className="btn btn-sm" onClick={() => setOffset((o) => o - 1)}>‹</button>
            <span className="card-title" style={{ minWidth: 150, textAlign: "center" }}>{monthLabel}</span>
            <button className="btn btn-sm" onClick={() => setOffset((o) => o + 1)}>›</button>
            {offset !== 0 && <button className="btn btn-ghost btn-sm" onClick={() => setOffset(0)}>Today</button>}
          </div>
          <div className="row gap-sm wrap faint text-xs" style={{ alignItems: "center", gap: 16 }}>
            <span>🧾 bills <Money cents={monthTotal} className="text-xs" /></span>
            {has("forecast") && <span className="accent">💵 income {formatMoney(monthIncome)}</span>}
            <span>🎯 goal milestones</span>
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: 12 }}>
        <div className="cal-grid cal-head">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <div key={d} className="cal-dow">{d}</div>
          ))}
        </div>
        <div className="cal-grid">
          {cells.map((c, i) =>
            c.day === null ? (
              <div key={`e${i}`} className="cal-cell empty" />
            ) : (
              <div key={c.date} className={`cal-cell ${c.date === todayIso ? "today" : ""}`}>
                <span className="cal-day">{c.day}</span>
                <div className="cal-events">
                  {(events.get(c.date!) ?? []).slice(0, 3).map((e, j) => (
                    <div key={j} className={`cal-event ${e.kind}`} title={`${e.label}${e.amount !== null ? ` · ${formatMoney(e.amount)}` : ""}`}>
                      <span>{e.icon}</span>
                      <span className="cal-event-label">{e.label}</span>
                      {e.amount !== null && <span className="cal-event-amt">{formatMoney(e.amount)}</span>}
                    </div>
                  ))}
                  {(events.get(c.date!)?.length ?? 0) > 3 && (
                    <span className="faint text-xs">+{events.get(c.date!)!.length - 3} more</span>
                  )}
                </div>
              </div>
            ),
          )}
        </div>
        {(recurringQ.data?.summary.items.length ?? 0) === 0 && (scheduleQ.data?.length ?? 0) === 0 && (
          <div style={{ padding: 20 }}>
            <EmptyState icon="🗓" title="Nothing scheduled yet" hint="Schedule a charge below, or add a few months of transactions and your bills and paychecks will appear here automatically." />
          </div>
        )}
      </div>

      <ScheduleManager />
    </div>
  );
}
