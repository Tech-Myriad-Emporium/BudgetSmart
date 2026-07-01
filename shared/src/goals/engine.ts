import { clamp, sumCents, type Cents } from "../money.js";
import type { Goal, GoalProgress, GoalStatus, GoalsSummary, GoalWithProgress } from "../types.js";

const MILESTONES = [0.25, 0.5, 0.75, 1] as const;
const AVG_DAYS_PER_MONTH = 30.4375;

/** Whole months from `from` until an ISO date (YYYY-MM-DD). Negative if past. */
export function monthsUntil(targetDate: string, from: Date = new Date()): number {
  const [y, m, d] = targetDate.split("-").map(Number) as [number, number, number];
  const target = Date.UTC(y, m - 1, d);
  const now = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  let months = (y - from.getUTCFullYear()) * 12 + (m - 1 - from.getUTCMonth());
  // Pull back a month if the day-of-month hasn't been reached yet.
  if (d < from.getUTCDate()) months -= 1;
  // Guarantee a sensible sign for same-month edge cases.
  if (months === 0 && target < now) months = -1;
  return months;
}

/** Add a (possibly fractional) number of months to today, as an ISO date. */
export function isoAfterMonths(months: number, from: Date = new Date()): string {
  const days = Math.round(months * AVG_DAYS_PER_MONTH);
  const d = new Date(from.getTime() + days * 86_400_000);
  return d.toISOString().slice(0, 10);
}

export function computeGoalProgress(goal: Goal, now: Date = new Date()): GoalProgress {
  const target = Math.max(0, goal.targetAmount);
  const remaining = Math.max(0, target - goal.currentAmount);
  const progress = target > 0 ? clamp(goal.currentAmount / target, 0, 1) : goal.currentAmount > 0 ? 1 : 0;
  const complete = remaining === 0 && target > 0;

  const monthsRemaining = goal.targetDate ? monthsUntil(goal.targetDate, now) : null;

  let requiredMonthly: Cents | null = null;
  if (!complete && goal.targetDate) {
    // If overdue or due this month, the whole remainder is "needed now".
    const months = monthsRemaining != null && monthsRemaining > 0 ? monthsRemaining : 1;
    requiredMonthly = Math.ceil(remaining / months);
  }

  let projectedMonths: number | null = null;
  let projectedDate: string | null = null;
  if (!complete && goal.monthlyContribution > 0) {
    projectedMonths = remaining / goal.monthlyContribution;
    projectedDate = isoAfterMonths(projectedMonths, now);
  }

  const status = deriveStatus({ complete, goal, monthsRemaining, requiredMonthly });

  const nextMilestone = complete ? null : (MILESTONES.find((m) => m > progress + 1e-9) ?? 1);

  return {
    goalId: goal.id,
    progress,
    remaining,
    complete,
    monthsRemaining,
    requiredMonthly,
    projectedMonths,
    projectedDate,
    status,
    nextMilestone,
  };
}

function deriveStatus(input: {
  complete: boolean;
  goal: Goal;
  monthsRemaining: number | null;
  requiredMonthly: Cents | null;
}): GoalStatus {
  const { complete, goal, monthsRemaining, requiredMonthly } = input;
  if (complete) return "complete";
  if (!goal.targetDate || requiredMonthly == null) return "no-target-date";
  if (monthsRemaining != null && monthsRemaining < 0) return "overdue";
  // Compare the user's planned monthly against what's required.
  if (goal.monthlyContribution >= Math.ceil(requiredMonthly * 1.05)) return "ahead";
  if (goal.monthlyContribution >= requiredMonthly) return "on-track";
  return "behind";
}

/** Build the goals overview, sorted by priority then soonest deadline. */
export function buildGoalsSummary(goals: Goal[], now: Date = new Date()): GoalsSummary {
  const withProgress: GoalWithProgress[] = goals
    .map((g) => ({ ...g, computed: computeGoalProgress(g, now) }))
    .sort((a, b) => {
      if (a.computed.complete !== b.computed.complete) return a.computed.complete ? 1 : -1;
      if (a.priority !== b.priority) return a.priority - b.priority;
      const ad = a.targetDate ?? "9999-12-31";
      const bd = b.targetDate ?? "9999-12-31";
      return ad.localeCompare(bd);
    });

  return {
    totalTarget: sumCents(goals.map((g) => g.targetAmount)),
    totalSaved: sumCents(goals.map((g) => g.currentAmount)),
    totalRemaining: sumCents(withProgress.map((g) => g.computed.remaining)),
    activeCount: withProgress.filter((g) => !g.computed.complete).length,
    completedCount: withProgress.filter((g) => g.computed.complete).length,
    goals: withProgress,
  };
}
