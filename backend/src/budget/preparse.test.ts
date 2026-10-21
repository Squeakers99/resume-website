import { describe, expect, it } from "vitest";
import { validateStatement } from "./domain";
import { detectLayout, preparseStatementText } from "./preparse";

// All fixtures are synthetic: invented names, account numbers and amounts,
// shaped like pdf-parse output for the two BMO layouts.

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
    "Feb10DirectDeposit,99887766EXAMPLECORP/PAY2,000.003,000.00",
    "Feb12OnlineTransfer,TF00011112222333344445555684.912,315.09",
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

describe("detectLayout", () => {
  it("recognizes both BMO layouts and rejects anything else", () => {
    expect(detectLayout(cardText())).toBe("bmo_card");
    expect(detectLayout(bankText())).toBe("bmo_everyday");
    expect(detectLayout("ACME Bank\nStatement of account\nBalance 10.00")).toBe("unknown");
  });
});

describe("preparseStatementText: unknown layout", () => {
  it("returns no statements and a fallback problem", () => {
    expect(preparseStatementText("Some other bank\nTotal 12.00")).toEqual({
      layout: "unknown",
      statements: [],
      problems: ["preparse: unsupported layout"],
    });
  });
});

describe("preparseStatementText: BMO Mastercard", () => {
  const result = preparseStatementText(cardText());
  const stmt = result.statements[0];

  it("parses the summary with a year-boundary period", () => {
    expect(result.layout).toBe("bmo_card");
    expect(result.problems).toEqual([]);
    expect(result.statements).toHaveLength(1);
    expect(stmt).toMatchObject({
      source: "BMO Mastercard 9876",
      accountType: "credit_card",
      statementDate: "2026-01-05",
      periodStart: "2025-12-06",
      periodEnd: "2026-01-05",
      previousBalance: 250,
      paymentsCredits: 262.35,
      purchasesTotal: 170.47,
      totalBalance: 158.12,
    });
  });

  it("ignores footer rows and the continued-on-next-page break", () => {
    expect(stmt.entries).toHaveLength(7);
    expect(stmt.entries.some((e) => /Subtotal|Total for|continued/i.test(e.description))).toBe(false);
  });

  it("splits the masked account number from the amount on transfer credits", () => {
    expect(stmt.entries[0]).toEqual({
      transDate: "2025-12-08",
      postingDate: "2025-12-09",
      description: "TRSF FROM/DE ACCT/CPT 1111-XXXX-222",
      amount: 250,
      isCredit: true,
      category: "Other",
    });
  });

  it("joins wrapped descriptions", () => {
    expect(stmt.entries[2]).toMatchObject({
      description: "MOUNTAIN OUTFITTERS LTD SPRINGFIELD ON",
      amount: 80.25,
      isCredit: false,
    });
  });

  it("marks CR lines as credits and resolves years across the boundary", () => {
    expect(stmt.entries[4]).toMatchObject({
      transDate: "2025-12-30",
      postingDate: "2026-01-02",
      description: "REFUND STORE SPRINGFIELD ON",
      amount: 12.35,
      isCredit: true,
    });
  });

  it("uses the FX proof (USD x rate = CAD) to pick the amount", () => {
    expect(stmt.entries[3]).toMatchObject({ description: "EXAMPLE *CLOUD SERVICE EXAMPLE CITYCA", amount: 13.5 });
    expect(stmt.entries[5]).toMatchObject({
      transDate: "2026-01-03",
      postingDate: "2026-01-04",
      description: "GADGET SHOP 123",
      amount: 7.7,
    });
  });

  it("splits the posting day from a description that starts with a digit", () => {
    expect(stmt.entries[6]).toMatchObject({
      postingDate: "2026-01-04",
      description: "7 ELEVEN STORE TORONTO ON",
      amount: 23.35,
    });
  });

  it("gives every entry the placeholder category", () => {
    expect(stmt.entries.every((e) => e.category === "Other")).toBe(true);
  });

  it("produces a statement validateStatement accepts", () => {
    expect(validateStatement(stmt).problems).toEqual([]);
  });

  it("flags an FX row whose conversion does not match the CAD amount", () => {
    const bad = cardText().replace("USD 10@1.35", "USD 10@1.25");
    const r = preparseStatementText(bad);
    expect(r.problems.some((p) => p.includes("FX conversion"))).toBe(true);
  });

  it("flags a charges sum that does not match printed purchases", () => {
    const bad = cardText().replace("ON45.67", "ON45.68");
    const r = preparseStatementText(bad);
    expect(r.problems.some((p) => p.includes("charges sum 170.48"))).toBe(true);
  });
});

describe("preparseStatementText: BMO Mastercard posting day glued to digits", () => {
  // Statement period Dec. 6, 2025 - Jan. 5, 2026. Each case swaps the
  // CORNER GROCER row (45.67) for another row with the same amount, so the
  // charges sum still reconciles and only the posting-day logic is exercised.
  const GROCER_ROW = "Dec. 10Dec. 11CORNER GROCER          SPRINGFIELD  ON45.67";
  const withRow = (row: string) => {
    const text = cardText();
    expect(text).toContain(GROCER_ROW);
    return preparseStatementText(text.replace(GROCER_ROW, row));
  };
  const swapped = (r: ReturnType<typeof preparseStatementText>) => r.statements[0].entries[1];

  it("45 MINUTE PHOTO: a posting day before the transaction date is out of window", () => {
    // Dec 24 (gap 4) vs Dec 2 (18 days before the Dec 20 transaction, in the
    // same year under the period rules): only the two-digit reading is valid.
    const r = withRow("Dec. 20Dec. 245 MINUTE PHOTO SPRINGFIELD ON45.67");
    expect(r.problems).toEqual([]);
    expect(swapped(r)).toMatchObject({
      transDate: "2025-12-20",
      postingDate: "2025-12-24",
      description: "5 MINUTE PHOTO SPRINGFIELD ON",
      amount: 45.67,
    });
  });

  it("7 ELEVEN: the two-digit day 47 is not a date, so the one-digit day wins", () => {
    const r = withRow("Dec. 3Dec. 47 ELEVEN SPRINGFIELD ON45.67");
    expect(r.problems).toEqual([]);
    expect(swapped(r)).toMatchObject({
      transDate: "2025-12-03",
      postingDate: "2025-12-04",
      description: "7 ELEVEN SPRINGFIELD ON",
    });
  });

  it("24 HOUR FITNESS: only the two-digit reading is in window", () => {
    // Dec 11 (gap 1) vs Dec 1 (before the Dec 10 transaction).
    const r = withRow("Dec. 10Dec. 1124 HOUR FITNESS SPRINGFIELD ON45.67");
    expect(r.problems).toEqual([]);
    expect(swapped(r)).toMatchObject({
      transDate: "2025-12-10",
      postingDate: "2025-12-11",
      description: "24 HOUR FITNESS SPRINGFIELD ON",
    });
  });

  it("24 HOUR FITNESS: only the one-digit reading is in window", () => {
    // Jan 22 (gap 20, outside the window) vs Jan 2 (gap 0).
    const r = withRow("Jan. 2Jan. 224 HOUR FITNESS SPRINGFIELD ON45.67");
    expect(r.problems).toEqual([]);
    expect(swapped(r)).toMatchObject({
      transDate: "2026-01-02",
      postingDate: "2026-01-02",
      description: "24 HOUR FITNESS SPRINGFIELD ON",
    });
  });

  it("both readings in window: takes the two-digit day and records a problem", () => {
    // Jan 10 (gap 9) + "9 LIVES PET SHOP" vs Jan 1 (gap 0) + "09 LIVES PET SHOP".
    const r = withRow("Jan. 1Jan. 109 LIVES PET SHOP SPRINGFIELD ON45.67");
    expect(swapped(r)).toMatchObject({
      transDate: "2026-01-01",
      postingDate: "2026-01-10",
      description: "9 LIVES PET SHOP SPRINGFIELD ON",
    });
    expect(r.problems).toHaveLength(1);
    expect(r.problems[0]).toContain("row 2 (Jan 1)");
    expect(r.problems[0]).toContain("posting day is ambiguous");
    expect(r.problems[0]).toContain("2026-01-10");
    expect(r.problems[0]).toContain("2026-01-01");
  });
});

describe("preparseStatementText: BMO Everyday Banking", () => {
  const result = preparseStatementText(bankText());

  it("splits the PDF into one statement per account section", () => {
    expect(result.layout).toBe("bmo_everyday");
    expect(result.problems).toEqual([]);
    expect(result.statements.map((s) => [s.source, s.accountType])).toEqual([
      ["BMO Primary Chequing 5678-901", "chequing"],
      ["BMO Premium Rate Savings 5678-555", "savings"],
    ]);
  });

  it("carries the summary figures and period", () => {
    expect(result.statements[0]).toMatchObject({
      statementDate: "2026-03-05",
      periodStart: "2026-02-06",
      periodEnd: "2026-03-05",
      previousBalance: 1000,
      purchasesTotal: 2734.5,
      paymentsCredits: 2150,
      totalBalance: 415.5,
    });
    expect(result.statements[1]).toMatchObject({
      previousBalance: 5000,
      purchasesTotal: 14,
      paymentsCredits: 1501.66,
      totalBalance: 6487.66,
    });
  });

  it("recovers direction and amount from the running balance", () => {
    const chq = result.statements[0].entries;
    expect(chq.map((e) => [e.amount, e.isCredit])).toEqual([
      [2000, true],
      [684.91, false], // card number digits glued to the amount
      [1049.59, false], // thousands comma
      [150, true],
      [1000, false],
    ]);
    expect(chq[1]).toEqual({
      transDate: "2026-02-12",
      postingDate: "2026-02-12",
      description: "Online Transfer, TF 00011112222333344445555",
      amount: 684.91,
      isCredit: false,
      category: "Other",
    });
    const sav = result.statements[1].entries;
    expect(sav.map((e) => [e.description, e.amount, e.isCredit])).toEqual([
      ["Online Transfer, TF 0001#9999-555", 1500, true],
      ["Interest Earned", 1.66, true],
      ["INTERAC e-Transfer Sent", 14, false],
    ]);
  });

  it("restores readable spacing on glued descriptions", () => {
    const descs = result.statements[0].entries.map((e) => e.description);
    expect(descs).toContain("Direct Deposit, 99887766 EXAMPLECORP/PAY");
    expect(descs).toContain("INTERAC e-Transfer Received");
  });

  it("produces statements validateStatement accepts", () => {
    for (const s of result.statements) {
      expect(validateStatement(s).problems).toEqual([]);
    }
  });

  it("flags closing totals that do not match the extracted rows", () => {
    const bad = bankText().replace("Mar05Closingtotals2,734.502,150.00", "Mar05Closingtotals2,734.512,150.00");
    const r = preparseStatementText(bad);
    expect(r.problems).toContain(
      "BMO Primary Chequing 5678-901: amounts deducted sum 2734.50 does not match the closing totals 2734.51"
    );
  });

  it("flags a running balance that does not end at the printed closing balance", () => {
    const bad = bankText().replace("#12345678-9011,000.002,734.502,150.00415.50", "#12345678-9011,000.002,734.502,150.00415.55");
    const r = preparseStatementText(bad);
    expect(r.problems.some((p) => p.includes("running balance ends at 415.50, not the closing balance 415.55"))).toBe(true);
  });

  it("flags a row with no split that fits the balance chain", () => {
    const bad = bankText().replace("Feb15INTERACe-TransferSent1,049.591,265.50", "Feb15INTERACe-TransferSent1,049.591,265.40");
    const r = preparseStatementText(bad);
    expect(r.problems).toContain(
      "BMO Primary Chequing 5678-901 row on Feb 15: no split of the amount fits the running balance"
    );
  });

  it("flags an ambiguous split instead of guessing", () => {
    // Blank balance on one row: +10/-10 and -10/+10 both reach 1,000.00.
    const bad = bankText()
      .replace("Feb10DirectDeposit,99887766EXAMPLECORP/PAY2,000.003,000.00", "Feb10INTERACe-TransferReceived10.00")
      .replace("Feb12OnlineTransfer,TF00011112222333344445555684.912,315.09", "Feb12INTERACe-TransferSent10.001,000.00");
    const r = preparseStatementText(bad);
    expect(r.problems).toContain(
      "BMO Primary Chequing 5678-901 row on Feb 12: more than one split of the amount fits the running balance"
    );
  });
});
