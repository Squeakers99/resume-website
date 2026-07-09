import { describe, expect, it } from "vitest";
import { ExtractionError, mapExtractionPayload } from "./extract";

const goodPayload = () => ({
  source: "BMO Mastercard 4423",
  statement_date: "2026-07-05",
  period_start: "2026-06-06",
  period_end: "2026-07-05",
  previous_balance: 480.96,
  payments_credits: 580.95,
  purchases_total: 973.05,
  total_balance: 873.06,
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
});

describe("mapExtractionPayload", () => {
  it("maps snake_case payload to ExtractedStatement", () => {
    const s = mapExtractionPayload(goodPayload());
    expect(s.statementDate).toBe("2026-07-05");
    expect(s.entries[0]).toEqual({
      transDate: "2026-06-10",
      postingDate: "2026-06-12",
      description: "STEAM PURCHASE SEATTLE HH",
      amount: 45.19,
      isCredit: false,
      category: "Entertainment",
    });
  });

  it("rejects non-ISO dates", () => {
    const p = goodPayload();
    p.statement_date = "Jul. 5, 2026";
    expect(() => mapExtractionPayload(p)).toThrow(ExtractionError);
  });

  it("normalizes signed magnitudes (statement prints e.g. -580.95)", () => {
    const p = goodPayload();
    p.entries[0].amount = -45.19;
    p.payments_credits = -580.95;
    const s = mapExtractionPayload(p);
    expect(s.entries[0].amount).toBe(45.19);
    expect(s.paymentsCredits).toBe(580.95);
  });

  it("rejects non-numeric amounts", () => {
    const p = goodPayload();
    (p.entries[0] as { amount: unknown }).amount = "45.19";
    expect(() => mapExtractionPayload(p)).toThrow(ExtractionError);
  });

  it("rejects unknown categories", () => {
    const p = goodPayload();
    p.entries[0].category = "Video Games";
    expect(() => mapExtractionPayload(p)).toThrow(ExtractionError);
  });

  it("rejects empty entries", () => {
    const p = goodPayload();
    p.entries = [];
    expect(() => mapExtractionPayload(p)).toThrow(ExtractionError);
  });
});
