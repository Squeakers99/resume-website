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

export type ExtractedStatement = {
  source: string;
  statementDate: string;
  periodStart: string;
  periodEnd: string;
  previousBalance: number;
  paymentsCredits: number; // positive
  purchasesTotal: number;
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

  const computedBalanceCents =
    toCents(s.previousBalance) - toCents(s.paymentsCredits) + printedPurchasesCents;
  if (Math.abs(computedBalanceCents - toCents(s.totalBalance)) > TOLERANCE_CENTS) {
    problems.push(
      `balance math is off: ${s.previousBalance.toFixed(2)} - ${s.paymentsCredits.toFixed(2)} + ${s.purchasesTotal.toFixed(2)} != ${s.totalBalance.toFixed(2)}`
    );
  }

  return {
    status: problems.length === 0 ? "valid" : "mismatch",
    extractedPurchasesSumCents: purchasesSumCents,
    problems,
  };
}
