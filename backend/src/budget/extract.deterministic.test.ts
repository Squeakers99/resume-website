import { describe, expect, it, vi } from "vitest";
import type { CategorizeCaller, CategorizeItem } from "./categorize";
import { extractStatementsDeterministic } from "./extract";

// Synthetic BMO Mastercard text (copied from preparse.test.ts, which does not
// export its fixtures): invented names, account numbers and amounts.
const cardText = () =>
  [
    "BMO Blue Rewards",
    "Mastercard",
    "Summary of your account",
    "Previous total balance, Dec. 5, 2025$250.00",
    "Payments and credits-262.35",
    "Purchases and other charges+170.47",
    "New installments0.00",
    "Cash advances",
    "1",
    "0.00",
    "Total interest charges+0.00",
    "Fees0.00",
    "Total balance$158.12",
    "Minimum payment due$10.00",
    "Payment due date: Jan. 26, 2026",
    "Ms Jane Tester",
    "Card numberXXXX XXXX XXXX 9876",
    "Statement dateJan. 5, 2026",
    "Statement periodDec. 6, 2025 - Jan. 5, 2026",
    "Page 1 of 4",
    "",
    "Transactions since your last statement",
    "TRANS",
    "DATE",
    "POSTING",
    "DATE",
    "DESCRIPTIONAMOUNT ($)",
    "Card number: XXXX XXXX XXXX 9876    MS JANE TESTER",
    // Masked account digits run straight into the amount.
    "Dec. 8Dec. 9TRSF FROM/DE ACCT/CPT    1111-XXXX-222250.00 CR",
    "Dec. 10Dec. 11CORNER GROCER          SPRINGFIELD  ON45.67",
    // Wrapped description: city on the next line, amount on its own line.
    "Dec. 20Dec. 22MOUNTAIN OUTFITTERS LTD    SPRINGFIELD",
    "ON",
    "80.25",
    "Dec. 28Dec. 29USD 10@1.35 EXAMPLE *CLOUD SERVICE",
    "EXAMPLE CITYCA",
    "13.50",
    "(continued on next page)",
    "BMO Blue Rewards Mastercard",
    "Ms Jane Tester",
    "Card number: XXXX XXXX XXXX 9876",
    "Page 3 of 4",
    "",
    "Transactions since your last statement (continued)",
    "TRANS",
    "DATE",
    "POSTING",
    "DATE",
    "DESCRIPTIONAMOUNT ($)",
    "Dec. 30Jan. 2REFUND STORE           SPRINGFIELD  ON12.35 CR",
    // FX row whose description digits bleed into the CAD amount.
    "Jan. 3Jan. 4USD 5.5@1.4 GADGET SHOP 1237.70",
    // Description starting with a digit right after the posting day.
    "Jan. 4Jan. 47 ELEVEN STORE        TORONTO      ON23.35",
    "Subtotal for MS JANE TESTER170.47",
    "Total for card number XXXX XXXX XXXX 9876$158.12",
    "Page 4 of 4",
  ].join("\n");

// Synthetic BMO Everyday Banking text (adapted from preparse.test.ts): the
// payroll line carries the employer reference and the own-card transfer a
// 19-digit TF reference (3-digit prefix + 16-digit card number).
const bankText = () =>
  [
    "Page1of3",
    "EverydayBanking",
    "MSJANETESTER",
    "FortheperiodendingMarch05,2026",
    "continued",
    "Summaryofyouraccounts",
    "TotalTotalClosing",
    "Openingamountsamountsbalance($)on",
    "-+=",
    "Accountbalance($)deducted($)added($)Mar05,2026",
    "PrimaryChequingAccount",
    "#12345678-9011,000.002,734.502,150.00415.50",
    "PremiumRateSavings",
    "#12345678-5555,000.0014.001,501.666,487.66",
    "Here'swhathappenedinyouraccounts",
    "AmountsdeductedAmountsadded",
    "DateDescriptionfromyouraccount($)toyouraccount($)Balance($)",
    "PrimaryChequingAccount#12345678-901",
    "Owners:",
    "MSJANETESTER",
    "Feb06Openingbalance1,000.00",
    "Feb10DirectDeposit,13139026EXAMPLECORP/PAY2,000.003,000.00",
    "Feb12OnlineTransfer,TF0001111222233334444684.912,315.09",
    "Feb15INTERACe-TransferSent1,049.591,265.50",
    "Page2of3",
    "Here'swhathappenedinyouraccounts(continued)",
    "DateDescriptionfromyouraccount($)toyouraccount($)Balance($)",
    "PrimaryChequingAccount#12345678-901(continued)",
    "Feb20INTERACe-TransferReceived150.001,415.50",
    "Mar02INTERACe-TransferSent1,000.00415.50",
    "Mar05Closingtotals2,734.502,150.00",
    "PremiumRateSavings#12345678-555",
    "Owners:",
    "MSJANETESTER",
    "Feb06Openingbalance5,000.00",
    "Feb10OnlineTransfer,TF0001#9999-5551,500.006,500.00",
    "Feb28InterestEarned1.666,501.66",
    "Mar01INTERACe-TransferSent14.006,487.66",
    "Mar05Closingtotals14.001,501.66",
    "Page3of3",
  ].join("\n");

// Answers `category` for debits and "Payment/Credit" for credits.
const answerAll = (category: string): CategorizeCaller =>
  vi.fn(async (items: CategorizeItem[]) => ({
    categories: items.map((it) => ({
      statement: it.statement,
      entry: it.entry,
      category: it.is_credit ? "Payment/Credit" : category,
    })),
  }));

describe("extractStatementsDeterministic", () => {
  it("runs preparse, categorize and validation for a recognized layout", async () => {
    const caller = answerAll("Shopping & Electronics");
    const result = await extractStatementsDeterministic(cardText(), { caller });

    expect(result.layout).toBe("bmo_card");
    expect(result.problems).toEqual([]);
    expect(result.problemsByStatement).toEqual([[]]);
    expect(result.documentProblems).toEqual([]);
    expect(result.statements).toHaveLength(1);
    expect(caller).toHaveBeenCalledTimes(1);
    const sent = (caller as ReturnType<typeof vi.fn>).mock.calls[0][0] as CategorizeItem[];
    // The card-side refund (entry 4) is a credit the model decides.
    expect(sent.map((it) => it.entry)).toEqual([1, 2, 3, 4, 5, 6]);

    const entries = result.statements[0].entries;
    expect(entries).toHaveLength(7);
    expect(entries.map((e) => e.category)).toEqual([
      "Card Payment",
      "Shopping & Electronics",
      "Shopping & Electronics",
      "Shopping & Electronics",
      "Payment/Credit",
      "Shopping & Electronics",
      "Shopping & Electronics",
    ]);
    expect(entries.map((e) => e.amount)).toEqual([250, 45.67, 80.25, 13.5, 12.35, 7.7, 23.35]);
  });

  it("keeps rule-based categories and attributes the warning when categorize fails", async () => {
    const caller: CategorizeCaller = vi.fn(async () => {
      throw new Error("offline");
    });
    const result = await extractStatementsDeterministic(cardText(), { caller });
    expect(result.statements).toHaveLength(1);
    const cats = result.statements[0].entries.map((e) => e.category);
    expect(cats[0]).toBe("Card Payment"); // TRSF credit
    expect(cats.slice(1)).toEqual(["Other", "Other", "Other", "Other", "Other", "Other"]);
    expect(result.problems).toHaveLength(1);
    expect(result.problems[0]).toContain("offline");
    expect(result.problemsByStatement).toEqual([result.problems]);
    expect(result.documentProblems).toEqual([]);
  });

  it("keeps bank-side rule categories when categorize fails", async () => {
    const caller: CategorizeCaller = vi.fn(async () => {
      throw new Error("offline");
    });
    const result = await extractStatementsDeterministic(bankText(), { caller });
    expect(result.layout).toBe("bmo_everyday");
    expect(result.statements.map((s) => s.entries.map((e) => [e.description, e.category]))).toEqual([
      [
        ["Direct Deposit, 13139026 EXAMPLECORP/PAY", "Income"],
        ["Online Transfer, TF 0001111222233334444", "Card Payment"],
        ["INTERAC e-Transfer Sent", "E-Transfer Sent"],
        ["INTERAC e-Transfer Received", "Payment/Credit"],
        ["INTERAC e-Transfer Sent", "E-Transfer Sent"],
      ],
      [
        ["Online Transfer, TF 0001#9999-555", "Payment/Credit"],
        ["Interest Earned", "Payment/Credit"],
        ["INTERAC e-Transfer Sent", "E-Transfer Sent"],
      ],
    ]);
    // Every bank line is rule-decided, so the model is never called.
    expect(caller).not.toHaveBeenCalled();
    expect(result.problems).toEqual([]);
  });

  it("merges pre-parse and validation problems", async () => {
    const bad = cardText().replace("ON45.67", "ON46.67");
    const result = await extractStatementsDeterministic(bad, { caller: answerAll("Groceries") });
    expect(result.layout).toBe("bmo_card");
    expect(result.problems.some((p) => p.includes("charges sum 171.47"))).toBe(true);
    expect(result.problems.some((p) => p.startsWith("BMO Mastercard 9876: computed total"))).toBe(true);
    // Both name the statement's source, so both land on statement 0.
    expect(result.problemsByStatement).toHaveLength(1);
    expect(result.problemsByStatement[0]).toEqual(result.problems);
    expect(result.documentProblems).toEqual([]);
  });

  it("attributes problems to the statement they name in a multi-statement PDF", async () => {
    const bad = bankText().replace("Feb28InterestEarned1.666,501.66", "Feb28InterestEarned1.676,501.66");
    const result = await extractStatementsDeterministic(bad, { caller: answerAll("Other") });
    expect(result.statements).toHaveLength(2);
    expect(result.problemsByStatement[0]).toEqual([]);
    expect(result.problemsByStatement[1].length).toBeGreaterThan(0);
    expect(result.problemsByStatement[1].every((p) => p.startsWith("BMO Premium Rate Savings 5678-555"))).toBe(
      true
    );
    expect(result.problems).toEqual([...result.documentProblems, ...result.problemsByStatement[1]]);
  });

  it("returns no statements and skips categorize for an unknown layout", async () => {
    const caller = answerAll("Other");
    const result = await extractStatementsDeterministic("Some other bank\nTotal 12.00", { caller });
    expect(result).toEqual({
      layout: "unknown",
      statements: [],
      problems: ["preparse: unsupported layout"],
      problemsByStatement: [],
      documentProblems: ["preparse: unsupported layout"],
    });
    expect(caller).not.toHaveBeenCalled();
  });
});
