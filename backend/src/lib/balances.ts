import { computeAccountBalance, type Cents } from "@budgetsmart/shared";
import { accounts as accountsRepo, transactions as txRepo } from "../db/repo.js";
import { serializeAccount, serializeTransaction } from "./serialize.js";

/**
 * Compute live balances for every one of a user's accounts.
 * Pulls accounts + transactions once and folds them with the shared
 * balance engine so the math matches the client exactly.
 */
export function computeBalancesForUser(userId: string): Map<string, Cents> {
  const accountRows = accountsRepo.listByUser(userId);
  const serializedTxns = txRepo.allByUser(userId).map(serializeTransaction);

  const balances = new Map<string, Cents>();
  for (const account of accountRows) {
    const serialized = serializeAccount(account, 0);
    balances.set(account.id, computeAccountBalance(serialized, serializedTxns));
  }
  return balances;
}
