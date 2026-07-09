import { describe, expect, it } from "vitest";
import { ExtractionError, mapExtractionPayload } from "./extract";

const goodPayload = () => ({
  statements: [
    {
      source: "BMO Mastercard 4423",
      account_type: "credit_card",
      statement_date: "2026-07-05",
      period_start: "2026-06-06",
      period_end: "2026-07-05",
      opening_balance: 480.96,
      money_in_total: 580.95,
      money_out_total: 973.05,
      closing_balance: 873.06,
      entries: [
        {
          trans_date: "2026-06-10",
          posting_date: "2026-06-12",
          description: "STEAM PURCHASE SEATTLE HH",
          amount: 45.19,
          is_credit: false,
          category: "Entertainment",
        },
      ],
    },
    {
      source: "BMO Primary Chequing 3922-387",
      account_type: "chequing",
      statement_date: "2026-06-05",
      period_start: "2026-05-08",
      period_end: "2026-06-05",
      opening_balance: 452.07,
      money_in_total: 1211.72,
      money_out_total: 393.72,
      closing_balance: 1270.07,
      entries: [
        {
          trans_date: "2026-05-19",
          posting_date: "2026-05-19",
          description: "Mobile Cheque Deposit",
          amount: 739.58,
          is_credit: true,
          category: "Payment/Credit",
        },
      ],
    },
  ],
});

describe("mapExtractionPayload", () => {
  it("maps multi-account payloads to ExtractedStatement objects", () => {
    const statements = mapExtractionPayload(goodPayload());
    expect(statements).toHaveLength(2);
    expect(statements[0].accountType).toBe("credit_card");
    expect(statements[0].entries[0]).toEqual({
      transDate: "2026-06-10",
      postingDate: "2026-06-12",
      description: "STEAM PURCHASE SEATTLE HH",
      amount: 45.19,
      isCredit: false,
      category: "Entertainment",
    });
    expect(statements[1].accountType).toBe("chequing");
    expect(statements[1].previousBalance).toBe(452.07); // opening_balance
    expect(statements[1].paymentsCredits).toBe(1211.72); // money_in_total
    expect(statements[1].purchasesTotal).toBe(393.72); // money_out_total
    expect(statements[1].totalBalance).toBe(1270.07); // closing_balance
  });

  it("rejects unknown account types", () => {
    const p = goodPayload();
    (p.statements[0] as { account_type: string }).account_type = "mortgage";
    expect(() => mapExtractionPayload(p)).toThrow(ExtractionError);
  });

  it("rejects non-ISO dates", () => {
    const p = goodPayload();
    p.statements[0].statement_date = "Jul. 5, 2026";
    expect(() => mapExtractionPayload(p)).toThrow(ExtractionError);
  });

  it("normalizes signed magnitudes (statement prints e.g. -580.95)", () => {
    const p = goodPayload();
    p.statements[0].entries[0].amount = -45.19;
    p.statements[0].money_in_total = -580.95;
    const statements = mapExtractionPayload(p);
    expect(statements[0].entries[0].amount).toBe(45.19);
    expect(statements[0].paymentsCredits).toBe(580.95);
  });

  it("rejects non-numeric amounts", () => {
    const p = goodPayload();
    (p.statements[0].entries[0] as { amount: unknown }).amount = "45.19";
    expect(() => mapExtractionPayload(p)).toThrow(ExtractionError);
  });

  it("rejects unknown categories", () => {
    const p = goodPayload();
    p.statements[0].entries[0].category = "Video Games";
    expect(() => mapExtractionPayload(p)).toThrow(ExtractionError);
  });

  it("rejects a statement with no transactions", () => {
    const p = goodPayload();
    p.statements[1].entries = [];
    expect(() => mapExtractionPayload(p)).toThrow(ExtractionError);
  });

  it("rejects an empty statements list", () => {
    expect(() => mapExtractionPayload({ statements: [] })).toThrow(ExtractionError);
  });
});
