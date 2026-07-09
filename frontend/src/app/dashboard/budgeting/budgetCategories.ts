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
