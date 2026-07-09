// Budget domain: fixed category set, money-in-cents helpers, and the
// printed-totals validation that guards LLM extraction output.

export const BUDGET_CATEGORIES = [
  "Groceries",
  "Dining & Takeout",
  "Coffee & Snacks",
  "Entertainment",
  "Subscriptions & Digital",
  "Shopping & Electronics",
  "Transportation",
  "Bills & Utilities",
  "Health",
  "Travel",
  "Other",
  "Income",
  "Card Payment",
  "Payment/Credit",
] as const;

export type BudgetCategory = (typeof BUDGET_CATEGORIES)[number];

export type ExtractedEntry = {
  transDate: string; // ISO yyyy-mm-dd
  postingDate: string; // ISO yyyy-mm-dd
  description: string;
  amount: number; // dollars, always positive
  isCredit: boolean;
  category: BudgetCategory;
};

export const ACCOUNT_TYPES = ["credit_card", "chequing", "savings"] as const;
export type BudgetAccountType = (typeof ACCOUNT_TYPES)[number];

// Field semantics are account-generic: previousBalance = opening balance,
// paymentsCredits = total money in, purchasesTotal = total money out,
// totalBalance = closing balance. On a card, "money in" is payments/credits
// and "money out" is purchases; on a bank account, deposits and withdrawals.
export type ExtractedStatement = {
  source: string;
  accountType: BudgetAccountType;
  statementDate: string;
  periodStart: string;
  periodEnd: string;
  previousBalance: number;
  paymentsCredits: number; // money in, positive
  purchasesTotal: number; // money out, positive
  totalBalance: number;
  entries: ExtractedEntry[];
};

export type ValidationResult = {
  status: "valid" | "mismatch";
  extractedPurchasesSumCents: number;
  problems: string[];
};

export const toCents = (dollars: number): number => Math.round(dollars * 100);

const TOLERANCE_CENTS = 1;

export function validateStatement(s: ExtractedStatement): ValidationResult {
  const problems: string[] = [];

  const purchasesSumCents = s.entries
    .filter((e) => !e.isCredit)
    .reduce((sum, e) => sum + toCents(e.amount), 0);

  const printedPurchasesCents = toCents(s.purchasesTotal);
  if (Math.abs(purchasesSumCents - printedPurchasesCents) > TOLERANCE_CENTS) {
    problems.push(
      `extracted purchases sum ${(purchasesSumCents / 100).toFixed(2)} does not match printed purchases total ${s.purchasesTotal.toFixed(2)}`
    );
  }

  // Credits must reconcile too — a mis-read payment amount (e.g. an account
  // number bleeding into the figure) is invisible to the purchases check.
  const creditsSumCents = s.entries
    .filter((e) => e.isCredit)
    .reduce((sum, e) => sum + toCents(e.amount), 0);
  if (Math.abs(creditsSumCents - toCents(s.paymentsCredits)) > TOLERANCE_CENTS) {
    problems.push(
      `extracted credits sum ${(creditsSumCents / 100).toFixed(2)} does not match printed payments and credits ${s.paymentsCredits.toFixed(2)}`
    );
  }

  // Card balances are debt (money out increases them); bank balances are
  // assets (money in increases them).
  const printedInCents = toCents(s.paymentsCredits);
  const computedBalanceCents =
    s.accountType === "credit_card"
      ? toCents(s.previousBalance) - printedInCents + printedPurchasesCents
      : toCents(s.previousBalance) + printedInCents - printedPurchasesCents;
  if (Math.abs(computedBalanceCents - toCents(s.totalBalance)) > TOLERANCE_CENTS) {
    problems.push(
      `balance math is off for ${s.accountType}: opening ${s.previousBalance.toFixed(2)}, in ${s.paymentsCredits.toFixed(2)}, out ${s.purchasesTotal.toFixed(2)} != closing ${s.totalBalance.toFixed(2)}`
    );
  }

  return {
    status: problems.length === 0 ? "valid" : "mismatch",
    extractedPurchasesSumCents: purchasesSumCents,
    problems,
  };
}
