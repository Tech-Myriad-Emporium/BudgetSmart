import type { CategoryKind, RolloverMode } from "@budgetsmart/shared";
import { categories } from "../../db/repo.js";

interface DefaultCategory {
  name: string;
  kind: CategoryKind;
  icon: string;
  color: string;
  rollover: RolloverMode;
}

/** Starter categories every new account begins with. */
export const DEFAULT_CATEGORIES: DefaultCategory[] = [
  { name: "Salary", kind: "income", icon: "💼", color: "#00FF41", rollover: "none" },
  { name: "Side Income", kind: "income", icon: "🪙", color: "#00FFB2", rollover: "none" },
  { name: "Groceries", kind: "expense", icon: "🛒", color: "#00FF41", rollover: "positive" },
  { name: "Rent", kind: "expense", icon: "🏠", color: "#00E0FF", rollover: "none" },
  { name: "Utilities", kind: "expense", icon: "💡", color: "#FFD600", rollover: "none" },
  { name: "Dining Out", kind: "expense", icon: "🍔", color: "#FF7A00", rollover: "positive" },
  { name: "Transport", kind: "expense", icon: "🚗", color: "#B388FF", rollover: "positive" },
  { name: "Subscriptions", kind: "expense", icon: "📺", color: "#FF00AA", rollover: "none" },
  { name: "Shopping", kind: "expense", icon: "🛍️", color: "#FF0033", rollover: "positive" },
  { name: "Health", kind: "expense", icon: "🩺", color: "#00FFB2", rollover: "full" },
  { name: "Entertainment", kind: "expense", icon: "🎮", color: "#B388FF", rollover: "positive" },
  { name: "Savings", kind: "expense", icon: "🐷", color: "#00FF41", rollover: "full" },
];

/** Create the default category set for a user (no-op if they already have some). */
export function seedDefaultsForUser(userId: string): void {
  if (categories.countByUser(userId) > 0) return;
  categories.createMany(DEFAULT_CATEGORIES.map((c) => ({ ...c, userId })));
}
