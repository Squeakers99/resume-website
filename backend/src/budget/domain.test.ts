import { describe, expect, it } from "vitest";
import {
  BUDGET_CATEGORIES,
  toCents,
  validateStatement,
  type ExtractedStatement,
} from "./domain";

const baseStatement = (): ExtractedStatement => ({
  source: "BMO Mastercard 4423",
  statementDate: "2026-07-05",
  periodStart: "2026-06-06",
  periodEnd: "2026-07-05",
  previousBalance: 480.96,
  paymentsCredits: 580.95,
  purchasesTotal: 973.05,
  totalBalance: 873.06,
  entries: [
    {
      transDate: "2026-06-09",
      postingDate: "2026-06-09",
      description: "TRSF FROM/DE ACCT/CPT 3776-XXXX-387",
      amount: 480.96,
      isCredit: true,
      category: "Payment/Credit",
    },
    {
      transDate: "2026-06-08",
      postingDate: "2026-06-09",
      description: "PAYMENT RECEIVED - THANK YOU",
      amount: 99.99,
      isCredit: true,
      category: "Payment/Credit",
    },
    {
      transDate: "2026-06-08",
      postingDate: "2026-06-10",
      description: "BEST BUY MARKET PLACE BURNABY BC",
      amount: 913.05,
      isCredit: false,
      category: "Shopping & Electronics",
    },
    {
      transDate: "2026-06-11",
      postingDate: "2026-06-12",
      description: "MCDONALD'S #40573 RICHMOND HILLON",
      amount: 60.0,
      isCredit: false,
      category: "Dining & Takeout",
    },
  ],
});

describe("toCents", () => {
  it("rounds floating dollars to integer cents", () => {
    expect(toCents(973.05)).toBe(97305);
    expect(toCents(0.1 + 0.2)).toBe(30);
    expect(toCents(0)).toBe(0);
  });
});

describe("BUDGET_CATEGORIES", () => {
  it("contains the fixed set including Payment/Credit and Other", () => {
    expect(BUDGET_CATEGORIES).toContain("Payment/Credit");
    expect(BUDGET_CATEGORIES).toContain("Other");
    expect(BUDGET_CATEGORIES).toHaveLength(12);
  });
});

describe("validateStatement", () => {
  it("passes when purchases sum and balance math line up", () => {
    const result = validateStatement(baseStatement());
    expect(result.status).toBe("valid");
    expect(result.extractedPurchasesSumCents).toBe(97305);
    expect(result.problems).toEqual([]);
  });

  it("tolerates a 1-cent rounding difference", () => {
    const s = baseStatement();
    s.entries[3].amount = 60.01; // purchases sum now 973.06 vs printed 973.05
    expect(validateStatement(s).status).toBe("valid");
  });

  it("flags a purchases-sum mismatch", () => {
    const s = baseStatement();
    s.entries[3].amount = 50.0;
    const result = validateStatement(s);
    expect(result.status).toBe("mismatch");
    expect(result.problems.some((p) => p.includes("purchases"))).toBe(true);
  });

  it("flags broken balance math (prev - payments + purchases != total)", () => {
    const s = baseStatement();
    s.totalBalance = 999.99;
    const result = validateStatement(s);
    expect(result.status).toBe("mismatch");
    expect(result.problems.some((p) => p.includes("balance"))).toBe(true);
  });
});
