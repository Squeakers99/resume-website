import { describe, expect, it } from "vitest";
import {
  BUDGET_CATEGORIES,
  computedCardTotalCents,
  toCents,
  validateStatement,
  type ExtractedStatement,
} from "./domain";

const baseStatement = (): ExtractedStatement => ({
  source: "BMO Mastercard 4423",
  accountType: "credit_card",
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
  it("contains the fixed set including the special credit categories", () => {
    expect(BUDGET_CATEGORIES).toContain("Payment/Credit");
    expect(BUDGET_CATEGORIES).toContain("Income");
    expect(BUDGET_CATEGORIES).toContain("Card Payment");
    expect(BUDGET_CATEGORIES).toContain("Other");
    expect(BUDGET_CATEGORIES).toHaveLength(14);
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

  it("flags a card whose charges-minus-credits total is off", () => {
    const s = baseStatement();
    s.entries[3].amount = 50.0;
    const result = validateStatement(s);
    expect(result.status).toBe("mismatch");
    expect(result.problems.some((p) => p.includes("computed total"))).toBe(true);
  });

  it("flags broken balance math (prev - payments + purchases != total)", () => {
    const s = baseStatement();
    s.totalBalance = 999.99;
    const result = validateStatement(s);
    expect(result.status).toBe("mismatch");
    expect(result.problems.some((p) => p.includes("balance"))).toBe(true);
  });

  it("validates a chequing statement with asset balance math (opening + in - out)", () => {
    const s: ExtractedStatement = {
      source: "BMO Primary Chequing 3922-387",
      accountType: "chequing",
      statementDate: "2026-06-05",
      periodStart: "2026-05-08",
      periodEnd: "2026-06-05",
      previousBalance: 452.07,
      paymentsCredits: 1211.72, // money in
      purchasesTotal: 393.72, // money out
      totalBalance: 1270.07,
      entries: [
        {
          transDate: "2026-05-19",
          postingDate: "2026-05-19",
          description: "Mobile Cheque Deposit",
          amount: 1211.72,
          isCredit: true,
          category: "Payment/Credit",
        },
        {
          transDate: "2026-05-21",
          postingDate: "2026-05-21",
          description: "INTERAC e-Transfer Sent",
          amount: 393.72,
          isCredit: false,
          category: "Other",
        },
      ],
    };
    expect(validateStatement(s).status).toBe("valid");
    // The same numbers under card math would NOT balance:
    expect(validateStatement({ ...s, accountType: "credit_card" }).status).toBe("mismatch");
  });

  it("ignores TRSF credits in the card total (owner rule)", () => {
    const s = baseStatement();
    s.entries[0].amount = 0.96; // TRSF amount is irrelevant to the card total
    expect(validateStatement(s).status).toBe("valid");
  });

  it("flags a mis-read non-TRSF credit on a card", () => {
    const s = baseStatement();
    s.entries[1].amount = 9.99; // PAYMENT RECEIVED read as 9.99 instead of 99.99
    const result = validateStatement(s);
    expect(result.status).toBe("mismatch");
    expect(result.problems.some((p) => p.includes("computed total"))).toBe(true);
  });

  it("computes the card total as charges minus non-TRSF credits", () => {
    expect(computedCardTotalCents(baseStatement().entries)).toBe(87306);
  });
});
