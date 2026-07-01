import { clamp } from "../money.js";
import type {
  Achievement,
  Challenge,
  GamificationState,
  GamificationStats,
} from "../types.js";

/* ------------------------------------------------------------------ *
 * XP rules — XP is derived from real activity so it never needs an
 * event log; the backend just counts what already exists.
 * ------------------------------------------------------------------ */
const XP = {
  perTransaction: 10,
  perActiveDay: 15,
  perBudget: 25,
  perGoalCreated: 40,
  perGoalReached: 150,
  perDebt: 30,
  perHolding: 20,
  perRecurring: 12,
  netWorthPositive: 200,
} as const;

export function computeXp(s: GamificationStats): number {
  return (
    s.transactionCount * XP.perTransaction +
    s.activeDays.length * XP.perActiveDay +
    s.budgetsSet * XP.perBudget +
    s.goalsCreated * XP.perGoalCreated +
    s.goalsReached * XP.perGoalReached +
    s.debtsTracked * XP.perDebt +
    s.holdings * XP.perHolding +
    s.recurringDetected * XP.perRecurring +
    (s.netWorthPositive ? XP.netWorthPositive : 0)
  );
}

/** Cumulative XP required to *reach* a level (level 1 starts at 0). */
const cumulativeXpForLevel = (level: number): number => 250 * (level - 1) * (level - 1);

const RANKS = [
  "Rookie Saver",
  "Budgeter",
  "Money Mapper",
  "Cashflow Captain",
  "Wealth Builder",
  "Portfolio Pilot",
  "Debt Slayer",
  "Net Worth Ninja",
  "Finance Sensei",
  "Money Master",
];

export function levelFromXp(xp: number): number {
  let level = 1;
  while (cumulativeXpForLevel(level + 1) <= xp) level++;
  return level;
}

export const rankForLevel = (level: number): string =>
  RANKS[Math.min(level - 1, RANKS.length - 1)] ?? "Money Master";

/* ------------------------------------------------------------------ *
 * Streaks (consecutive calendar days with activity)
 * ------------------------------------------------------------------ */
const DAY = 86_400_000;
const dayMs = (iso: string): number => {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, d);
};

export function computeStreaks(
  activeDays: string[],
  now: Date = new Date(),
): { current: number; longest: number } {
  if (activeDays.length === 0) return { current: 0, longest: 0 };
  const days = [...new Set(activeDays)].map(dayMs).sort((a, b) => a - b);

  let longest = 1;
  let run = 1;
  for (let i = 1; i < days.length; i++) {
    run = days[i]! - days[i - 1]! === DAY ? run + 1 : 1;
    longest = Math.max(longest, run);
  }

  // current streak counts back from the latest active day, but only "live"
  // if that day is today or yesterday.
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const latest = days[days.length - 1]!;
  let current = 0;
  if (today - latest <= DAY) {
    current = 1;
    for (let i = days.length - 1; i > 0; i--) {
      if (days[i]! - days[i - 1]! === DAY) current++;
      else break;
    }
  }
  return { current, longest };
}

/* ------------------------------------------------------------------ *
 * Achievements & challenges
 * ------------------------------------------------------------------ */
interface AchievementDef extends Omit<Achievement, "unlocked"> {
  test: (s: GamificationStats, streak: number) => boolean;
}

const ACHIEVEMENTS: AchievementDef[] = [
  { id: "first-tx", name: "First Steps", description: "Log your first transaction", icon: "👣", xp: 10, test: (s) => s.transactionCount >= 1 },
  { id: "tx-25", name: "Getting Serious", description: "Log 25 transactions", icon: "📒", xp: 50, test: (s) => s.transactionCount >= 25 },
  { id: "tx-100", name: "Ledger Legend", description: "Log 100 transactions", icon: "📚", xp: 150, test: (s) => s.transactionCount >= 100 },
  { id: "budgeter", name: "Budgeter", description: "Set up 5 budgets", icon: "◫", xp: 60, test: (s) => s.budgetsSet >= 5 },
  { id: "goal-set", name: "Dream Big", description: "Create a savings goal", icon: "🎯", xp: 40, test: (s) => s.goalsCreated >= 1 },
  { id: "goal-done", name: "Goal Crusher", description: "Reach a goal", icon: "🏆", xp: 200, test: (s) => s.goalsReached >= 1 },
  { id: "investor", name: "Investor", description: "Track an investment", icon: "📈", xp: 80, test: (s) => s.holdings >= 1 },
  { id: "debt-plan", name: "Debt Strategist", description: "Track a debt to pay off", icon: "⚔️", xp: 50, test: (s) => s.debtsTracked >= 1 },
  { id: "positive-nw", name: "In the Black", description: "Reach a positive net worth", icon: "◆", xp: 200, test: (s) => s.netWorthPositive },
  { id: "streak-7", name: "On a Roll", description: "Hit a 7-day streak", icon: "🔥", xp: 120, test: (_s, streak) => streak >= 7 },
];

export function buildGamification(
  stats: GamificationStats,
  now: Date = new Date(),
): GamificationState {
  const xp = computeXp(stats);
  const level = levelFromXp(xp);
  const cumThis = cumulativeXpForLevel(level);
  const cumNext = cumulativeXpForLevel(level + 1);
  const xpIntoLevel = xp - cumThis;
  const xpForNextLevel = cumNext - cumThis;

  const { current: currentStreak, longest: longestStreak } = computeStreaks(stats.activeDays, now);

  const achievements: Achievement[] = ACHIEVEMENTS.map((a) => ({
    id: a.id,
    name: a.name,
    description: a.description,
    icon: a.icon,
    xp: a.xp,
    unlocked: a.test(stats, longestStreak),
  }));
  const achievementsUnlocked = achievements.filter((a) => a.unlocked).length;

  const smartCoins =
    Math.floor(xp / 100) + stats.goalsReached * 50 + achievementsUnlocked * 25;

  const challenges: Challenge[] = [
    challenge("log-50", "Log 50 transactions", "📝", stats.transactionCount, 50, 100),
    challenge("budgets-8", "Budget every category", "◫", stats.budgetsSet, 8, 75),
    challenge("streak-14", "Reach a 14-day streak", "🔥", longestStreak, 14, 150),
    challenge("goals-3", "Juggle 3 goals", "🎯", stats.goalsCreated, 3, 80),
  ];

  return {
    xp,
    level,
    rank: rankForLevel(level),
    xpIntoLevel,
    xpForNextLevel,
    levelProgress: xpForNextLevel > 0 ? clamp(xpIntoLevel / xpForNextLevel, 0, 1) : 1,
    currentStreak,
    longestStreak,
    smartCoins,
    achievements,
    achievementsUnlocked,
    challenges,
  };
}

function challenge(
  id: string,
  name: string,
  icon: string,
  current: number,
  target: number,
  reward: number,
): Challenge {
  const capped = Math.min(current, target);
  return {
    id,
    name,
    icon,
    target,
    current: capped,
    progress: clamp(current / target, 0, 1),
    reward,
    done: current >= target,
  };
}
